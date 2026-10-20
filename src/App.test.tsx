import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const canvasPrototype = HTMLCanvasElement.prototype;
const originalCanvasMethods = {
  getContext: Object.getOwnPropertyDescriptor(canvasPrototype, 'getContext'),
  toDataURL: Object.getOwnPropertyDescriptor(canvasPrototype, 'toDataURL'),
  toBlob: Object.getOwnPropertyDescriptor(canvasPrototype, 'toBlob'),
};
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

class TestImage {
  naturalWidth = 1600;
  naturalHeight = 1200;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:pixelprep-test'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(canvasPrototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({ fillRect: vi.fn(), drawImage: vi.fn() })),
  });
  Object.defineProperty(canvasPrototype, 'toDataURL', {
    configurable: true,
    value: vi.fn((type = 'image/png') => `data:${type};base64,`),
  });
  Object.defineProperty(canvasPrototype, 'toBlob', {
    configurable: true,
    value: vi.fn((callback: BlobCallback, type = 'image/png') => {
      callback(new Blob(['encoded'], { type }));
    }),
  });
  vi.stubGlobal('Image', TestImage);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [name, descriptor] of Object.entries(originalCanvasMethods)) {
    if (descriptor) Object.defineProperty(canvasPrototype, name, descriptor);
    else Reflect.deleteProperty(canvasPrototype, name);
  }
  if (originalCreateObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
  } else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
  } else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('PixelPrep workspace', () => {
  it('rejects unsupported image types with a clear message', async () => {
    render(createElement(App));
    const file = new File(['not an image'], 'animation.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByTestId('input-image-file'), { target: { files: [file] } });
    const error = await screen.findByTestId('error-file-selection');
    expect(error.textContent).toMatch(/PNG, JPEG, or WebP/);
  });

  it('loads an image, preserves its dimensions, and reports the exact encoded blob size', async () => {
    render(createElement(App));
    const file = new File(['source'], 'portrait.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('input-image-file'), { target: { files: [file] } });

    expect(await screen.findByTestId('image-original-preview')).toBeTruthy();
    expect(screen.getByTestId('text-source-dimensions').textContent).toContain('1600 × 1200');
    await waitFor(() => expect(screen.getByTestId('text-size-change').textContent).toContain('larger'));
    expect(await screen.findByTestId('image-export-preview')).toBeTruthy();
    expect(screen.getByTestId('text-encoded-output-size').textContent).toContain('7 bytes');
    expect(screen.getByTestId('status-output-summary').textContent).toContain('PNG · 1600 × 1200 px');
  });

  it('locks aspect ratio and clears the workspace on a confirmed reset', async () => {
    render(createElement(App));
    const file = new File(['source'], 'portrait.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('input-image-file'), { target: { files: [file] } });

    await screen.findByTestId('image-original-preview');
    const width = screen.getByTestId('input-output-width') as HTMLInputElement;
    const height = screen.getByTestId('input-output-height') as HTMLInputElement;
    fireEvent.change(width, { target: { value: '800' } });
    expect(height.value).toBe('600');

    fireEvent.click(screen.getByTestId('button-reset'));
    await waitFor(() => expect(screen.queryByTestId('image-original-preview')).toBeNull());
    expect(screen.getByText('Waiting for image')).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pixelprep-test');
  });
});
