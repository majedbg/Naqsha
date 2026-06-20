// ITP Camp acrylic materials — the engrave-stock swatch catalog.
//
// Seven acrylic types sourced from Canal Plastics (the workshop's stock supplier),
// surfaced in ITP mode as a material picker with photographic swatch previews so a
// participant can see the real sheet their keepsake is cut from.
//
// Unlike the cut-shape assets (raw SVG strings handed to addImportedLayer), these
// are product PHOTOS: imported as resolved URLs via Vite's default asset import and
// rendered in an <img>. They are NOT canvas layers — picking one selects a material,
// it does not import artwork.
//
// `color` is a representative hex sampled from the centre of each swatch photo, used
// for the selected-state accent and as a fallback tint before the image loads.

import greenFluorescentImg from './itp-camp/assets/materials/green-fluorescent.jpg';
import clearImg from './itp-camp/assets/materials/clear.jpg';
import goldMirrorImg from './itp-camp/assets/materials/gold-mirror.jpg';
import auraIridescentImg from './itp-camp/assets/materials/aura-iridescent.jpg';
import blueTranslucentImg from './itp-camp/assets/materials/blue-translucent.jpg';
import gothamBlackPearlImg from './itp-camp/assets/materials/gotham-black-pearl.jpg';
import turquoiseOpaqueImg from './itp-camp/assets/materials/turquoise-opaque.jpg';

// Each entry: { id, name, color, image }. Stable order = display order.
export const ITP_CAMP_MATERIALS = [
  { id: 'clear', name: 'Clear', color: '#E7E7E7', image: clearImg },
  { id: 'green-fluorescent', name: 'Green Fluorescent', color: '#E6E954', image: greenFluorescentImg },
  { id: 'turquoise-opaque', name: 'Turquoise Opaque', color: '#61DBC2', image: turquoiseOpaqueImg },
  { id: 'blue-translucent', name: 'Blue Translucent', color: '#0082CD', image: blueTranslucentImg },
  { id: 'aura-iridescent', name: 'Aura Iridescent', color: '#D2BDFE', image: auraIridescentImg },
  { id: 'gold-mirror', name: 'Gold Mirror', color: '#E0C099', image: goldMirrorImg },
  { id: 'gotham-black-pearl', name: 'Gotham Black Pearl', color: '#10130E', image: gothamBlackPearlImg },
];
