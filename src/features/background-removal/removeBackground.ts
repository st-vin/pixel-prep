export type RemovalStage = 'model' | 'inference';

export interface RemoveBackgroundProgress {
  stage: RemovalStage;
  message: string;
}

interface WorkerStatusMessage {
  type: 'status';
  stage: RemovalStage;
  message: string;
}

interface WorkerResultMessage {
  type: 'result';
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

interface WorkerErrorMessage {
  type: 'error';
  message: string;
}

type WorkerResponse = WorkerStatusMessage | WorkerResultMessage | WorkerErrorMessage;

/**
 * Runs ISNet in a dedicated worker. The source bitmap is transferred locally;
 * only the pinned model file is fetched from Hugging Face.
 */
export async function removeBackground(
  source: HTMLImageElement,
  onProgress?: (progress: RemoveBackgroundProgress) => void,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new Error('This browser does not support the background-removal worker. Try an up-to-date version of Chrome, Edge, or Firefox.');
  }
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('This browser cannot process the image in a background worker. Your image is unchanged; use a recent desktop browser.');
  }

  const bitmap = await createImageBitmap(source);
  const worker = new Worker(
    new URL('./removeBackground.worker.ts', import.meta.url),
    { type: 'module', name: 'pixelprep-background-removal' },
  );

  return new Promise<ImageBitmap>((resolve, reject) => {
    let completed = false;
    let bitmapTransferred = false;
    const finish = (callback: () => void) => {
      if (completed) return;
      completed = true;
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      callback();
    };
    const onAbort = () => {
      if (!bitmapTransferred) bitmap.close();
      finish(() => reject(new DOMException('Background removal was canceled.', 'AbortError')));
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (completed) {
        if (message.type === 'result') message.bitmap.close();
        return;
      }
      if (message.type === 'status') {
        onProgress?.({ stage: message.stage, message: message.message });
        return;
      }
      if (message.type === 'error') {
        finish(() => reject(new Error(message.message)));
        return;
      }

      finish(() => resolve(message.bitmap));
    };

    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error('The local background model failed to start. Refresh the page and try again; the image was not uploaded.')));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      worker.postMessage({
        type: 'remove',
        bitmap,
        width: source.naturalWidth,
        height: source.naturalHeight,
      }, [bitmap]);
      bitmapTransferred = true;
    } catch {
      bitmap.close();
      finish(() => reject(new Error('The image could not be transferred to the local processing worker. Try a smaller file.')));
    }
  });
}
