// Kit registry (issue #18, Lane C / C9).
//
// A kit bundles a brand theme skin, a manifest of place-as-artwork assets, and
// a set of laser bed presets. The registry is CONFIG-DRIVEN: a future kit is a
// registration in KITS below, not a new code path. ITP Camp is the only kit
// today.
//
// A kit config has the shape:
//   {
//     id, name,
//     themeSkin: { theme, tokens },   // named 3rd theme + its palette token map
//     assetManifest: [{ id, name, svg, altSvg? }],
//     materials: [{ id, name, color, image }],      // engrave-stock swatches
//     bedPresets: [{ id, label, width, height }],   // canonical mm
//   }

import { ITP_CAMP_ASSETS } from './itpCampAssets.js';
import { ITP_CAMP_MATERIALS } from './itpCampMaterials.js';

export const ITP_CAMP_KIT_ID = 'itp-camp';

// Inches → mm (canonical chrome unit). 1 in = 25.4 mm, kept exact (no rounding)
// so the bed values are 304.8 / 609.6 mm rather than integer-truncated.
const IN_MM = (inches) => inches * 25.4;

// ── ITP Camp palette (plan-extracted; flagged for review, not yet signed off) ──
// lime/chartreuse accent, deep teal/slate, black, soft sage background, white
// cards. These feed the `[data-theme="itp-camp"]` CSS tokens (see tokens.css)
// AND are surfaced here so the registry is the single source of truth.
const ITP_CAMP_PALETTE = {
  '--itp-lime': '#B5E33C',
  '--itp-teal': '#2E5C6E',
  '--itp-black': '#000000',
  '--itp-sage': '#D9E2DD',
  '--itp-white': '#FFFFFF',
};

// The named third theme value the kit mode applies (data-theme="itp-camp").
export const ITP_CAMP_THEME = 'itp-camp';

const ITP_CAMP_KIT = {
  id: ITP_CAMP_KIT_ID,
  name: 'ITP Camp',
  themeSkin: {
    theme: ITP_CAMP_THEME,
    tokens: ITP_CAMP_PALETTE,
  },
  assetManifest: ITP_CAMP_ASSETS,
  // Acrylic engrave-stock swatches, shown as a material picker in kit mode.
  materials: ITP_CAMP_MATERIALS,
  // Two laser beds. Small is confirmed (12 × 24 in). Large is UNCONFIRMED —
  // assumed equal to small for now; its label makes the placeholder obvious.
  bedPresets: [
    {
      id: 'itp-camp-12x24',
      label: 'ITP Camp — 12×24″',
      width: IN_MM(12),  // 304.8 mm
      height: IN_MM(24), // 609.6 mm
    },
    {
      id: 'itp-camp-large',
      label: 'ITP Camp — Large (assumed 12×24″, TBD)',
      width: IN_MM(12),
      height: IN_MM(24),
    },
  ],
};

// The registry table — keyed by id. Add a kit by adding an entry here.
const KITS = {
  [ITP_CAMP_KIT_ID]: ITP_CAMP_KIT,
};

// Stable, deterministic ordering.
export const KIT_IDS = [ITP_CAMP_KIT_ID];

// Resolve an id → kit config, or null when unknown/absent.
export function getKit(id) {
  return KITS[id] ?? null;
}

// All registered kits, in KIT_IDS order.
export function listKits() {
  return KIT_IDS.map((id) => KITS[id]);
}

// A kit's bed presets as fresh copies (callers must not mutate). Dims are mm.
export function kitBedPresets(id) {
  const kit = getKit(id);
  return kit ? kit.bedPresets.map((p) => ({ ...p })) : [];
}
