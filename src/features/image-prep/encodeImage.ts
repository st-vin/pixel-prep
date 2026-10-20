import type { BackgroundMode, ImageFormat } from './types';
import { isValidHex } from './types';

export interface EncodeOptions {
  source: HTMLImageElement;
  foreground: CanvasImageSource | null;
  width: number;
  height: number;
  backgroundMode: BackgroundMode;
  customColor: string;
  format: ImageFormat;
  quality: number;
}

export function assertOutputMime(blob: Blob, format: ImageFormat): Blob {
  if (blob.type !== format) {
    throw new Error(`${format.replace('image/', '').toUpperCase()} encoding is unavailable in this browser.`);
  }
  return blob;
}

export function encodeImage(options: EncodeOptions): Promise<Blob> {
  const {
    source, foreground, width, height, backgroundMode, customColor, format, quality,
  } = options;
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      reject(new Error('This browser could not create an image canvas.'));
      return;
    }
    if (backgroundMode !== 'transparent') {
      context.fillStyle = backgroundMode === 'white' ? '#ffffff' : customColor;
      context.fillRect(0, 0, width, height);
    }
    if (format === 'image/jpeg' && backgroundMode === 'transparent') {
      reject(new Error('JPEG cannot store transparency. Choose white or a custom background first.'));
      return;
    }
    if (backgroundMode === 'custom' && !isValidHex(customColor)) {
      reject(new Error('Enter a valid six-digit hex color.'));
      return;
    }
    const imageSource: CanvasImageSource = foreground ?? source;
    context.drawImage(imageSource, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('The browser could not encode this image. Try smaller dimensions.'));
          return;
        }
        try {
          assertOutputMime(blob, format);
        } catch (error) {
          reject(error);
          return;
        }
        resolve(blob);
      },
      format,
      format === 'image/png' ? undefined : quality,
    );
  });
}

export function imageFromFile(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('This image could not be decoded. Try another PNG, JPEG, or WebP file.'));
    };
    image.src = objectUrl;
  });
}
