# PixelPrep

PixelPrep prepares product and profile images in your browser: remove the background, choose a transparent/white/custom backdrop, resize, convert between PNG/JPEG/WebP, adjust quality, and download the exact encoded result.

## Run on Windows

### Requirements

- Windows 10 or 11
- Node.js 22 LTS (22.12 or newer) with npm
- An internet connection for the first background-removal run
- A current version of Chrome or Microsoft Edge recommended

### Install and start

1. Install Node.js 22 LTS from [nodejs.org](https://nodejs.org/). Reopen PowerShell after installation.
2. Confirm Node.js and npm are available:

   ```powershell
   node --version
   npm --version
   ```

3. Install pnpm:

   ```powershell
   npm install --global pnpm@10
   pnpm --version
   ```

   If PowerShell cannot find `pnpm` immediately, close and reopen PowerShell.

4. Extract `PixelPrep-Windows-Source.zip`. In PowerShell, change to the extracted project folder (the folder containing `package.json`):

   ```powershell
   Set-Location "C:\path\to\PixelPrep-Windows-Source"
   ```

5. Install the project's dependencies:

   ```powershell
   pnpm install
   ```

6. Start the local development server:

   ```powershell
   pnpm dev
   ```

7. Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge.

Leave PowerShell open while using the app. Press **Ctrl+C** in that window to stop it.

### Run checks or build for hosting

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm preview
```

The production build is written to `dist`. It can be hosted on a static web host. The first `pnpm preview` run serves that build locally at `http://localhost:4173`.

## Using PixelPrep

1. Drop a PNG, JPEG, or WebP image into the preview area, or choose a file.
2. Select **Remove background**. The model loads on first use, then runs locally in a browser worker.
3. Select transparent, white, or a custom color for the output background.
4. Set dimensions (the aspect-ratio lock is on by default), output format, and quality.
5. Check the shown output dimensions and encoded file size, then download.

JPEG does not support transparency, so choose white or a custom color before exporting as JPEG. PNG preserves transparency. Quality controls apply to lossy JPEG/WebP output.

## Privacy and network use

- PixelPrep has no image-upload service, account system, analytics, or image storage.
- Your selected image and generated cutout stay in browser memory; image pixels are not sent to a server.
- On first background-removal use, the browser downloads a pinned model file (about 46 MB) from Hugging Face over HTTPS. Only the model is downloaded; the image is processed locally. The browser may contact that host again if its cache is cleared.
- Once the model is cached, background removal can run without another model download. Other app assets are served by the local development server or your static host.

## Limits and notes

- Input: PNG, JPEG, or WebP; up to 50 MB.
- Background removal: up to 12 million source pixels. Larger images remain available for resizing and format conversion; PixelPrep does not silently shrink them for inference.
- Output: each side up to 16,384 pixels and total dimensions up to 30 million pixels.
- Segmentation is a model estimate. Fine hair, transparent objects, motion blur, and cluttered backgrounds may need manual review in another editor.
- The browser, rather than a server encoder, produces the downloadable image. PixelPrep displays the size of the actual generated file.

## Model and dependency licenses

- Background segmentation weights: [ISNet General Use ONNX](https://huggingface.co/Ko033/isnet-general-use-onnx), pinned to revision `5349b617911fd60c619b52f32e2b593517b78df3`; the model repository declares Apache-2.0.
- Browser inference runtime: [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), MIT.
- Other dependencies retain the licenses declared by their respective upstream projects; see the package metadata in `package.json`.

The source ZIP intentionally excludes `node_modules` and the model weights. Dependencies are installed with `pnpm install`; the model is fetched on first use.
