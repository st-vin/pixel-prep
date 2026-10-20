import { describe, expect, it } from 'vitest';
import { assertOutputMime } from './encodeImage';

describe('encoded output metadata', () => {
  it('accepts a blob only when its actual MIME type matches the selected format', () => {
    const png = new Blob(['pixels'], { type: 'image/png' });
    expect(assertOutputMime(png, 'image/png')).toBe(png);
    expect(() => assertOutputMime(png, 'image/webp')).toThrow(/WEBP encoding is unavailable/);
  });
});
