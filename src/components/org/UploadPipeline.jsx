import { useState } from 'react';
import { sanitizeSvg } from '../../lib/svg/sanitizeSvg';
import { parseDimensions } from '../../lib/svg/parseDimensions';
import { extractOps } from '../../lib/svg/extractOps';

export default function UploadPipeline({ onComplete }) {
  // When an upload has ambiguous dimensions we pause here, holding the
  // sanitized SVG + ops, and ask the user to confirm a physical W×H before
  // completing. Null means "no pending confirm step".
  const [pending, setPending] = useState(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError('');
    try {
      const raw = await file.text();
      const { clean, removed } = sanitizeSvg(raw);
      const dims = parseDimensions(clean);
      const ops = extractOps(clean, { source: 'upload' });
      const base = {
        source: 'upload',
        svgClean: clean,
        ambiguous: dims.ambiguous,
        ops,
        removed,
      };

      if (dims.ambiguous) {
        setWidth(String(dims.widthMm));
        setHeight(String(dims.heightMm));
        setPending(base);
        return;
      }

      onComplete({ ...base, widthMm: dims.widthMm, heightMm: dims.heightMm });
    } catch {
      setError("We couldn't read that file as a valid SVG.");
    }
  }

  function confirmSize(e) {
    e.preventDefault();
    // The user has now supplied a physical size, so the dimensions are no
    // longer ambiguous/inferred — the draft is emitted resolved.
    onComplete({
      ...pending,
      widthMm: Number(width),
      heightMm: Number(height),
      ambiguous: false,
    });
    setPending(null);
  }

  if (pending) {
    return (
      <form onSubmit={confirmSize}>
        <p>Confirm the physical size of this design.</p>
        <label>
          Width (mm)
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <label>
          Height (mm)
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
          />
        </label>
        <button type="submit">Confirm size</button>
      </form>
    );
  }

  return (
    <div>
      <input type="file" accept="image/svg+xml,.svg" onChange={handleFile} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
