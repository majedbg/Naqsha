import { describe, it, expect } from 'vitest';
import { RecordingContext, P5Adapter, Pattern } from '../drawingContext.js';

// ---------------------------------------------------------------------------
// RecordingContext — the headless adapter the 2A-ii golden tests run against.
// ---------------------------------------------------------------------------
describe('RecordingContext', () => {
  it('records draw calls as { op, args }', () => {
    const ctx = new RecordingContext({ seed: 1 });
    ctx.line(1, 2, 3, 4);
    ctx.beginShape();
    ctx.vertex(5, 6);
    ctx.endShape(ctx.CLOSE);
    expect(ctx.calls).toEqual([
      { op: 'line', args: [1, 2, 3, 4] },
      { op: 'beginShape', args: [] },
      { op: 'vertex', args: [5, 6] },
      { op: 'endShape', args: ['close'] },
    ]);
  });

  it('random()/noise() are deterministic for a fixed seed', () => {
    const a = new RecordingContext({ seed: 42 });
    const b = new RecordingContext({ seed: 42 });
    const seqA = [a.random(), a.random(-5, 5), a.noise(0.1)];
    const seqB = [b.random(), b.random(-5, 5), b.noise(0.1)];
    expect(seqA).toEqual(seqB);
    expect(a.random()).toBeGreaterThanOrEqual(0);
  });

  it('randomSeed resets the sequence', () => {
    const ctx = new RecordingContext({ seed: 1 });
    ctx.randomSeed(7);
    const first = ctx.random();
    ctx.randomSeed(7);
    expect(ctx.random()).toBe(first);
  });

  it('random honours p5 arg overloads', () => {
    const ctx = new RecordingContext({ seed: 3 });
    // random(max) ∈ [0, max); random(min,max) ∈ [min,max)
    for (let i = 0; i < 50; i++) {
      const m = new RecordingContext({ seed: i }).random(10);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(10);
    }
    const r = ctx.random(2, 8);
    expect(r).toBeGreaterThanOrEqual(2);
    expect(r).toBeLessThan(8);
  });

  it('color() returns a stub with setAlpha so drawBase never throws headless', () => {
    const ctx = new RecordingContext({ seed: 1 });
    const c = ctx.color('#3366ff');
    expect(() => c.setAlpha(128)).not.toThrow();
    expect(ctx.red(c)).toBe(0x33);
    expect(ctx.green(c)).toBe(0x66);
    expect(ctx.blue(c)).toBe(0xff);
  });

  it('map() is a linear remap', () => {
    const ctx = new RecordingContext({ seed: 1 });
    expect(ctx.map(0.5, 0, 1, 0, 100)).toBe(50);
    expect(ctx.map(5, 0, 10, 10, 20)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// P5Adapter — production adapter; verified against a fake p5 (no real p5 here).
// ---------------------------------------------------------------------------
function makeFakeP5() {
  const log = [];
  const rec = (op) => (...args) => { log.push({ op, args }); return `${op}-ret`; };
  return {
    log,
    TWO_PI: Math.PI * 2, PI: Math.PI, HALF_PI: Math.PI / 2,
    CLOSE: 'P5_CLOSE', CENTER: 'P5_CENTER', ROUND: 'P5_ROUND',
    randomSeed: rec('randomSeed'), noiseSeed: rec('noiseSeed'),
    random: rec('random'), noise: rec('noise'),
    color: rec('color'), red: rec('red'), green: rec('green'), blue: rec('blue'), map: rec('map'),
    push: rec('push'), pop: rec('pop'), translate: rec('translate'),
    rotate: rec('rotate'), scale: rec('scale'),
    stroke: rec('stroke'), noStroke: rec('noStroke'), fill: rec('fill'), noFill: rec('noFill'),
    strokeWeight: rec('strokeWeight'), strokeCap: rec('strokeCap'), rectMode: rec('rectMode'),
    line: rec('line'), ellipse: rec('ellipse'), rect: rec('rect'), triangle: rec('triangle'),
    beginShape: rec('beginShape'), vertex: rec('vertex'), endShape: rec('endShape'),
  };
}

describe('P5Adapter', () => {
  it('sources constants from the live p5 instance (not hardcoded)', () => {
    const p = makeFakeP5();
    const ctx = new P5Adapter(p);
    expect(ctx.CLOSE).toBe('P5_CLOSE');
    expect(ctx.CENTER).toBe('P5_CENTER');
    expect(ctx.ROUND).toBe('P5_ROUND');
    expect(ctx.TWO_PI).toBe(Math.PI * 2);
  });

  it('draw mode forwards every call to the live p5', () => {
    const p = makeFakeP5();
    const ctx = new P5Adapter(p, { draw: true });
    ctx.push();
    ctx.translate(1, 2);
    ctx.stroke('red');
    ctx.line(0, 0, 5, 5);
    ctx.pop();
    expect(p.log.map((e) => e.op)).toEqual(['push', 'translate', 'stroke', 'line', 'pop']);
  });

  it('no-draw mode no-ops transform/style/draw but still delegates RNG + color', () => {
    const p = makeFakeP5();
    const ctx = new P5Adapter(p, { draw: false });
    ctx.randomSeed(9);
    ctx.random(-1, 1);
    ctx.noise(0.5);
    const c = ctx.color('#fff');
    ctx.push();
    ctx.translate(3, 4);
    ctx.line(0, 0, 1, 1);
    ctx.beginShape();
    ctx.vertex(2, 2);
    ctx.endShape(ctx.CLOSE);
    // RNG + color delegated; transform/draw suppressed
    expect(p.log.map((e) => e.op)).toEqual(['randomSeed', 'random', 'noise', 'color']);
    expect(c).toBe('color-ret');
  });
});

// ---------------------------------------------------------------------------
// Pattern base class
// ---------------------------------------------------------------------------
describe('Pattern base class', () => {
  it('generateWithContext stores symmetry context then calls generate', () => {
    class P extends Pattern {
      generate(ctx) { this.svgElements = ['<x/>']; this.ran = true; ctx.line(0, 0, 1, 1); }
    }
    const inst = new P();
    const ctx = new RecordingContext({ seed: 1 });
    inst.generateWithContext(ctx, 1, { symmetry: 3, startAngle: 10 }, 800, 600, '#000', 100);
    expect(inst.ran).toBe(true);
    expect(inst._lastCx).toBe(400);
    expect(inst._lastCy).toBe(300);
    expect(inst._lastParams.symmetry).toBe(3);
  });

  it('default contentFor joins svgElements with 4-space indent', () => {
    class P extends Pattern { generate() { this.svgElements = ['<a/>', '<b/>']; } }
    const inst = new P();
    inst.generateWithContext(new RecordingContext(), 1, {}, 100, 100, '#000', 100);
    expect(inst.contentFor('#000')).toBe('    <a/>\n    <b/>');
  });

  it('throws if generate is not overridden', () => {
    const bare = new Pattern();
    expect(() => bare.generate()).toThrow(/must implement generate/);
  });
});
