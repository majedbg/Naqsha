import { useRef, useState, useEffect } from 'react';
import useCanvas from '../lib/useCanvas';

export default function RightPanel({ layers, canvasW, canvasH, patternInstancesRef, canvasContainerRef }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(1);

  const { patternInstances } = useCanvas(containerRef, layers, canvasW, canvasH);

  // Expose pattern instances to parent for SVG export
  useEffect(() => {
    if (patternInstancesRef) {
      patternInstancesRef.current = patternInstances;
    }
  }, [patternInstances, patternInstancesRef]);

  // Expose canvas container so parent can grab thumbnails
  useEffect(() => {
    if (canvasContainerRef) {
      canvasContainerRef.current = containerRef.current;
    }
  }, [canvasContainerRef]);

  // Calculate scale to fit canvas in available space
  useEffect(() => {
    const calcScale = () => {
      if (!wrapperRef.current) return;
      const padding = 48;
      const availW = wrapperRef.current.clientWidth - padding * 2;
      const availH = wrapperRef.current.clientHeight - padding * 2;
      const scaleX = availW / canvasW;
      const scaleY = availH / canvasH;
      setScale(Math.min(scaleX, scaleY, 1));
    };

    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, [canvasW, canvasH]);

  return (
    <div ref={wrapperRef} className="flex-1 h-full bg-surface flex items-center justify-center overflow-hidden">
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
  );
}
