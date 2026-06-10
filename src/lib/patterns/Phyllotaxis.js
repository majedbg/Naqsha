import { applySymmetryDraw } from './symmetryUtils';
import { Pattern } from './drawingContext';

export default class Phyllotaxis extends Pattern {
  generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    this._elements = [];
    ctx.randomSeed(seed);

    const {
      count = 300,
      angle = 137.508,
      spacing = 4,
      minSize = 2,
      maxSize = 12,
      sizeGrowth = 0.5,
      shape = 'circle',
      fillMode = 'outline',
      rotation = 0,
      strokeWeight = 0.8,
      jitter = 0,
      symmetry = 1,
      startAngle = 0,
      offsetX = 0,
      offsetY = 0,
    } = params;

    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const angleRad = (angle * Math.PI) / 180;
    const rotRad = (rotation * Math.PI) / 180;
    const isFilled = fillMode === 'fill' || fillMode === 'both';
    const isOutlined = fillMode === 'outline' || fillMode === 'both';

    for (let i = 0; i < count; i++) {
      const t = i / Math.max(count - 1, 1); // 0..1
      const r = spacing * Math.sqrt(i);
      const theta = i * angleRad;

      let x = r * Math.cos(theta);
      let y = r * Math.sin(theta);

      // Jitter
      if (jitter > 0) {
        x += ctx.random(-jitter, jitter);
        y += ctx.random(-jitter, jitter);
      }

      // Size: interpolate from minSize to maxSize with growth curve
      const size = minSize + (maxSize - minSize) * Math.pow(t, Math.max(0.01, sizeGrowth));

      // Per-element rotation: base rotation + spiral angle
      const elemRot = rotRad + theta;

      this._elements.push({ x, y, size, elemRot, shape, isFilled, isOutlined, strokeWeight });

      // Build SVG element
      const svgEl = buildSVGShape(shape, x, y, size, elemRot, strokeWeight, color, isFilled, isOutlined);
      this.svgElements.push(svgEl);
    }

    // Draw on canvas
    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = ctx.color(color);
      c.setAlpha(alpha);

      for (const el of this._elements) {
        if (el.isOutlined) {
          ctx.stroke(c);
          ctx.strokeWeight(el.strokeWeight);
        } else {
          ctx.noStroke();
        }

        if (el.isFilled) {
          const fc = ctx.color(color);
          fc.setAlpha(alpha);
          ctx.fill(fc);
        } else {
          ctx.noFill();
        }

        ctx.push();
        ctx.translate(el.x, el.y);
        ctx.rotate(el.elemRot);
        drawShape(ctx, el.shape, el.size);
        ctx.pop();
      }
    };

    applySymmetryDraw(ctx, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }
}

// --- ctx shape drawing ---

function drawShape(ctx, shape, size) {
  const half = size / 2;
  switch (shape) {
    case 'circle':
      ctx.ellipse(0, 0, size, size);
      break;
    case 'square':
      ctx.rectMode(ctx.CENTER);
      ctx.rect(0, 0, size, size);
      break;
    case 'triangle': {
      const h = half * Math.sqrt(3);
      ctx.triangle(0, -h * 0.67, -half, h * 0.33, half, h * 0.33);
      break;
    }
    case 'hexagon': {
      ctx.beginShape();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        ctx.vertex(half * Math.cos(a), half * Math.sin(a));
      }
      ctx.endShape(ctx.CLOSE);
      break;
    }
    case 'star': {
      ctx.beginShape();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? half : half * 0.4;
        ctx.vertex(r * Math.cos(a), r * Math.sin(a));
      }
      ctx.endShape(ctx.CLOSE);
      break;
    }
    default:
      ctx.ellipse(0, 0, size, size);
  }
}

// --- SVG shape building ---

function buildSVGShape(shape, x, y, size, elemRot, strokeWeight, color, isFilled, isOutlined) {
  const half = size / 2;
  const rotDeg = (elemRot * 180) / Math.PI;
  const transform = `transform="translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${rotDeg.toFixed(2)})"`;
  const fill = isFilled ? `fill="${color}"` : 'fill="none"';
  const stroke = isOutlined ? `stroke="${color}" stroke-width="${strokeWeight}"` : 'stroke="none"';

  switch (shape) {
    case 'circle':
      return `<circle cx="0" cy="0" r="${half.toFixed(2)}" ${fill} ${stroke} ${transform}/>`;

    case 'square':
      return `<rect x="${(-half).toFixed(2)}" y="${(-half).toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" ${fill} ${stroke} ${transform}/>`;

    case 'triangle': {
      const h = half * Math.sqrt(3);
      const pts = `${(0).toFixed(2)},${(-h * 0.67).toFixed(2)} ${(-half).toFixed(2)},${(h * 0.33).toFixed(2)} ${half.toFixed(2)},${(h * 0.33).toFixed(2)}`;
      return `<polygon points="${pts}" ${fill} ${stroke} ${transform}/>`;
    }

    case 'hexagon': {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(`${(half * Math.cos(a)).toFixed(2)},${(half * Math.sin(a)).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}" ${fill} ${stroke} ${transform}/>`;
    }

    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? half : half * 0.4;
        pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}" ${fill} ${stroke} ${transform}/>`;
    }

    default:
      return `<circle cx="0" cy="0" r="${half.toFixed(2)}" ${fill} ${stroke} ${transform}/>`;
  }
}
