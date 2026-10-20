import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  ArrowDownToLine, Check, FileImage, ImagePlus, Link2, LockKeyhole, RotateCcw,
  ScanLine, ShieldCheck, Sparkles, Upload,
} from './components/PixelPrepIcon';
import { encodeImage, imageFromFile } from './features/image-prep/encodeImage';
import {
  dimensionsFromAxis, extensionFor, formatBytes, formatName, isFormatCompatible,
  isValidHex, MAX_DIMENSION, MAX_OUTPUT_PIXELS, mimeIsSupported,
  validateDimensions, validateImageFile, validateRemovalDimensions,
  type BackgroundMode, type ImageFormat, type OutputSettings, type SourceImage,
} from './features/image-prep/types';
import { removeBackground, type RemovalStage } from './features/background-removal/removeBackground';

const FORMATS: ImageFormat[] = ['image/png', 'image/jpeg', 'image/webp'];
type RemovalStatus = 'idle' | 'processing' | 'ready' | 'error';

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const encodeVersionRef = useRef(0);
  const workspaceVersionRef = useRef(0);
  const removalAbortRef = useRef<AbortController | null>(null);
  const [source, setSource] = useState<SourceImage | null>(null);
  const [foreground, setForeground] = useState<ImageBitmap | null>(null);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('transparent');
  const [customColor, setCustomColor] = useState('#dce9e2');
  const [colorText, setColorText] = useState('#DCE9E2');
  const [settings, setSettings] = useState<OutputSettings>({
    width: 0, height: 0, aspectLocked: true, format: 'image/png', quality: 0.88,
  });
  const [removalStatus, setRemovalStatus] = useState<RemovalStatus>('idle');
  const [removalStage, setRemovalStage] = useState<RemovalStage>('model');
  const [removalError, setRemovalError] = useState('');
  const [fileError, setFileError] = useState('');
  const [dimensionError, setDimensionError] = useState('');
  const [encodeError, setEncodeError] = useState('');
  const [encodedBlob, setEncodedBlob] = useState<Blob | null>(null);
  const [encodedUrl, setEncodedUrl] = useState('');
  const [encoding, setEncoding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [availableFormats, setAvailableFormats] = useState<Record<ImageFormat, boolean>>({
    'image/png': true, 'image/jpeg': true, 'image/webp': true,
  });

  useEffect(() => {
    setAvailableFormats({
      'image/png': mimeIsSupported('image/png'),
      'image/jpeg': mimeIsSupported('image/jpeg'),
      'image/webp': mimeIsSupported('image/webp'),
    });
  }, []);

  useEffect(() => {
    if (!encodedBlob) {
      setEncodedUrl('');
      return;
    }
    const url = URL.createObjectURL(encodedBlob);
    setEncodedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [encodedBlob]);

  useEffect(() => () => {
    workspaceVersionRef.current += 1;
    removalAbortRef.current?.abort();
    removalAbortRef.current = null;
    if (source?.objectUrl) URL.revokeObjectURL(source.objectUrl);
  }, [source]);

  useEffect(() => () => foreground?.close(), [foreground]);

  const chooseFile = useCallback(async (file?: File) => {
    if (!file) return;
    const selectionId = ++workspaceVersionRef.current;
    removalAbortRef.current?.abort();
    removalAbortRef.current = null;
    setRemovalStatus((current) => current === 'processing' ? 'idle' : current);
    setFileError('');
    const validationError = validateImageFile(file);
    if (validationError) {
      setFileError(validationError);
      return;
    }
    try {
      const decoded = await imageFromFile(file);
      if (selectionId !== workspaceVersionRef.current) {
        URL.revokeObjectURL(decoded.objectUrl);
        return;
      }
      setSource({
        file, image: decoded.image, objectUrl: decoded.objectUrl,
        width: decoded.image.naturalWidth, height: decoded.image.naturalHeight,
      });
      setForeground(null);
      setBackgroundMode('transparent');
      setRemovalStatus('idle');
      setRemovalError('');
      setSettings((current) => ({
        ...current, width: decoded.image.naturalWidth, height: decoded.image.naturalHeight,
      }));
      setDimensionError('');
      setEncodeError('');
      setEncodedBlob(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (decoded.image.naturalWidth * decoded.image.naturalHeight > MAX_OUTPUT_PIXELS) {
        setDimensionError(`This image is larger than the ${MAX_OUTPUT_PIXELS.toLocaleString()}-pixel output limit. Reduce its dimensions before exporting.`);
      }
    } catch (error) {
      if (selectionId === workspaceVersionRef.current) {
        setFileError(error instanceof Error ? error.message : 'The selected image could not be opened.');
      }
    }
  }, []);

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    void chooseFile(file);
  };

  const reset = () => {
    if (source && !window.confirm('Discard the current image and settings? This clears the work from this tab.')) return;
    workspaceVersionRef.current += 1;
    encodeVersionRef.current += 1;
    removalAbortRef.current?.abort();
    removalAbortRef.current = null;
    setSource(null);
    setForeground(null);
    setBackgroundMode('transparent');
    setCustomColor('#dce9e2');
    setColorText('#DCE9E2');
    setRemovalStatus('idle');
    setRemovalStage('model');
    setRemovalError('');
    setFileError('');
    setDimensionError('');
    setEncodeError('');
    setEncodedBlob(null);
    setSettings({ width: 0, height: 0, aspectLocked: true, format: 'image/png', quality: 0.88 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const remove = async () => {
    if (!source || removalStatus === 'processing') return;
    const removalIssue = validateRemovalDimensions(source.width, source.height);
    if (removalIssue) {
      setRemovalStatus('error');
      setRemovalError(removalIssue);
      return;
    }
    const sourceAtStart = source;
    const operationId = workspaceVersionRef.current;
    const controller = new AbortController();
    removalAbortRef.current = controller;
    setRemovalStatus('processing');
    setRemovalStage('model');
    setRemovalError('');
    try {
      const result = await removeBackground(sourceAtStart.image, ({ stage }) => {
        if (operationId === workspaceVersionRef.current) setRemovalStage(stage);
      }, controller.signal);
      if (operationId !== workspaceVersionRef.current) {
        result.close();
        return;
      }
      if (result.width !== sourceAtStart.width || result.height !== sourceAtStart.height) {
        result.close();
        throw new Error('The background model returned unexpected dimensions. No result was applied.');
      }
      setForeground(result);
      setRemovalStatus('ready');
      setEncodedBlob(null);
    } catch (error) {
      if (controller.signal.aborted || operationId !== workspaceVersionRef.current) return;
      setRemovalStatus('error');
      setRemovalError(error instanceof Error ? error.message : 'Background removal could not finish.');
    } finally {
      if (removalAbortRef.current === controller) removalAbortRef.current = null;
    }
  };

  const setDimension = (axis: 'width' | 'height', value: string) => {
    const number = value === '' ? 0 : Number(value);
    const { width, height } = source
      ? dimensionsFromAxis(axis, number, settings.width, settings.height, source.width, source.height, settings.aspectLocked)
      : { width: axis === 'width' ? number : settings.width, height: axis === 'height' ? number : settings.height };
    setSettings((current) => ({ ...current, width, height }));
    setDimensionError(validateDimensions(width, height));
    setEncodeError('');
  };

  const toggleAspect = (checked: boolean) => {
    let width = settings.width;
    let height = settings.height;
    if (checked && source && width > 0 && height > 0) {
      height = Math.max(1, Math.round(width / (source.width / source.height)));
    }
    setSettings((current) => ({ ...current, aspectLocked: checked, width, height }));
    setDimensionError(validateDimensions(width, height));
  };

  const resetDimensions = () => {
    if (!source) return;
    setSettings((current) => ({
      ...current, width: source.width, height: source.height, aspectLocked: true,
    }));
    setDimensionError('');
  };

  const setFormat = (format: ImageFormat) => {
    if (!availableFormats[format]) return;
    if (!isFormatCompatible(format, backgroundMode)) {
      setEncodeError('JPEG cannot store transparency. Choose white or a custom background before selecting JPEG.');
      return;
    }
    setSettings((current) => ({ ...current, format }));
    setEncodeError('');
  };

  const setBackground = (mode: BackgroundMode) => {
    if (mode === 'transparent' && settings.format === 'image/jpeg') {
      setEncodeError('JPEG cannot store transparency. Select PNG or WebP first, then choose transparent.');
      return;
    }
    setBackgroundMode(mode);
    setEncodeError('');
  };

  const changeHexText = (value: string) => {
    const normalized = value.startsWith('#') ? value : `#${value}`;
    setColorText(normalized.toUpperCase());
    if (isValidHex(normalized)) {
      setCustomColor(normalized);
      setEncodeError('');
    }
  };

  const dimensionIssue = source ? validateDimensions(settings.width, settings.height) : '';
  const colorIssue = backgroundMode === 'custom' && !isValidHex(colorText);
  const sizeComparison = source && encodedBlob
    ? (() => {
        const change = source.file.size - encodedBlob.size;
        if (change === 0) return 'Same size as original';
        const percent = Math.round((Math.abs(change) / source.file.size) * 100);
        return `${formatBytes(Math.abs(change))} ${change > 0 ? 'smaller' : 'larger'} (${percent}%)`;
      })()
    : '—';

  useEffect(() => {
    const version = ++encodeVersionRef.current;
    if (!source || dimensionIssue || colorIssue) {
      setEncodedBlob(null);
      setEncoding(false);
      setEncodeError('');
      return;
    }
    if (settings.format === 'image/jpeg' && backgroundMode === 'transparent') {
      setEncodedBlob(null);
      setEncoding(false);
      setEncodeError('Choose an opaque background before exporting JPEG.');
      return;
    }
    setEncoding(true);
    setEncodeError('');
    const timer = window.setTimeout(() => {
      void encodeImage({
        source: source.image,
        foreground,
        width: settings.width,
        height: settings.height,
        backgroundMode,
        customColor,
        format: settings.format,
        quality: settings.quality,
      }).then((blob) => {
        if (version !== encodeVersionRef.current) return;
        setEncodedBlob(blob);
        setEncoding(false);
      }).catch((error: unknown) => {
        if (version !== encodeVersionRef.current) return;
        setEncodedBlob(null);
        setEncoding(false);
        setEncodeError(error instanceof Error ? error.message : 'Could not encode this image.');
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [source, foreground, backgroundMode, customColor, colorIssue, settings.width, settings.height, settings.format, settings.quality, dimensionIssue]);

  const download = () => {
    if (!encodedBlob || !source) return;
    const base = source.file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'pixelprep-image';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(encodedBlob);
    link.download = `${base}.${extensionFor(settings.format)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    void chooseFile(event.dataTransfer.files[0]);
  };

  return (
    <div className={`app-shell${dragging ? ' drop-active' : ''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="PixelPrep home" data-testid="link-pixelprep-home">
          <span className="brand-mark"><ScanLine size={17} strokeWidth={2.2} /></span>
          <span>pixelprep</span>
        </a>
        <div className="privacy-pill" data-testid="status-local-processing">
          <span className="privacy-dot" />
          <LockKeyhole size={14} />
          <span>Your images stay on this device</span>
        </div>
      </header>

      <main className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow"><Sparkles size={13} /> Image workstation</p>
            <h1>Prepare it. Keep it yours.</h1>
            <p>Clean cutouts and dependable exports, right in your browser. Your image files are never uploaded.</p>
          </div>
        </div>

        <div className="workspace-grid">
          <section className="canvas-panel" aria-label="Image preview workspace">
            <div className="canvas-toolbar">
              <div className="toolbar-label"><FileImage size={15} /> Preview <span className="toolbar-meta">{source ? `${source.width} × ${source.height} px source` : 'Ready for an image'}</span></div>
              <div className="canvas-actions">
                {source && <button className="button button-quiet" type="button" onClick={reset} data-testid="button-reset"><RotateCcw size={14} /> Reset</button>}
                <button className="button" type="button" onClick={() => fileInputRef.current?.click()} data-testid="button-replace">
                  {source ? <ImagePlus size={14} /> : <Upload size={14} />}{source ? 'Replace' : 'Choose image'}
                </button>
                <input ref={fileInputRef} className="file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFileInput} data-testid="input-image-file" aria-label="Choose a PNG, JPEG, or WebP image" />
              </div>
            </div>

            <div className="preview-stage">
              {!source ? (
                <div className="preview-empty">
                  <div className="empty-icon"><ImagePlus size={24} strokeWidth={1.7} /></div>
                  <h2>A clear canvas, ready when you are</h2>
                  <p>Bring in a PNG, JPEG, or WebP. Preview, refine the output, and download a file sized exactly to your settings.</p>
                  <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-image"><Upload size={15} /> Select an image</button>
                  <span className="drop-hint">or drop an image anywhere in this window</span>
                  {fileError && <div className="error-box" role="alert" data-testid="error-file-selection">{fileError}</div>}
                </div>
              ) : (
                <div className="preview-pair" data-testid="preview-comparison">
                  <div className="preview-tile">
                    <div className="preview-tile-label"><span>Original</span><span>{formatBytes(source.file.size)}</span></div>
                    <div className="preview-image-wrap">
                      <img className="preview-img" src={source.objectUrl} alt={`Original image, ${source.width} by ${source.height} pixels`} data-testid="image-original-preview" />
                    </div>
                  </div>
                  <div className="preview-tile">
                    <div className="preview-tile-label"><span>Export preview</span><span>{encodedBlob ? formatBytes(encodedBlob.size) : encoding ? 'Encoding…' : '—'}</span></div>
                    <div className={`preview-image-wrap${backgroundMode !== 'transparent' ? ' is-result' : ''}`} style={backgroundMode === 'white' ? { background: '#fff' } : backgroundMode === 'custom' ? { background: customColor } : undefined}>
                      {encodedUrl && encodedBlob
                        ? <img className="preview-img" src={encodedUrl} alt={`Export preview, ${settings.width} by ${settings.height} pixels, ${formatName(settings.format)}`} data-testid="image-export-preview" />
                        : <div className="preview-status" role="status" data-testid="status-encoding">{encoding ? 'Updating preview…' : dimensionIssue || encodeError || 'Preview unavailable'}</div>}
                      {encoding && <div className="preview-loader" aria-live="polite">Updating export preview</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="canvas-footer">
              {source ? (
                <>
                  <div className="file-meta"><span className="file-meta-name" title={source.file.name} data-testid="text-source-filename">{source.file.name}</span><span className="file-meta-sep">·</span><span data-testid="text-source-dimensions">{source.width} × {source.height} px</span><span className="file-meta-sep">·</span><span data-testid="text-source-size">{formatBytes(source.file.size)}</span></div>
                  <span>{foreground ? 'Cutout ready' : 'Original foreground'}</span>
                </>
              ) : <span>PNG, JPEG, WebP · up to 16,384 px per side</span>}
            </div>
            {fileError && source && <div className="error-box" role="alert" style={{ margin: 12 }} data-testid="error-file-selection">{fileError}</div>}
          </section>

          <aside className="control-panel" aria-label="Image preparation settings">
            <div className="control-header">
              <h2>Output settings</h2>
              <p>Fine-tune the image you’ll take with you.</p>
            </div>
            <section className="control-section">
              <div className="section-title"><h3>Background removal</h3><span className="section-index">01</span></div>
              <button className={`button remove-button${foreground ? ' active' : ''}`} type="button" onClick={() => void remove()} disabled={!source || removalStatus === 'processing'} data-testid="button-remove-background">
                {removalStatus === 'ready' ? <Check size={15} /> : <Sparkles size={15} />}
                {removalStatus === 'processing' ? (removalStage === 'model' ? 'Loading model…' : 'Removing background…') : removalStatus === 'ready' ? 'Background removed' : 'Remove background'}
              </button>
              <p className="help-copy">{removalStatus === 'ready' ? 'Your cutout is separate from the original. Change settings without rerunning removal.' : removalStatus === 'processing' ? (removalStage === 'model' ? 'Loading ISNet from Hugging Face (about 46 MB on first use). Your image stays on this device.' : 'The model is processing your image on this device.') : 'ISNet runs locally in a background worker. Its ~46 MB model downloads from Hugging Face the first time; your image is never sent.'}</p>
              {removalError && <div className="error-box" role="alert" data-testid="error-background-removal">{removalError}</div>}
            </section>

            <section className="control-section">
              <div className="section-title"><h3>Canvas background</h3><span className="section-index">02</span></div>
              <div className="background-options" role="group" aria-label="Background color mode">
                {(['transparent', 'white', 'custom'] as BackgroundMode[]).map((mode) => (
                  <button key={mode} type="button" className={`option-chip${backgroundMode === mode ? ' selected' : ''}`} aria-pressed={backgroundMode === mode} onClick={() => setBackground(mode)} data-testid={`button-background-${mode}`}>
                    {mode === 'transparent' ? 'Transparent' : mode === 'white' ? 'White' : 'Custom'}
                  </button>
                ))}
              </div>
              {backgroundMode === 'custom' && <div className="custom-color-row">
                <label className="color-swatch" aria-label="Choose custom background color">
                  <input type="color" value={isValidHex(customColor) ? customColor : '#ffffff'} onChange={(event) => changeHexText(event.target.value)} data-testid="input-background-color" />
                </label>
                <input className="text-field" value={colorText} onChange={(event) => changeHexText(event.target.value)} aria-label="Custom background hex color" aria-invalid={!isValidHex(colorText)} data-testid="input-background-hex" />
              </div>}
              <p className="help-copy">{backgroundMode === 'transparent' ? 'Transparency is preserved in PNG and WebP. JPEG needs a solid background.' : 'The selected color is composited behind the foreground in your export.'}</p>
              {backgroundMode === 'custom' && !isValidHex(colorText) && <p className="validation-line" role="alert" data-testid="error-background-hex">Use a six-digit hex color, for example #DCE9E2.</p>}
            </section>

            <section className="control-section">
              <div className="section-title"><h3>Dimensions</h3><span className="section-index">03</span></div>
              <div className="dimensions-grid">
                <div className="dimension-field">
                  <label className="field-label" htmlFor="output-width">Width</label>
                  <input id="output-width" className="text-field" type="number" min="1" max={MAX_DIMENSION} step="1" value={settings.width || ''} onChange={(event) => setDimension('width', event.target.value)} disabled={!source} aria-invalid={Boolean(dimensionIssue)} data-testid="input-output-width" />
                  <span className="dimension-unit">px</span>
                </div>
                <div className="dimension-field">
                  <label className="field-label" htmlFor="output-height">Height</label>
                  <input id="output-height" className="text-field" type="number" min="1" max={MAX_DIMENSION} step="1" value={settings.height || ''} onChange={(event) => setDimension('height', event.target.value)} disabled={!source} aria-invalid={Boolean(dimensionIssue)} data-testid="input-output-height" />
                  <span className="dimension-unit">px</span>
                </div>
              </div>
              <div className="dimensions-tools">
                <label className="check-label"><input type="checkbox" checked={settings.aspectLocked} onChange={(event) => toggleAspect(event.target.checked)} disabled={!source} data-testid="checkbox-aspect-lock" /><Link2 size={13} /> Lock aspect ratio</label>
                <button className="button button-quiet" type="button" onClick={resetDimensions} disabled={!source} data-testid="button-reset-dimensions">Reset size</button>
              </div>
              {(dimensionIssue || dimensionError) && <p className="validation-line" role="alert" data-testid="error-dimensions">{dimensionIssue || dimensionError}</p>}
              <p className="help-copy">Original size is used by default. Larger dimensions may use more memory; nothing is silently downscaled.</p>
            </section>

            <section className="control-section">
              <div className="section-title"><h3>File format</h3><span className="section-index">04</span></div>
              <div className="format-row" role="group" aria-label="Output file format">
                {FORMATS.map((format) => {
                  const opaqueRequired = format === 'image/jpeg' && backgroundMode === 'transparent';
                  const unsupported = !availableFormats[format];
                  return <button key={format} type="button" className={`format-option${settings.format === format ? ' selected' : ''}`} aria-pressed={settings.format === format} disabled={opaqueRequired || unsupported} title={opaqueRequired ? 'Choose an opaque background to use JPEG.' : unsupported ? 'Encoding is not supported by this browser.' : undefined} onClick={() => setFormat(format)} data-testid={`button-format-${format.replace('image/', '')}`}>{formatName(format)}</button>;
                })}
              </div>
              {settings.format !== 'image/png' ? <div>
                <div className="quality-row"><label htmlFor="quality-control">Quality</label><output htmlFor="quality-control" data-testid="text-quality-value">{Math.round(settings.quality * 100)}%</output></div>
                <input id="quality-control" className="range-input" type="range" min="0.1" max="1" step="0.01" value={settings.quality} onChange={(event) => setSettings((current) => ({ ...current, quality: Number(event.target.value) }))} data-testid="input-quality" />
                <div className="quality-scale"><span>Smaller file</span><span>Higher detail</span></div>
              </div> : <p className="help-copy">PNG export is lossless. Its size depends on image content and the browser encoder; the quality slider does not apply.</p>}
              {FORMATS.some((format) => !availableFormats[format]) && <p className="help-copy">Unavailable formats are disabled because this browser cannot encode them.</p>}
            </section>

            <div className="export-area">
              <button className="button button-primary export-button" type="button" onClick={download} disabled={!source || !encodedBlob || encoding || Boolean(dimensionIssue) || colorIssue} data-testid="button-download">
                <ArrowDownToLine size={16} /> Download {formatName(settings.format)}
              </button>
              <div className="output-summary" aria-live="polite" data-testid="status-output-summary">
                <div className="summary-row"><span>Output</span><strong>{source ? `${formatName(settings.format)} · ${settings.width || '—'} × ${settings.height || '—'} px` : 'Waiting for image'}</strong></div>
                <div className="summary-row"><span>Original file</span><strong>{source ? formatBytes(source.file.size) : '—'}</strong></div>
                <div className="summary-row"><span>Encoded output</span><strong data-testid="text-encoded-output-size">{encoding ? 'Updating…' : encodedBlob ? `${formatBytes(encodedBlob.size)} (${encodedBlob.size.toLocaleString()} bytes)` : '—'}</strong></div>
                <div className="summary-row"><span>Size change</span><strong data-testid="text-size-change">{encoding ? 'Updating…' : sizeComparison}</strong></div>
              </div>
              {(encodeError || (settings.format === 'image/jpeg' && backgroundMode === 'transparent')) && <p className="validation-line" role="alert" data-testid="error-output">{encodeError || 'Choose an opaque background before exporting JPEG.'}</p>}
              <p className="notice-line"><ShieldCheck size={13} /> Files and derived pixels stay in this tab’s memory. Closing the tab clears them.</p>
            </div>
          </aside>
        </div>
        {dragging && <div className="drag-overlay" aria-hidden="true"><Upload size={22} /> Drop to open image</div>}
      </main>
    </div>
  );
}

export default App;
