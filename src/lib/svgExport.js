function downloadSVG(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function layerBgRect(layer, canvasW, canvasH) {
  if (!layer.bgOpacity || layer.bgOpacity <= 0) return '';
  return `    <rect width="${canvasW}" height="${canvasH}" fill="${layer.bgColor}" opacity="${(layer.bgOpacity / 100).toFixed(2)}"/>`;
}

export function exportLayerSVG(layer, patternInstance, canvasW, canvasH, { metadata = false } = {}) {
  const widthIn = canvasW / 96;
  const heightIn = canvasH / 96;
  const bgRect = layerBgRect(layer, canvasW, canvasH);
  const group = patternInstance.toSVGGroup(layer.id, layer.color, layer.opacity);
  const meta = metadata ? '\n  <!-- generativearts.studio -->' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthIn}in" height="${heightIn}in" viewBox="0 0 ${canvasW} ${canvasH}">${meta}
  <rect width="100%" height="100%" fill="white"/>
${bgRect ? `  ${bgRect}\n` : ''}  ${group}
</svg>`;
  downloadSVG(svg, `${layer.name.replace(/\s+/g, '_')}.svg`);
}

export function exportAllLayersSVG(layers, patternInstances, canvasW, canvasH, includeHidden = false, { metadata = false } = {}) {
  const widthIn = canvasW / 96;
  const heightIn = canvasH / 96;
  // Reverse so bottom layers come first in SVG (matching visual order)
  const ordered = [...layers].reverse();
  const groups = ordered
    .filter((l) => includeHidden || l.visible)
    .map((l) => {
      const instance = patternInstances[l.id];
      if (!instance) return '';
      const bgRect = layerBgRect(l, canvasW, canvasH);
      const group = instance.toSVGGroup(l.id, l.color, l.opacity);
      return (bgRect ? bgRect + '\n  ' : '') + group;
    })
    .join('\n  ');
  const meta = metadata ? '\n  <!-- generativearts.studio -->' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthIn}in" height="${heightIn}in" viewBox="0 0 ${canvasW} ${canvasH}">${meta}
  <rect width="100%" height="100%" fill="white"/>
  ${groups}
</svg>`;
  downloadSVG(svg, 'generative-art-all-layers.svg');
}
