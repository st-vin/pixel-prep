import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MAX_REMOVAL_PIXELS } from '../image-prep/types';

const MODEL_URL =
  'https://huggingface.co/Ko033/isnet-general-use-onnx/resolve/5349b617911fd60c619b52f32e2b593517b78df3/onnx/model_quantized.onnx';
ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;
const MODEL_INPUT_SIZE = 1024;

interface RemoveRequest {
  type: 'remove';
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

type WorkerMessage =
  | { type: 'status'; stage: 'model' | 'inference'; message: string }
  | { type: 'result'; width: number; height: number; bitmap: ImageBitmap }
  | { type: 'error'; message: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<RemoveRequest>) => void) | null;
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
  close(): void;
}

const workerScope = self as unknown as WorkerScope;
let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = 'error';
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      executionMode: 'sequential',
    });
  }
  return sessionPromise;
}

function fail(message: string, bitmap?: ImageBitmap): void {
  bitmap?.close();
  workerScope.postMessage({ type: 'error', message });
  workerScope.close();
}

workerScope.onmessage = async ({ data }) => {
  const { bitmap, width, height } = data;
  try {
    if (width < 1 || height < 1 || width * height > MAX_REMOVAL_PIXELS) {
      fail('Background removal is limited to 12 megapixels to protect browser memory. The image is still available for resizing and format conversion.', bitmap);
      return;
    }

    workerScope.postMessage({
      type: 'status',
      stage: 'model',
      message: 'Loading the local model (about 46 MB on first use)…',
    });
    const session = await getSession();

    workerScope.postMessage({
      type: 'status',
      stage: 'inference',
      message: 'Running background removal on this device…',
    });

    const modelCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const modelContext = modelCanvas.getContext('2d', { willReadFrequently: true });
    if (!modelContext) throw new Error('The browser could not create the model input canvas.');
    modelContext.drawImage(bitmap, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const modelPixels = modelContext.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE).data;
    const planeSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const inputData = new Float32Array(planeSize * 3);

    for (let i = 0; i < planeSize; i += 1) {
      const pixelOffset = i * 4;
      inputData[i] = modelPixels[pixelOffset] / 255 - 0.5;
      inputData[planeSize + i] = modelPixels[pixelOffset + 1] / 255 - 0.5;
      inputData[planeSize * 2 + i] = modelPixels[pixelOffset + 2] / 255 - 0.5;
    }

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) throw new Error('The downloaded model has an unexpected input/output format.');
    const inputTensor = new ort.Tensor('float32', inputData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    const outputs = await session.run({ [inputName]: inputTensor });
    const outputTensor = outputs[outputName];
    if (!outputTensor || outputTensor.data.length !== planeSize) {
      throw new Error('The model returned an unexpected mask. Please try another image or browser.');
    }

    const maskValues = outputTensor.data;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < maskValues.length; i += 1) {
      const value = Number(maskValues[i]);
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
    }
    const range = maximum - minimum;
    if (!Number.isFinite(range) || range < 0.00001) {
      throw new Error('The model did not produce a useful foreground mask for this image.');
    }

    const maskData = new Uint8ClampedArray(planeSize * 4);
    for (let i = 0; i < planeSize; i += 1) {
      const alpha = Math.round(((Number(maskValues[i]) - minimum) / range) * 255);
      const offset = i * 4;
      maskData[offset] = alpha;
      maskData[offset + 1] = alpha;
      maskData[offset + 2] = alpha;
      maskData[offset + 3] = alpha;
    }

    const maskCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskContext) throw new Error('The browser could not create the output mask.');
    maskContext.putImageData(new ImageData(maskData, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), 0, 0);

    const outputCanvas = new OffscreenCanvas(width, height);
    const outputContext = outputCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!outputContext) throw new Error('The browser could not allocate memory for the full-resolution result.');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(bitmap, 0, 0, width, height);
    outputContext.globalCompositeOperation = 'destination-in';
    outputContext.drawImage(maskCanvas, 0, 0, width, height);
    outputContext.globalCompositeOperation = 'source-over';
    bitmap.close();
    const resultBitmap = outputCanvas.transferToImageBitmap();
    workerScope.postMessage(
      { type: 'result', width, height, bitmap: resultBitmap },
      [resultBitmap],
    );
    workerScope.close();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = /fetch|network|load|failed/i.test(reason)
      ? 'The model could not be loaded. Check your connection and try again. Only model files are downloaded; your image is not sent anywhere.'
      : /memory|allocation|canvas|out of/i.test(reason)
        ? 'This image exceeded the memory available to your browser. Try a smaller image; no lower-resolution substitute was created.'
        : `Background removal failed: ${reason}`;
    fail(message, bitmap);
  }
};
