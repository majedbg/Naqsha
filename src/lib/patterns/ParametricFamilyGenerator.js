// ParametricFamilyGenerator — the runtime Pattern for an ADOPTED parametric
// family (S12, issue #61; PRD #48 decision 10 + user story 54). Distinct from
// the fixed ExtractedPatternGenerator: instead of tiling a frozen traced tile,
// it REGENERATES the family geometry from live params every render, so the
// paid-tier structural knobs (star fold n, contact angle) reshape the pattern
// through PATTERN_PARAM_DEFS/ParamControl — the same live-knob machinery AI
// patterns use (registered with paramDefs → getDynamicParamDefs → Inspector).
//
// TIERING (decision 4 + 5, task "Tiering"): adopting a fitted family branches
// on `liveKnobs` (the caller resolves it from the tier gate + feature flag):
//   liveKnobs = false → FREE: register the fitted family as a FIXED tile via the
//     existing S0 registerExtractedPattern (a snapshot at the fit params; export
//     + tile like any extracted pattern, NO knobs).
//   liveKnobs = true  → PAID: register THIS parametric class WITH paramDefs, so
//     the Inspector shows the n / contactAngle knobs and every edit regenerates.
// Default-open + flippable: the gate defaults to live knobs; flipping the tier
// limit to deny 'parameterize' routes free users to the fixed-tile branch — no
// caller rebuild (checkGate('parameterize') + isFeatureEnabled('parameterize')).
//
// One entity, two surfaces (locked decision 6): the adopted entity carries BOTH
// a rendered tile (tile_svg — satisfies the user_patterns 'extracted' payload
// check + drives the Library thumbnail) AND family/paramDefs/defaultParams for
// the live generator. Persistence reuses the existing user_patterns param
// columns (source_code/param_defs/default_params — nullable since migration
// 009); NO new migration is required.

import { Pattern } from './drawingContext';
import { registerPattern } from '../patternRegistry';
import { flattenPathD } from './ExtractedPatternGenerator';
import { escapeAttr } from '../extraction/extractedPattern';
import { tilePlacements } from '../extraction/tileComposer';
import { addLibraryEntry } from '../libraryStore';
import { kaplanStarFamily } from '../extraction/families/kaplanStar';

/** Registry of adoptable families by id (v1: the one Kaplan star family). */
const FAMILIES = { [kaplanStarFamily.id]: kaplanStarFamily };

/** Look up a FitFamily by id (used when rehydrating a persisted adoption). */
export function getFamily(id) {
  return FAMILIES[id] ?? null;
}

const fmtNum = (n) => String(Math.round(n * 1000) / 1000);

/**
 * Build the runtime Pattern class for an adopted parametric family. Closes over
 * the family + the detected lattice; `generate`/`toSVGGroup` regenerate geometry
 * from the LIVE params each call so the structural knobs are truly live.
 */
export function makeParametricFamilyClass(family, entity) {
  const lattice = entity.lattice ?? null;
  const defaults = entity.defaultParams ?? family.defaults ?? {};

  const geomFor = (params) => family.generate({ ...defaults, ...params }, { lattice });

  return class ParametricFamilyGenerator extends Pattern {
    generate(ctx, seed, params, canvasW, canvasH, color, opacity) {
      const alpha = Math.round((Math.max(0, Math.min(100, opacity ?? 100)) / 100) * 255);
      const c = ctx.color(color || '#000000');
      if (c && typeof c.setAlpha === 'function') c.setAlpha(alpha);
      const geo = geomFor(params || {});

      const drawPaths = (paths, filled, ox, oy) => {
        for (const { d } of paths) {
          for (const sub of flattenPathD(d)) {
            if (filled) { ctx.noStroke(); ctx.fill(c); }
            else { ctx.noFill(); ctx.stroke(c); }
            ctx.beginShape();
            for (const [px, py] of sub.points) ctx.vertex(px + ox, py + oy);
            ctx.endShape(sub.closed ? ctx.CLOSE : undefined);
          }
        }
      };

      const placements = lattice
        ? tilePlacements(lattice, { width: canvasW, height: canvasH })
        : [{ x: (canvasW - geo.width) / 2, y: (canvasH - geo.height) / 2 }];
      for (const { x, y } of placements) {
        drawPaths(geo.fills, true, x, y);
        drawPaths(geo.strokes, false, x, y);
      }
    }

    toSVGGroup(layerId, color, opacity, params) {
      const opacityFrac = Math.max(0, Math.min(100, opacity ?? 100)) / 100;
      const geo = geomFor(params || this._lastParams || {});
      const fill = escapeAttr(color);
      const pathsAt = (indent) =>
        [
          ...geo.fills.map(
            ({ d, role }) =>
              `${indent}<path d="${escapeAttr(d)}" fill="${fill}" fill-rule="evenodd" stroke="none" data-role="${escapeAttr(role || 'engrave')}"/>`
          ),
          ...geo.strokes.map(
            ({ d, role }) =>
              `${indent}<path d="${escapeAttr(d)}" fill="none" stroke="${fill}" stroke-width="1" data-role="${escapeAttr(role || 'score')}"/>`
          ),
        ].join('\n');

      if (!lattice) {
        const ox = (this._lastCx ?? geo.width / 2) - geo.width / 2;
        const oy = (this._lastCy ?? geo.height / 2) - geo.height / 2;
        return `<g id="${escapeAttr(layerId)}" opacity="${opacityFrac}" transform="translate(${fmtNum(ox)} ${fmtNum(oy)})">\n${pathsAt('    ')}\n  </g>`;
      }
      const canvasW = (this._lastCx ?? geo.width / 2) * 2;
      const canvasH = (this._lastCy ?? geo.height / 2) * 2;
      const copies = tilePlacements(lattice, { width: canvasW, height: canvasH })
        .map(
          ({ x, y }) =>
            `    <g transform="translate(${fmtNum(x)} ${fmtNum(y)})">\n${pathsAt('      ')}\n    </g>`
        )
        .join('\n');
      return `<g id="${escapeAttr(layerId)}" opacity="${opacityFrac}">\n${copies}\n  </g>`;
    }
  };
}

/**
 * Register an adopted parametric family into the dynamic registry WITH its
 * paramDefs, so the Inspector renders the live structural knobs (paid tier).
 * Mirrors registerExtractedPattern's single-write-path discipline (registry +
 * libraryStore), flagged origin:'extracted' so both surfaces treat it like any
 * library pattern (badge 📷, sign-out hygiene via clearExtractedPatterns).
 */
export function registerParametricFamily(entity, extras = {}) {
  const family = getFamily(entity.family);
  if (!family) throw new Error(`registerParametricFamily: unknown family "${entity.family}"`);
  const PatternClass = makeParametricFamilyClass(family, entity);
  registerPattern(
    entity.patternId,
    PatternClass,
    entity.title,
    entity.defaultParams ?? family.defaults,
    entity.paramDefs ?? family.paramDefs,
    { isAI: false, origin: 'extracted' }
  );
  addLibraryEntry(entity, extras);
  return PatternClass;
}
