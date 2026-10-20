export type ImageFormat = 'image/png' | 'image/jpeg' | 'image/webp';
export type BackgroundMode = 'transparent' | 'white' | 'custom';

export interface OutputSettings {
  width: number;
  height: number;
  aspectLocked: boolean;
  format: ImageFormat;
  quality: number;
}

export interface SourceImage {
  file: File;
  image: HTMLImageElement;
  width: number;
  height: number;
  objectUrl: string;
}

export const MAX_DIMENSION = 16384;
export const MAX_OUTPUT_PIXELS = 30_000_000;
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_REMOVAL_PIXELS = 12_000_000;

export function formatName(format: ImageFormat): string {
  return format === 'image/jpeg' ? 'JPEG' : format === 'image/webp' ? 'WebP' : 'PNG';
}

export function extensionFor(format: ImageFormat): string {
  return format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isSupportedImage(file: File): boolean {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type.toLowerCase());
}

export function validateImageFile(file: File): string {
  if (!isSupportedImage(file)) {
    return 'Choose a PNG, JPEG, or WebP image. Other file types are not accepted.';
  }
  if (file.size > MAX_INPUT_BYTES) {
    return `This file is larger than ${formatBytes(MAX_INPUT_BYTES)}. Choose a smaller image to avoid exhausting browser memory.`;
  }
  return '';
}

export function validateDimensions(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return 'Width and height must be positive whole pixels.';
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return `Each side must be ${MAX_DIMENSION.toLocaleString()} px or smaller.`;
  }
  if (width * height > MAX_OUTPUT_PIXELS) {
    return `Output is too large for a reliable browser canvas. Keep the total under ${MAX_OUTPUT_PIXELS.toLocaleString()} pixels.`;
  }
  return '';
}

export function validateRemovalDimensions(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return 'The image dimensions could not be read.';
  }
  if (width * height > MAX_REMOVAL_PIXELS) {
    return `Background removal is limited to ${MAX_REMOVAL_PIXELS.toLocaleString()} pixels to protect browser memory. The image is still available for resizing and conversion; no smaller substitute will be processed.`;
  }
  return '';
}

export function dimensionsFromAxis(
  axis: 'width' | 'height',
  requestedValue: number,
  currentWidth: number,
  currentHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  aspectLocked: boolean,
): { width: number; height: number } {
  let width = axis === 'width' ? requestedValue : currentWidth;
  let height = axis === 'height' ? requestedValue : currentHeight;
  if (axis === 'width' && aspectLocked && requestedValue > 0) {
    height = Math.max(1, Math.round((requestedValue * sourceHeight) / sourceWidth));
  } else if (axis === 'height' && aspectLocked && requestedValue > 0) {
    width = Math.max(1, Math.round((requestedValue * sourceWidth) / sourceHeight));
  }
  return { width, height };
}

export function isFormatCompatible(format: ImageFormat, background: BackgroundMode): boolean {
  return format !== 'image/jpeg' || background !== 'transparent';
}

export function isValidHex(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

export function mimeIsSupported(format: ImageFormat): boolean {
  const canvas = document.createElement('canvas');
  try {
    return canvas.toDataURL(format).startsWith(`data:${format}`);
  } catch {
    return false;
  }
}
