import { useEffect, useRef } from "react";
import { signedColor } from "../lib/fields/colormap";
import { previewValue } from "../lib/fields/modulation";

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
 * @param {{min:number,max:number}} [props.range] - device-level output range; each
 *   sampled value is affine-remapped through it before coloring, so the heatmap
 *   reflects attract-only ({0,1}, loses blue) / repel-only ({-1,0}, loses red).
 * @param {number} [props.offset=0] - device-level bias, added AFTER the range
 *   remap (same order as modulationTransfer). Lets the readout show the live
 *   bias where offset affects output; callers pass 0 where it doesn't, so the
 *   preview never shows a bias the plot won't honor. Default 0 = no bias.
 */
export default function FieldOverlay({
  field,
  canvasW,
  canvasH,
  opacity = 0.85,
  range = { min: -1, max: 1 },
  offset = 0,
}) {
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
        const c = signedColor(
          previewValue(field.signedAt(i, j), { offset, range })
        );
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
    // Depend on range.min/max (not the object identity) so the heatmap recolors
    // as the range thumbs move, without re-running on unrelated re-renders.
    // `offset` is a primitive, so its identity is stable across renders.
  }, [field, canvasW, canvasH, opacity, range.min, range.max, offset]);

  return (
    <canvas
      ref={ref}
      data-testid="field-overlay"
      className="absolute inset-0"
      style={{ pointerEvents: "none", width: canvasW, height: canvasH }}
    />
  );
}
