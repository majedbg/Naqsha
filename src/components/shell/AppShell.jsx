// Pro app-shell scaffold — Lane B / B1 (GitHub issue #2).
//
// Eight empty, labeled region frames per PRD §7.1 region map. This is the
// strangler skeleton: subsequent slices (#5–#10) fill exactly one region each
// with behavior moved out of the legacy LeftPanel/RightPanel. No behavior lives
// here yet — every region but Canvas is an empty placeholder, and the existing
// Studio is hosted, unchanged, inside the Canvas region (passed as `children`).
//
// AppShell is pure/presentational: no feature flag, no breakpoint logic. The
// flag + breakpoint gate lives in `pages/StudioRoute.jsx` so this component is
// trivially testable and each region is independently mountable.
//
// The canonical, ordered region-label list lives in `./regions.js` (a non-
// component module) so this file only exports components.

import { useState } from 'react';
import usePanelWidth from '../../lib/hooks/usePanelWidth';
import {
  InspectorSlotProvider,
  MenuSlotProvider,
  ToolStripSlotProvider,
  ControlBarSlotProvider,
  ObjectTreeSlotProvider,
  StatusBarSlotProvider,
  OperationsPanelSlotProvider,
} from './shellSlots';

// Shared frame for every region: a labeled landmark with a dashed placeholder
// affordance so the empty skeleton reads as "intentionally empty" in the UI.
// `children` lets the Canvas region host the live Studio.
function Region({ label, className = '', style, children }) {
  return (
    <section
      role="region"
      aria-label={label}
      data-region={label}
      style={style}
      className={`relative min-w-0 min-h-0 border border-dashed border-hairline ${className}`}
    >
      {children ?? (
        <span className="pointer-events-none absolute left-2 top-1 text-[10px] uppercase tracking-wide text-ink-soft/60 select-none">
          {label}
        </span>
      )}
    </section>
  );
}

// === Independently mountable region components (one export each) ===
// Each renders on its own so a later slice can target exactly one region
// without touching the others.

export function MenuBarRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal its top menu bar into it (B5 / #8). When omitted,
  // the region renders its empty labeled placeholder / passed children as before.
  return (
    <Region label="Menu bar" className={`h-9 shrink-0 ${className}`}>
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
    </Region>
  );
}

export function ControlBarRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal its contextual control bar into it (B6 / #9). When
  // omitted, the region renders its placeholder / passed children as before.
  return (
    <Region label="Contextual control bar" className={`h-9 shrink-0 ${className}`}>
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
    </Region>
  );
}

export function ToolStripRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal its vertical tool strip into it (B6 / #9). When
  // omitted, the region renders its placeholder / passed children as before.
  return (
    <Region label="Tool strip" className={`w-12 shrink-0 ${className}`}>
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
    </Region>
  );
}

export function ObjectTreeRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal its layer tree + machine-profile selector into it
  // (B2 / #5). When omitted, the region renders its placeholder / passed
  // children as before.
  //
  // WI-3: the region is user-resizable + persisted. Width is state-driven (no
  // fixed `w-56`) via inline px style; a thin invisible hit strip straddles the
  // section's right edge as a resize handle (double-click resets to default).
  const { width, isDragging, onMouseDown, onDoubleClick } = usePanelWidth();
  return (
    <Region
      label="Object tree"
      style={{ width }}
      className={`shrink-0 overflow-auto ${className}`}
    >
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
      <div
        data-testid="object-tree-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize object tree"
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        className="absolute top-0 right-0 z-10 h-full w-1.5 translate-x-1/2 cursor-col-resize"
      >
        {/* 1px divider, brightened to accent on hover / during drag. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-1/2 top-0 h-full w-px translate-x-1/2 ${
            isDragging ? 'bg-accent' : 'bg-transparent hover:bg-accent'
          }`}
        />
      </div>
    </Region>
  );
}

export function CanvasRegion({ children, className = '' }) {
  return (
    <Region label="Canvas" className={`flex-1 overflow-hidden ${className}`}>
      {children}
    </Region>
  );
}

export function InspectorRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal the selection-driven Inspector into it (B3 / #6).
  // When omitted, the region renders its empty labeled placeholder as before.
  return (
    <Region label="Inspector" className={`flex-1 overflow-auto ${className}`}>
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
    </Region>
  );
}

export function OperationsPanelRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal its LightBurn-style operations / cut-settings panel
  // into it (C1 / #10). When omitted, the region renders its placeholder /
  // passed children as before.
  return (
    <Region label="Operations panel" className={`h-48 shrink-0 overflow-auto ${className}`}>
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
    </Region>
  );
}

export function StatusBarRegion({ children, contentRef, className = '' }) {
  // `contentRef` (a callback ref) exposes the region's inner mount node so the
  // hosted Studio can portal its status bar (units / zoom % / live cursor mm /
  // active bed) into it (B4 / #7). When omitted, the region renders its
  // placeholder / passed children as before.
  return (
    <Region label="Status bar" className={`h-7 shrink-0 ${className}`}>
      {contentRef ? <div ref={contentRef} className="h-full" /> : children}
    </Region>
  );
}

// Pro shell layout. Two top rows (decision 9: menu bar + contextual control
// bar), a three-column body (tool strip + object tree | canvas | inspector +
// operations panel), and a bottom status bar.
export default function AppShell({ children }) {
  // The Inspector region's inner mount node, captured via a callback ref and
  // published through InspectorSlotProvider so the hosted Studio (a sibling in
  // the Canvas region) can portal its selection-driven Inspector into it (B3 /
  // #6). State (not a bare ref) so publishing the node re-renders the provider.
  const [inspectorNode, setInspectorNode] = useState(null);
  // The Menu bar region's inner mount node, published the same way so the hosted
  // Studio can portal its top menu bar into it (B5 / #8).
  const [menuNode, setMenuNode] = useState(null);
  // The Tool strip + Contextual control bar region mount nodes (B6 / #8 pattern,
  // issue #9), published so the hosted Studio can portal its tool strip and
  // contextual control bar into them.
  const [toolStripNode, setToolStripNode] = useState(null);
  const [controlBarNode, setControlBarNode] = useState(null);
  // The Object tree region's inner mount node (B2 / #5), published so the hosted
  // Studio can portal its layer tree + machine-profile selector into it.
  const [objectTreeNode, setObjectTreeNode] = useState(null);
  // The Status bar region's inner mount node (B4 / #7), published so the hosted
  // Studio can portal its status bar into it.
  const [statusBarNode, setStatusBarNode] = useState(null);
  // The Operations panel region's inner mount node (C1 / #10), published so the
  // hosted Studio can portal its operations / cut-settings panel into it.
  const [operationsNode, setOperationsNode] = useState(null);

  return (
    <div className="flex flex-col h-dvh bg-paper">
      <MenuBarRegion contentRef={setMenuNode} />
      <ControlBarRegion contentRef={setControlBarNode} />

      <div className="flex flex-1 min-h-0">
        <ToolStripRegion contentRef={setToolStripNode} />
        <ObjectTreeRegion contentRef={setObjectTreeNode} />

        {/* The live Studio is hosted here. It reads the slots from context and
            portals the layer tree, param inspector, top menu bar, tool strip,
            and contextual control bar into their regions. */}
        <CanvasRegion>
          <MenuSlotProvider value={menuNode}>
            <ToolStripSlotProvider value={toolStripNode}>
              <ControlBarSlotProvider value={controlBarNode}>
                <ObjectTreeSlotProvider value={objectTreeNode}>
                  <StatusBarSlotProvider value={statusBarNode}>
                    <OperationsPanelSlotProvider value={operationsNode}>
                      <InspectorSlotProvider value={inspectorNode}>
                        {children}
                      </InspectorSlotProvider>
                    </OperationsPanelSlotProvider>
                  </StatusBarSlotProvider>
                </ObjectTreeSlotProvider>
              </ControlBarSlotProvider>
            </ToolStripSlotProvider>
          </MenuSlotProvider>
        </CanvasRegion>

        <div className="flex flex-col w-72 shrink-0 min-h-0">
          <InspectorRegion contentRef={setInspectorNode} />
          <OperationsPanelRegion contentRef={setOperationsNode} />
        </div>
      </div>

      <StatusBarRegion contentRef={setStatusBarNode} />
    </div>
  );
}
