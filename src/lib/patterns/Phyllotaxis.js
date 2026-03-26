import { applySymmetryDraw, wrapSVGSymmetry } from './symmetryUtils';

export default class Phyllotaxis {
  constructor() {
    this.svgElements = [];
    this._elements = [];
  }

  generate(p, seed, params, canvasW, canvasH, color, opacity) {
    this.svgElements = [];
    this._elements = [];
    p.randomSeed(seed);

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
        x += p.random(-jitter, jitter);
        y += p.random(-jitter, jitter);
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

    // Draw on p5 canvas
    const drawBase = () => {
      const alpha = Math.round((opacity / 100) * 255);
      const c = p.color(color);
      c.setAlpha(alpha);

      for (const el of this._elements) {
        if (el.isOutlined) {
          p.stroke(c);
          p.strokeWeight(el.strokeWeight);
        } else {
          p.noStroke();
        }

        if (el.isFilled) {
          const fc = p.color(color);
          fc.setAlpha(alpha);
          p.fill(fc);
        } else {
          p.noFill();
        }

        p.push();
        p.translate(el.x, el.y);
        p.rotate(el.elemRot);
        drawShape(p, el.shape, el.size);
        p.pop();
      }
    };

    applySymmetryDraw(p, symmetry, cx, cy, drawBase, startAngle * Math.PI / 180, offsetX, offsetY);
  }

  toSVGGroup(layerId, color, opacity) {
    const content = this.svgElements.map((el) => `    ${el}`).join('\n');
    return wrapSVGSymmetry(
      layerId,
      color,
      opacity,
      content,
      this._lastParams?.symmetry || 1,
      this._lastCx,
      this._lastCy,
      this._lastParams?.startAngle || 0,
      this._lastParams?.offsetX || 0,
      this._lastParams?.offsetY || 0
    );
  }

  generateWithContext(p, seed, params, canvasW, canvasH, color, opacity) {
    this._lastParams = params;
    this._lastCx = canvasW / 2;
    this._lastCy = canvasH / 2;
    this.generate(p, seed, params, canvasW, canvasH, color, opacity);
  }
}

// --- p5 shape drawing ---

function drawShape(p, shape, size) {
  const half = size / 2;
  switch (shape) {
    case 'circle':
      p.ellipse(0, 0, size, size);
      break;
    case 'square':
      p.rectMode(p.CENTER);
      p.rect(0, 0, size, size);
      break;
    case 'triangle': {
      const h = half * Math.sqrt(3);
      p.triangle(0, -h * 0.67, -half, h * 0.33, half, h * 0.33);
      break;
    }
    case 'hexagon': {
      p.beginShape();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        p.vertex(half * Math.cos(a), half * Math.sin(a));
      }
      p.endShape(p.CLOSE);
      break;
    }
    case 'star': {
      p.beginShape();
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const r = i % 2 === 0 ? half : half * 0.4;
        p.vertex(r * Math.cos(a), r * Math.sin(a));
      }
      p.endShape(p.CLOSE);
      break;
    }
    default:
      p.ellipse(0, 0, size, size);
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
