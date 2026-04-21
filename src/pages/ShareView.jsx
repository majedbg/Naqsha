import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { loadSharedDesign } from '../lib/designService';
import useCanvas from '../lib/useCanvas';

export default function ShareView() {
  const { token } = useParams();
  const [design, setDesign] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!token) return;
    loadSharedDesign(token)
      .then((data) => {
        if (!data) setError('Design not found or link has been revoked.');
        else setDesign(data);
      })
      .catch(() => setError('Failed to load design.'))
      .finally(() => setLoading(false));
  }, [token]);

  const config = design?.config;
  const layers = config?.layers || [];
  const canvasW = config?.canvasW || 1152;
  const canvasH = config?.canvasH || 1152;

  // Render patterns via useCanvas (only when design is loaded)
  useCanvas(containerRef, design ? layers : [], canvasW, canvasH);

  // Scale to fit
  useEffect(() => {
    if (!design || !wrapperRef.current) return;
    const calcScale = () => {
      const padding = 48;
      const availW = wrapperRef.current.clientWidth - padding * 2;
      const availH = wrapperRef.current.clientHeight - padding * 2;
      setScale(Math.min(availW / canvasW, availH / canvasH, 1));
    };
    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, [design, canvasW, canvasH]);

  if (loading) {
    return (
      <div className="h-screen bg-surface flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading shared design...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-ink-soft">{error}</p>
        <Link to="/" className="text-sm text-accent hover:text-saffron-hover transition-colors">
          Open the editor
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      {/* Header */}
      <div className="shrink-0 h-10 bg-panel border-b border-hairline flex items-center px-4 gap-4">
        <Link to="/" className="text-[11px] text-ink-soft hover:text-saffron transition-colors">
          Sonoform
        </Link>
        <span className="text-sm text-ink font-medium truncate flex-1">
          {design.name}
        </span>
        {design.author && (
          <div className="flex items-center gap-1.5">
            {design.avatar_url && (
              <img src={design.avatar_url} alt="" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />
            )}
            <span className="text-[11px] text-ink-soft">by {design.author}</span>
          </div>
        )}
        {design.share_mode === 'fork' && (
          <Link
            to="/"
            className="text-[11px] text-accent hover:text-saffron-hover transition-colors"
          >
            Fork this design
          </Link>
        )}
      </div>

      {/* Canvas */}
      <div ref={wrapperRef} className="flex-1 flex items-center justify-center overflow-hidden">
        <div
          style={{
            width: canvasW,
            height: canvasH,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
          className="shadow-2xl"
        >
          <div ref={containerRef} />
        </div>
      </div>
    </div>
  );
}
