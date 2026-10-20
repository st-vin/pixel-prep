import { describe, expect, it } from 'vitest';
import {
  dimensionsFromAxis,
  extensionFor,
  formatBytes,
  isFormatCompatible,
  isValidHex,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_PIXELS,
  validateDimensions,
  validateImageFile,
  validateRemovalDimensions,
} from './types';

function imageFile(type: string, size = 12): File {
  return { type, size, name: 'input' } as File;
}

describe('image input validation', () => {
  it('accepts supported MIME types and rejects unsupported or oversized files', () => {
    expect(validateImageFile(imageFile('image/png'))).toBe('');
    expect(validateImageFile(imageFile('image/jpeg'))).toBe('');
    expect(validateImageFile(imageFile('image/webp'))).toBe('');
    expect(validateImageFile(imageFile('image/gif'))).toMatch(/PNG, JPEG, or WebP/);
    expect(validateImageFile(imageFile('image/png', MAX_INPUT_BYTES + 1))).toMatch(/larger than/);
  });

  it('validates target dimensions and enforces the browser canvas limit', () => {
    expect(validateDimensions(1200, 800)).toBe('');
    expect(validateDimensions(0, 800)).toMatch(/positive whole pixels/);
    expect(validateDimensions(Number.NaN, 800)).toMatch(/positive whole pixels/);
    expect(validateDimensions(16385, 1)).toMatch(/side must be/);
    expect(validateDimensions(15000, 2001)).toMatch(/pixels/);
  });

  it('limits model inference without silently changing the requested size', () => {
    expect(validateRemovalDimensions(4000, 3000)).toBe('');
    expect(validateRemovalDimensions(5000, 3000)).toMatch(/limited to/);
    expect(validateRemovalDimensions(0, 200)).toMatch(/dimensions could not be read/);
  });
});

describe('output settings', () => {
  it('preserves aspect ratio when changing either dimension', () => {
    expect(dimensionsFromAxis('width', 800, 1200, 800, 1200, 800, true))
      .toEqual({ width: 800, height: 533 });
    expect(dimensionsFromAxis('height', 400, 1200, 800, 1200, 800, true))
      .toEqual({ width: 600, height: 400 });
  });

  it('keeps the other dimension unchanged when aspect ratio is unlocked', () => {
    expect(dimensionsFromAxis('width', 800, 1200, 800, 1200, 800, false))
      .toEqual({ width: 800, height: 800 });
  });

  it('requires an opaque background for JPEG and preserves transparency for PNG/WebP', () => {
    expect(isFormatCompatible('image/jpeg', 'transparent')).toBe(false);
    expect(isFormatCompatible('image/jpeg', 'white')).toBe(true);
    expect(isFormatCompatible('image/png', 'transparent')).toBe(true);
    expect(isFormatCompatible('image/webp', 'transparent')).toBe(true);
  });

  it('validates six-digit hex colors and formats extensions and sizes', () => {
    expect(isValidHex('#DCE9E2')).toBe(true);
    expect(isValidHex('#fff')).toBe(false);
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });
});
