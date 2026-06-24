// Acrylic swatch-photo catalog for the Material lens (Color View).
//
// Seven acrylic stock types, each paired with a photographic swatch so the
// Material lens can preview a design as it looks cut on the real sheet.
//
// These are product PHOTOS, not canvas artwork: imported as resolved URLs via
// Vite's default asset import and rendered in an <img>/background-image. Picking
// one selects a preview material — it does not import any geometry.
//
// `color` is a representative hex sampled from the centre of each swatch photo,
// used for the selected-state accent and as a fallback tint before the image loads.

import greenFluorescentImg from '../assets/materials/green-fluorescent.jpg';
import clearImg from '../assets/materials/clear.jpg';
import goldMirrorImg from '../assets/materials/gold-mirror.jpg';
import auraIridescentImg from '../assets/materials/aura-iridescent.jpg';
import blueTranslucentImg from '../assets/materials/blue-translucent.jpg';
import gothamBlackPearlImg from '../assets/materials/gotham-black-pearl.jpg';
import turquoiseOpaqueImg from '../assets/materials/turquoise-opaque.jpg';

// Each entry: { id, name, color, image }. Stable order = display order.
export const MATERIAL_SWATCHES = [
  { id: 'clear', name: 'Clear', color: '#E7E7E7', image: clearImg },
  { id: 'green-fluorescent', name: 'Green Fluorescent', color: '#E6E954', image: greenFluorescentImg },
  { id: 'turquoise-opaque', name: 'Turquoise Opaque', color: '#61DBC2', image: turquoiseOpaqueImg },
  { id: 'blue-translucent', name: 'Blue Translucent', color: '#0082CD', image: blueTranslucentImg },
  { id: 'aura-iridescent', name: 'Aura Iridescent', color: '#D2BDFE', image: auraIridescentImg },
  { id: 'gold-mirror', name: 'Gold Mirror', color: '#E0C099', image: goldMirrorImg },
  { id: 'gotham-black-pearl', name: 'Gotham Black Pearl', color: '#10130E', image: gothamBlackPearlImg },
];
