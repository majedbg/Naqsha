// imageIO — the DOM/canvas seam for the extraction flow (S0, issue #49).
//
// Everything that needs a real browser (FileReader, HTMLImageElement, canvas
// 2D) lives here so ExtractStepper stays component-testable in jsdom with
// this module mocked, and the pipeline itself stays pure (ImageData in).

/** File/Blob → data URL. */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** URL → decoded HTMLImageElement (natural size available). */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = url;
  });
}

/**
 * Crop a region of a decoded image to ImageData, downscaling so the longest
 * side is ≤ maxDim (keeps potrace fast and memory bounded).
 *
 * @param {HTMLImageElement} img
 * @param {{x:number,y:number,w:number,h:number}} rect natural-pixel crop
 * @param {number} [maxDim=1024]
 * @returns {{data: Uint8ClampedArray, width: number, height: number}}
 */
export function cropToImageData(img, rect, maxDim = 1024) {
  const scale = Math.min(1, maxDim / Math.max(rect.w, rect.h));
  const outW = Math.max(1, Math.round(rect.w * scale));
  const outH = Math.max(1, Math.round(rect.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, outW, outH);
  const { data } = ctx.getImageData(0, 0, outW, outH);
  return { data, width: outW, height: outH };
}

/**
 * Whole image → ImageData (S3, issue #52: the Flatten step warps the FULL
 * photo, so the source keeps more resolution than the trace-bound crops —
 * the rectified output is capped separately by the Rectifier's maxDim).
 */
export function imageToImageData(img, maxDim = 2048) {
  return cropToImageData(
    img,
    { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight },
    maxDim
  );
}

/**
 * ImageData-shaped object → PNG data URL (S3: displaying the rectified
 * raster and handing it back to the Select step as a normal image).
 */
export function imageDataToDataURL({ data, width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas.toDataURL('image/png');
}
