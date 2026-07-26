import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Slider drag-surface regression guard.
 *
 * The bug this locks down: the Slider primitive sizes its invisible native
 * <input type="range"> to fill the track region, but for a long time it did so
 * with Tailwind's `h-full`. The global base rule in index.css is written as
 * `input[type="range"]` — specificity (0,1,1) — which outranks any bare utility
 * class (0,1,0), so `h-full` silently lost and the input computed to the base
 * 4px. Worse, `absolute inset-0` plus an explicit height is over-constrained,
 * so CSS drops `bottom` and the 4px box parks at the TOP of the row. The 28px
 * shadow track then centres on that box, putting the live drag band ~9px ABOVE
 * the row and ending it 2px below the track line — the painted cell could only
 * be grabbed from its top half.
 *
 * Measured in Chrome before the fix: input height 4px, live band y −9…13 on a
 * 22px row whose painted thumb spans y 6…16. After: height 28px, band 0…28.
 *
 * jsdom does no layout, so this cannot be asserted by rendering. Instead we
 * assert the two cascade invariants that made the geometry correct — either one
 * regressing reintroduces the bug:
 *
 *   1. index.css keeps its range-input base rules at specificity zero.
 *   2. Each slider declares the input's height inside its own (0,2,0) rule,
 *      and does NOT hand that job back to a utility class.
 */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const SLIDERS = [
  ['Slider.jsx', './Slider.jsx'],
  ['CommitSlider.jsx', './CommitSlider.jsx'],
];

describe('slider drag surface — cascade invariants', () => {
  it('index.css keeps the range-input base rules specificity-zero (:where)', () => {
    const css = read('../../index.css');
    // A bare `input[type="range"]` selector — with or without a pseudo-element
    // — would outrank component classes again. Only class-qualified forms
    // (`input[type="range"].mod-range`) are allowed: those are intentional
    // overrides, not defaults.
    const bareBaseRules = css.match(/^input\[type="range"\](?!\.)/gm);
    expect(bareBaseRules).toBeNull();
    expect(css).toContain(':where(input[type="range"])');
  });

  for (const [name, path] of SLIDERS) {
    describe(name, () => {
      const src = read(path);
      // The component's own <style> block — the (0,2,0) rules that must win.
      const inputRule = src.match(/\.slider-root \.slider-input \{([^}]*)\}/)?.[1];

      it('declares the input height in its own .slider-root .slider-input rule', () => {
        expect(inputRule).toBeDefined();
        expect(inputRule).toMatch(/height:\s*100%/);
      });

      it('does not delegate the input height to a utility class', () => {
        const inputTag = src.match(/className="slider-input[^"]*"/)?.[0];
        expect(inputTag).toBeDefined();
        expect(inputTag).not.toMatch(/\bh-full\b/);
      });

      it('reserves horizontal touch drags for the slider (touch-action: pan-y)', () => {
        expect(inputRule).toMatch(/touch-action:\s*pan-y/);
        // `manipulation` permits pan-x, which lets a scroll container steal the
        // drag mid-gesture. An inline style would also outrank the mobile-panel
        // override in index.css, so it must not come back as one either.
        expect(src).not.toMatch(/touchAction:\s*'manipulation'/);
      });

      it('sizes the shadow track and thumb to the full row height', () => {
        const region = src.match(/slider-track-region relative h-\[(\d+)px\]/);
        expect(region).not.toBeNull();
        const rowHeight = Number(region[1]);
        // Comfortable pointer target — the old 22px row was under the 24px
        // minimum, and the invisible thumb must span the whole row.
        expect(rowHeight).toBeGreaterThanOrEqual(24);
        for (const part of [
          '::-webkit-slider-runnable-track',
          '::-moz-range-track',
          '::-webkit-slider-thumb',
          '::-moz-range-thumb',
        ]) {
          const rule = src.match(
            new RegExp(`\\.slider-root \\.slider-input${part.replace(/[-[\]]/g, '\\$&')} \\{([^}]*)\\}`)
          )?.[1];
          expect(rule, `${part} rule missing`).toBeDefined();
          expect(rule, `${part} height must match the ${rowHeight}px row`).toMatch(
            new RegExp(`height:\\s*${rowHeight}px`)
          );
        }
      });
    });
  }
});
