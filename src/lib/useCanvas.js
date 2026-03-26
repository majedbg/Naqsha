import { useEffect, useRef, useCallback, useState } from 'react';
import p5 from 'p5';
import { getDynamicPatternClass } from './patternRegistry';
import Spirograph from './patterns/Spirograph';
import FlowField from './patterns/FlowField';
import Phyllotaxis from './patterns/Phyllotaxis';
import WaveInterference from './patterns/WaveInterference';
import VoronoiCells from './patterns/VoronoiCells';
import RecursiveGeometry from './patterns/RecursiveGeometry';
import PhyllotaxisDash from './patterns/PhyllotaxisDash';
import GrainField from './patterns/GrainField';
import FlowHatch from './patterns/FlowHatch';
import Feather from './patterns/Feather';
import TuringDash from './patterns/TuringDash';
import Duality from './patterns/Duality';
import RadialEtch from './patterns/RadialEtch';
import Grid from './patterns/Grid';
import Spiral from './patterns/Spiral';

const PATTERN_CLASSES = {
  spirograph: Spirograph,
  flowfield: FlowField,
  phyllotaxis: Phyllotaxis,
  wave: WaveInterference,
  voronoi: VoronoiCells,
  recursive: RecursiveGeometry,
  phyllodash: PhyllotaxisDash,
  grainfield: GrainField,
  flowhatch: FlowHatch,
  feather: Feather,
  turing: TuringDash,
  duality: Duality,
  radialetch: RadialEtch,
  grid: Grid,
  spiral: Spiral,
};

export default function useCanvas(containerRef, layers, canvasW, canvasH) {
  const p5Ref = useRef(null);
  const debounceRef = useRef(null);
  const [patternInstances, setPatternInstances] = useState({});
  const instancesRef = useRef({});

  const renderAll = useCallback(() => {
    if (!p5Ref.current) return;
    const p = p5Ref.current;
    p.clear();
    p.background(255);

    const newInstances = {};
    // Render bottom-to-top: last layer in array is bottom, first is top (front)
    // We iterate in reverse so bottom layers paint first
    const renderOrder = [...layers].reverse();
    for (const layer of renderOrder) {
      const PatternClass = PATTERN_CLASSES[layer.patternType] || getDynamicPatternClass(layer.patternType);
      if (!PatternClass) continue;
      const instance = new PatternClass();
      newInstances[layer.id] = instance;

      if (!layer.visible) {
        // Still generate for SVG export, but don't draw
        instance.generateWithContext(
          { ...createOffscreenProxy(p) },
          layer.seed,
          layer.params,
          canvasW,
          canvasH,
          layer.color,
          layer.opacity
        );
        continue;
      }

      // Draw layer background fill if bgOpacity > 0
      if (layer.bgOpacity > 0) {
        const bgAlpha = Math.round((layer.bgOpacity / 100) * 255);
        const bgC = p.color(layer.bgColor);
        bgC.setAlpha(bgAlpha);
        p.noStroke();
        p.fill(bgC);
        p.rect(0, 0, canvasW, canvasH);
      }

      instance.generateWithContext(p, layer.seed, layer.params, canvasW, canvasH, layer.color, layer.opacity);
    }
    instancesRef.current = newInstances;
    setPatternInstances(newInstances);
  }, [layers, canvasW, canvasH]);

  // Initialize p5 instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up old instance
    if (p5Ref.current) {
      p5Ref.current.remove();
      p5Ref.current = null;
    }

    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(canvasW, canvasH);
        p.pixelDensity(1);
        p.noLoop();
      };
      p.draw = () => {};
    };

    p5Ref.current = new p5(sketch, containerRef.current);

    // Give p5 a frame to set up, then render
    const timer = setTimeout(() => renderAll(), 50);
    return () => {
      clearTimeout(timer);
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
  }, [containerRef, canvasW, canvasH]);

  // Debounced re-render on layer changes
  useEffect(() => {
    if (!p5Ref.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Resize canvas if needed
      if (p5Ref.current && (p5Ref.current.width !== canvasW || p5Ref.current.height !== canvasH)) {
        p5Ref.current.resizeCanvas(canvasW, canvasH);
      }
      renderAll();
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [layers, canvasW, canvasH, renderAll]);

  return { patternInstances };
}

// Create a proxy that captures generate calls but doesn't draw to canvas
function createOffscreenProxy(realP5) {
  return {
    randomSeed: (s) => realP5.randomSeed(s),
    noiseSeed: (s) => realP5.noiseSeed(s),
    random: (...args) => realP5.random(...args),
    noise: (...args) => realP5.noise(...args),
    TWO_PI: Math.PI * 2,
    PI: Math.PI,
    HALF_PI: Math.PI / 2,
    push: () => {},
    pop: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    stroke: () => {},
    noStroke: () => {},
    fill: () => {},
    noFill: () => {},
    strokeWeight: () => {},
    beginShape: () => {},
    endShape: () => {},
    vertex: () => {},
    line: () => {},
    ellipse: () => {},
    rect: () => {},
    color: (c) => ({ setAlpha: () => {} }),
    CLOSE: 'close',
  };
}
