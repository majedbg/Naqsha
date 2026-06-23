import { useEffect, useRef } from "react";
import { signedColor } from "../lib/fields/colormap";

/**
 * FieldOverlay — read-only heatmap of a ScalarField, composited over the p5
 * canvas. A sibling of the p5 surface inside RightPanel's scaled wrapper, so it
 * shares the artwork coordinate space and inherits scale(finalScale).
 *
 * Rendering: paint the field at GRID resolution into a tiny offscreen canvas
 * (one pixel per grid sample), then upscale it to the artboard with bilinear
 * smoothing. That upscale is what gives the smooth, continuous "surface" look —
 * and the same grid buffer (field.data) is what a future 3D height-surface
 * preview will consume as vertex z-heights.
 *
 * Pointer-transparent and never drawn into export — purely a preview lens.
 *
 * @param {object} props
 * @param {import('../lib/fields/ScalarField').ScalarField} props.field
 * @param {number} props.canvasW
 * @param {number} props.canvasH
 * @param {number} [props.opacity=0.85] - overall overlay opacity, 0–1
 */
export default function FieldOverlay({ field, canvasW, canvasH, opacity = 0.85 }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !field) return;

    const { nx, ny } = field;

    // 1) Paint the field at grid resolution into an offscreen buffer.
    const tmp = document.createElement("canvas");
    tmp.width = nx;
    tmp.height = ny;
    const tctx = tmp.getContext("2d");
    const img = tctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = signedColor(field.signedAt(i, j));
        const o = (j * nx + i) * 4;
        img.data[o] = c.r;
        img.data[o + 1] = c.g;
        img.data[o + 2] = c.b;
        img.data[o + 3] = Math.round(c.a * opacity * 255);
      }
    }
    tctx.putImageData(img, 0, 0);

    // 2) Upscale smoothly to artboard size.
    cv.width = canvasW;
    cv.height = canvasH;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tmp, 0, 0, canvasW, canvasH);
  }, [field, canvasW, canvasH, opacity]);

  return (
    <canvas
      ref={ref}
      data-testid="field-overlay"
      className="absolute inset-0"
      style={{ pointerEvents: "none", width: canvasW, height: canvasH }}
    />
  );
}
