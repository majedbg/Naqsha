import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Inspector from "../components/shell/Inspector";
import LayerTree from "../components/shell/LayerTree";
import MenuBar from "../components/shell/MenuBar";
import ToolStrip from "../components/shell/ToolStrip";
import ControlBar from "../components/shell/ControlBar";
import StatusBar from "../components/shell/StatusBar";
import OperationsPanel from "../components/shell/OperationsPanel";
import {
  useInspectorSlot,
  useMenuSlot,
  useToolStripSlot,
  useControlBarSlot,
  useObjectTreeSlot,
  useStatusBarSlot,
  useOperationsPanelSlot,
} from "../components/shell/shellSlots";
import useActiveTool from "../lib/hooks/useActiveTool";
import useShowAdmin from "../lib/hooks/useShowAdmin";
import useCanvasView from "../lib/hooks/useCanvasView";
import useColorView from "../lib/hooks/useColorView";
import ColorViewControl from "../components/canvas/ColorViewControl";
import useSvgImport from "../lib/hooks/useSvgImport";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DocumentSetupDialog from "../components/shell/DocumentSetupDialog";
import { EXAMPLES } from "../examples";
import ExamplesGallery from "../components/sidebar/ExamplesGallery";
import RightPanel from "../components/RightPanel";
import LayerGroupModal from "../components/LayerGroupModal";
import CloudSaveModal from "../components/CloudSaveModal";
import PatternPickerModal from "../components/PatternPickerModal";
import { parseForPlacement, centerTransform } from "../lib/scene/placement";
import StudioSubmitModal from "../components/org/StudioSubmitModal";
import useLayers from "../lib/useLayers";
import useLayerGroups from "../lib/useLayerGroups";
import { addPanel, deletePanel } from "../lib/panels";
import { exportPanelsZip } from "../lib/panelExport";
import { isTextLayer } from "../lib/text/textLayer";
import { useFont } from "../lib/text/fontRegistry";
import { useAuth } from "../lib/AuthContext";
import { useGate } from "../lib/useGate";
import AuthButton from "../components/AuthButton";
import ThemeToggle from "../components/ui/ThemeToggle";
import { exportAllLayersSVG, exportLayerSVG, buildManifest } from "../lib/svgExport";
import AIPatternChat from "../components/AIPatternChat";
import OptimizeControls from "../components/shell/OptimizeControls";
import { getDynamicDefaults } from "../lib/patternRegistry";
import ShareLinkButton from "../components/ShareLinkButton";
import { resolveExportColor } from "../lib/fabrication";
import { seedOperations, addOperation, resolveOperation } from "../lib/operations";
import { remapOperationsToProfile, defaultBedSize, profileProcesses, defaultMachineParams } from "../lib/machineProfiles";
import useOperationsHistory from "../lib/hooks/useOperationsHistory";
import { syncWeightBand, supportsVariableWeight, isBandOperation } from "../lib/variableWeight";
import { findMoirePartnerA } from "../lib/moirePair";
import useCanvasSize, { loadCanvasState } from "../lib/hooks/useCanvasSize";
import useUIState from "../lib/hooks/useUIState";
import useOptimizations from "../lib/hooks/useOptimizations";
import useDesignPersistence from "../lib/hooks/useDesignPersistence";
import useCloudPersistence from "../lib/hooks/useCloudPersistence";
import { resolveSaveStatus } from "../lib/saveStatus";

export default function Studio({ submitOrg = null } = {}) {
  const { loading, user } = useAuth();
  const { limits } = useGate();
  // Admin entry point, relocated into the MenuBar now that TopNav no longer
  // renders over the studio route (the standalone Naqsha bar was dropped).
  const navigate = useNavigate();
  const showAdmin = useShowAdmin();
  // Resolved opentype font for exporting text-layer glyph outlines (phase 6).
  const { font: textFont } = useFont();
  const savedCanvas = loadCanvasState();

  // === UI chrome (modals + examples) ===
  // `activeTab` is no longer a user-facing surface (#16 removed the Design/
  // Prepare/Export tabs); it is still read once here only to round-trip the
  // legacy `sonoform-canvas` localStorage blob shape for existing users.
  const { ui, set: setUI } = useUIState({ savedTab: savedCanvas?.activeTab });
  const {
    activeTab,
    showLoadModal,
    showCloudModal,
    showSaveDialog,
    saveName,
    showExamples,
    pendingExample,
    showSubmitModal,
  } = ui;

  // === Canvas sizing (owns the sonoform-canvas blob incl. activeTab) ===
  const {
    presetIndex,
    setPresetIndex,
    canvasW,
    setCanvasW,
    canvasH,
    setCanvasH,
    unit,
    setUnit,
    margin,
    setMargin,
    outputMode,
    setOutputMode,
    applyCanvasSize,
    bedWmm,
    bedHmm,
  } = useCanvasSize({ savedCanvas, activeTab });

  // === Optimization applied state (export + plot overlay basis) ===
  // The interactive simplify/merge/reorder CONTROLS lived in the legacy Prepare
  // tab's OptimizeSection. For #16 AC2 they are re-homed into a compact
  // OptimizeControls panel portaled (as a sibling) into the shell's operations
  // region. `appliedOptimizations`/`appliedOpsList` still feed export + the plot
  // overlay; the update/apply/revert handlers drive the re-homed controls.
  const {
    optimizations,
    updateOptimization,
    applyOptimization,
    revertOptimization,
    appliedOptimizations,
    appliedOpsList,
  } = useOptimizations();

  // === Document default operation (C2 / #11) ===
  // The stroke/operation swatch with NOTHING selected sets the default operation
  // assigned to the NEXT added layer. Held in state (so the control-bar swatch
  // reflects it) AND mirrored to a ref so the (stable) useLayers getter reads the
  // live value at add-time without re-creating addLayer. Seeded to 'op-cut' so the
  // legacy add behavior is unchanged (byte-stable).
  const [defaultOperationId, setDefaultOperationId] = useState("op-cut");
  const defaultOperationIdRef = useRef(defaultOperationId);
  useEffect(() => {
    defaultOperationIdRef.current = defaultOperationId;
  }, [defaultOperationId]);
  const getDefaultOperationId = useCallback(() => defaultOperationIdRef.current, []);

  // === Layers ===
  // NOTE: useLayers also exposes the per-row randomize-seed handler
  // (randomizeLayer). It is NOT wired here: the Object Tree row's seed control
  // was removed in WI-5, and lock-aware randomization (WI-6 / spec §9) is driven
  // by the surviving randomizeLayerParams (row dice) + randomizeAll /
  // randomizeAllParams (tree header). randomizeLayer survives in useLayers for
  // any future re-home, but Studio no longer references it.
  const {
    layers,
    addLayer,
    addImportedLayer,
    addTextLayer,
    updateLayer,
    reorderLayers,
    changeLayerPattern,
    duplicateLayer,
    removeLayer,
    randomizeLayerParams,
    randomizeAll,
    randomizeAllParams,
    loadLayerSet,
    bgColor,
    setBgColor,
    // Naqsha Panels (WI-6). The panel array + setter are owned by useLayers (it
    // also persists `panels` to `sonoform-panels` and each `layer.panelId` to
    // `sonoform-layers` automatically). Studio threads them into cloud
    // persistence (ungated), the canvas (laser-gated), and the LayerTree grouped
    // tier + per-panel export (laser-gated).
    panels,
    setPanels,
  } = useLayers({ persistToLocal: limits.localStorage, maxLayers: limits.maxLayers, getDefaultOperationId });

  // Pro-shell Inspector + Object-tree slots (B3 / #6, B2 / #5). Null in the
  // legacy layout (no provider), so the portals below are true no-ops when the
  // pro shell is off.
  const inspectorSlot = useInspectorSlot();
  const objectTreeSlot = useObjectTreeSlot();

  // === Document operation library + active machine profile (B2 / #5) ===
  // `activeProfileId` is the SINGLE SOURCE OF TRUTH for the active machine
  // profile (the #5 machine-profile selector + Document Setup drive it). It is
  // SEEDED from the persisted `outputMode` so a returning user's saved laser /
  // plotter profile is restored on load and export colors stay byte-stable
  // (`outputMode` lives in the `sonoform-canvas` localStorage blob; the profile
  // id itself is not separately persisted). After load, `outputMode` is only a
  // write-only persistence mirror kept current by `handleProfileChange` — the
  // legacy OutputModeSection that used to *set* it is gone (#16). Operations are
  // seeded EXACTLY as before (seedOperations(), same ids/colors), so a remap
  // only fires when the user switches profiles.
  const [activeProfileId, setActiveProfileId] = useState(outputMode);

  // === Operation library + assignment undo/redo (C1 / #10) ===
  // The operation library is owned by a FOCUSED history hook (not a bare
  // useState) so library edits AND operation assignment (a layer's operationId)
  // are undoable/redoable. Assignment stays owned by useLayers; the hook only
  // snapshots a cheap {layerId: operationId} map captured from the CURRENT
  // layers — never whole layer objects — so undo can't disturb other layer
  // fields. `layersRef` lets the (stable) capture/restore callbacks read the
  // live layers without re-creating the hook each render. Seeded EXACTLY as
  // before (seedOperations(), same ids/colors) so export stays byte-stable.
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  const captureAssignments = useCallback(() => {
    const map = {};
    for (const l of layersRef.current) map[l.id] = l.operationId;
    return map;
  }, []);
  const restoreAssignments = useCallback(
    (assignments) => {
      for (const l of layersRef.current) {
        const want = assignments[l.id];
        // Only reassign layers present in the snapshot whose operationId differs
        // — layers added after the snapshot keep their current assignment.
        if (want !== undefined && want !== l.operationId) {
          updateLayer(l.id, { operationId: want });
        }
      }
    },
    [updateLayer]
  );
  const {
    operations,
    commitOperations,
    commitAssignment,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useOperationsHistory({
    initialOperations: seedOperations(),
    captureAssignments,
    restoreAssignments,
  });

  // === Live selection state (B2 / #5) ===
  // Replaces the old hardcoded `layers[0]` placeholder. Clicking a tree row sets
  // this; the Inspector consumes it. Falls back to the top layer when nothing is
  // selected yet (so the shell inspector is populated) and self-heals when the
  // selected layer is removed.
  const [selectedLayerIdState, setSelectedLayerId] = useState(null);
  const selectionExists =
    selectedLayerIdState != null &&
    layers.some((l) => l.id === selectedLayerIdState);
  const selectedLayerId = selectionExists
    ? selectedLayerIdState
    : layers[0]?.id ?? null;

  // Text edit lifecycle (phase 5). `editingNodeId` names the text layer whose
  // content is being typed into the on-canvas TextEditOverlay; null = no editor
  // open. Create opens it; Escape / a tool-switch commits + closes it.
  const [editingNodeId, setEditingNodeId] = useState(null);

  // Switching the machine profile sets the document's active profile AND re-maps
  // the operation library to that profile's process/param/color vocabulary
  // (laser locks cut/score/engrave colors; plotter/drag leave them editable).
  // Keep the legacy `outputMode` in sync for the laser/plotter pair so the
  // export path (which still reads it) follows the selector.
  // Switching the machine profile is NOT undoable (out of #10's scope, and a
  // pre-remap snapshot's colors/params no longer fit the new profile — so
  // cross-profile undo is semantically broken). Route the remap through the
  // history hook's non-recording `resetHistory`, which replaces the library and
  // CLEARS the undo/redo stacks.
  // Bed-as-artboard is OVERRIDABLE document state (C6 / #14): seeded from the
  // active profile's defaultBed, switched back to that default whenever the
  // machine profile changes (inside handleProfileChange — the single profile
  // path), and overridable to a preset or custom dims by the Document Setup
  // dialog. CanvasChrome (rulers + bed rect) and StatusBar read THIS state, so
  // applying updates them immediately. It is intentionally NOT threaded into the
  // export manifest (export keeps reading the separate canvasW/H-derived
  // bedWmm/bedHmm), so changing the artboard never alters export output.
  const [bedSize, setBedSize] = useState(() => defaultBedSize(activeProfileId));

  // Document Setup dialog open state (C6 / #14). Opened from the File menu.
  const [documentSetupOpen, setDocumentSetupOpen] = useState(false);

  // Click-to-place: picking an asset arms placement mode ({ svg, paths, bbox })
  // instead of dropping the layer at its native ~0,0 (hard to see / grab). The
  // canvas then shows a cursor-following ghost; the click commits it centred.
  const [placement, setPlacement] = useState(null);

  // Switching the machine profile also resets the bed-as-artboard to the new
  // profile's default bed (C6 / #14). This lives HERE — the single profile-change
  // path the LayerTree selector AND the Document Setup dialog both route through —
  // so the default bed follows the machine wherever the switch originates, and a
  // custom bed the dialog sets afterward (it calls setBedSize AFTER this) is not
  // clobbered. `setBedSize` is a stable setState referenced at call time.
  const handleProfileChange = useCallback(
    (nextProfileId) => {
      setActiveProfileId(nextProfileId);
      setBedSize(defaultBedSize(nextProfileId));
      // Remap the library to the target profile. Variable-weight band ops keep
      // their reserved spectrum colors under laser/plotter (band exemption), but
      // a profile that does NOT support banding (drag cutter — a blade has no
      // line weight) must DROP any band rows entirely, so switching to it hides
      // the feature instead of leaking orphan band rows into the panel (#17).
      const remapped = remapOperationsToProfile(operations, nextProfileId);
      resetHistory(
        supportsVariableWeight(nextProfileId)
          ? remapped
          : remapped.filter((o) => !isBandOperation(o))
      );
      // Mirror the laser/plotter profile into the persisted `outputMode` so the
      // chosen profile round-trips through the `sonoform-canvas` localStorage
      // blob and `activeProfileId` re-seeds from it on next load. This is now a
      // write-only persistence mirror (the legacy OutputModeSection that read +
      // wrote it is gone, #16). `dragCutter` has no legacy outputMode value, so
      // its persistence is out of scope here — unchanged from before.
      if (nextProfileId === "laser" || nextProfileId === "plotter") {
        setOutputMode(nextProfileId);
      }
    },
    [setOutputMode, resetHistory, operations]
  );

  // === Operations-panel edit handlers (C1 / #10) — all routed through history.
  // Library edits (reorder / recolor / param-edit / remove) flow through
  // `commitOperations(mapper)`; "Add" appends a fresh operation under the active
  // profile's first process with that process's default machineParams.
  const handleAddOperation = useCallback(() => {
    const process = profileProcesses(activeProfileId)[0];
    commitOperations((ops) =>
      addOperation(ops, {
        name: `Operation ${ops.length + 1}`,
        process,
        machineParams: defaultMachineParams(activeProfileId, process),
      })
    );
  }, [activeProfileId, commitOperations]);

  // Variable line-weight toggle / N control (C8 / #17). Stores the per-layer
  // `variableWeight = { enabled, n }` AND syncs the operation library's band rows
  // in ONE handler (the only place that owns both updateLayer and
  // commitOperations) — never in an effect, matching useOperationsHistory's
  // "recording is imperative" contract. Enable/disable/N-change all route here:
  // syncWeightBand strips this layer's old band and (when enabled on a supported
  // profile) appends a fresh N-row band, so changing N re-buckets live.
  const handleVariableWeightChange = useCallback(
    (layerId, { enabled, n }) => {
      updateLayer(layerId, { variableWeight: { enabled, n } });
      commitOperations((ops) =>
        syncWeightBand(ops, {
          layerId,
          profileId: activeProfileId,
          enabled,
          n,
        })
      );
    },
    [updateLayer, commitOperations, activeProfileId]
  );

  // The inspector edits the selected layer — EXCEPT for a Moiré role-B layer,
  // whose params live on its partner A (B reads A). Redirect edits to A so
  // selecting/editing a role-B row behaves like the legacy LayersSection. When A
  // is missing (orphan B) or the layer is not role-B, the target is the layer
  // itself.
  const inspectorTargetId =
    findMoirePartnerA(
      layers.find((l) => l.id === selectedLayerId),
      layers
    )?.id ?? selectedLayerId;

  // === Operation assignment (C2 / #11) — the stroke/operation picker ===
  // Assigning a layer's operationId is routed through #10's `commitAssignment`
  // so it is genuinely undoable/redoable (the snapshot captures the prior
  // {layerId: operationId} map; undo restores it via updateLayer). The LayerTree
  // row chip assigns its OWN row's layer.
  const assignOperationToLayer = useCallback(
    (layerId, operationId) => {
      if (!layerId) return;
      commitAssignment(() => updateLayer(layerId, { operationId }));
    },
    [commitAssignment, updateLayer]
  );

  // The control-bar swatch + tool-strip base chip share one handler. With a layer
  // actually selected (raw selection — NOT the layers[0] fallback that
  // `selectedLayerId` uses for the inspector) the pick ASSIGNS that layer. With
  // nothing selected, it sets the DOCUMENT DEFAULT operation for the next added
  // layer — which is plain setState, NOT an assignment (there's no layer to
  // reassign), so it does not go through the undo history.
  const handleSwatchAssign = useCallback(
    (operationId) => {
      if (selectionExists) {
        assignOperationToLayer(inspectorTargetId, operationId);
      } else {
        setDefaultOperationId(operationId);
      }
    },
    [selectionExists, inspectorTargetId, assignOperationToLayer]
  );

  // The swatch/chip color: the selected layer's operation when a layer is
  // selected, else the document default operation (for the next added layer).
  const swatchOperation = selectionExists
    ? resolveOperation(operations, layers.find((l) => l.id === inspectorTargetId)?.operationId)
    : resolveOperation(operations, defaultOperationId);

  // Pro-shell menu-bar slot (B5 / #8). Null in the legacy layout (no provider),
  // so the menu-bar portal below is a no-op AND the legacy loose top bar keeps
  // rendering unchanged. When present, the menu bar is portaled into the shell's
  // Menu bar region and the legacy loose top bar is suppressed (no orphans).
  const menuSlot = useMenuSlot();

  // Pro-shell tool-strip + contextual-control-bar slots (B6 / #9). Null in the
  // legacy layout (no provider) → both portals are no-ops. Active-tool state is
  // owned here (Studio) so the same state drives the tool strip and the control
  // bar; hotkeys are bound only when the tool strip slot is present (flag-ON),
  // so V/T/space never hijack the legacy layout.
  const toolStripSlot = useToolStripSlot();
  const controlBarSlot = useControlBarSlot();
  const { activeTool, setActiveTool } = useActiveTool({
    enabled: !!toolStripSlot,
  });
  // Canvas pan/zoom the Hand/Zoom tools drive, wired into the (shell-hosted)
  // RightPanel canvas.
  const canvasView = useCanvasView();

  // Color-view lens (spec: docs/material-preview-plan.md). Operation (technical
  // cut/score/engrave colors) vs Material (preview on a real sheet). Preview-only
  // — feeds the canvas, never export. Materials default to the built-in set (no
  // org context in Studio yet; org materials drop in later via the same prop).
  const colorView = useColorView();

  // Interactive per-layer transform (Select tool: move / resize / rotate).
  // Committed transforms live on `layer.transform` (so they persist + export
  // for free). `liveTransform` is the in-progress drag override — held
  // separately so dragging re-renders the canvas immediately WITHOUT writing
  // (and re-persisting) the layer on every frame; it's flushed to the layer on
  // pointer-up. A ref mirrors it so the pointer-up commit reads the latest drag
  // value without a stale closure.
  const [liveTransform, setLiveTransform] = useState(null);
  const liveTransformRef = useRef(null);
  const handleCanvasMove = useCallback((id, transform) => {
    const next = { id, transform };
    liveTransformRef.current = next;
    setLiveTransform(next);
  }, []);
  const handleCanvasCommit = useCallback(() => {
    const lt = liveTransformRef.current;
    liveTransformRef.current = null;
    setLiveTransform(null);
    if (lt) updateLayer(lt.id, { transform: lt.transform });
  }, [updateLayer]);

  // Transform map (layerId → transform) the canvas reads for render + hit-test:
  // each layer's committed transform, with the live drag override on top.
  const canvasTransforms = useMemo(() => {
    const m = {};
    for (const l of layers) if (l.transform) m[l.id] = l.transform;
    if (liveTransform) m[liveTransform.id] = liveTransform.transform;
    return m;
  }, [layers, liveTransform]);

  // Pro-shell status bar (B4 / #7). The active machine profile drives the
  // bed-as-artboard dimensions (NOT canvasW/H), so the bed + status-bar bed
  // readout update when the profile changes. Live cursor coords (in the active
  // unit) flow up from RightPanel through `setCursorPos`.
  const statusBarSlot = useStatusBarSlot();
  const [cursorPos, setCursorPos] = useState(null);

  // Plot preview + overlap overlay toggle (C7 / #15). OFF by default → clean
  // canvas. Driven from the View > Overlays menu item and surfaced as the
  // PlotOverlay on the canvas.
  const [showOverlays, setShowOverlays] = useState(false);

  // Pro-shell operations panel slot (C1 / #10). Null in the legacy layout (no
  // provider) → the panel portal below is a no-op. The same slot presence gates
  // the undo/redo keyboard shortcut so ⌘Z never hijacks the legacy layout.
  const operationsPanelSlot = useOperationsPanelSlot();

  // ⌘Z / ⇧⌘Z (Ctrl on non-mac) drive the operation-library + assignment history,
  // bound only on the pro-shell path and ignored while typing into a text field
  // (the operations panel's number inputs) so editing a param never triggers an
  // undo. Mirrors the useActiveTool({enabled}) gate.
  useEffect(() => {
    if (!operationsPanelSlot) return undefined;
    const isTextEntry = (t) => {
      if (!t) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t.isContentEditable
      );
    };
    const onKeyDown = (e) => {
      if (e.key !== "z" && e.key !== "Z") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTextEntry(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [operationsPanelSlot, undo, redo]);

  const { groups, saveGroup, deleteGroup, renameGroup } = useLayerGroups();
  const patternInstancesRef = useRef({});
  const canvasContainerRef = useRef(null);

  // === SVG import (issue #12, C4 — place as artwork) ===
  // One import = one layer, via three entry points: File>Import (file picker),
  // drag-drop onto the canvas, and paste. All funnel through addImportedLayer;
  // malformed/empty SVG surfaces a brief inline message (the app has no toast).
  const importFileInputRef = useRef(null);
  const [importError, setImportError] = useState(null);
  const importErrorTimer = useRef(null);

  const handleImportSVG = useCallback(
    (svgText) => {
      const outcome = addImportedLayer(svgText);
      if (!outcome.ok) {
        setImportError(outcome.error || "Could not import this SVG.");
        clearTimeout(importErrorTimer.current);
        importErrorTimer.current = setTimeout(() => setImportError(null), 4000);
      } else {
        setImportError(null);
      }
    },
    [addImportedLayer]
  );

  // Click-to-place commit: drop the armed asset centred on the canvas point the
  // user clicked, then auto-select it + switch to the Select tool so it's
  // immediately draggable/resizable. Capacity failures surface as import errors.
  const handlePlaceAsset = useCallback(
    (point) => {
      if (!placement) return;
      const transform = centerTransform(placement.bbox, point);
      const outcome = addImportedLayer(placement.svg, { transform });
      setPlacement(null);
      if (!outcome.ok) {
        setImportError(outcome.error || "Could not place this asset.");
        clearTimeout(importErrorTimer.current);
        importErrorTimer.current = setTimeout(() => setImportError(null), 4000);
        return;
      }
      setSelectedLayerId(outcome.id);
      setActiveTool("select");
    },
    [placement, addImportedLayer, setActiveTool]
  );
  const handleCancelPlacement = useCallback(() => setPlacement(null), []);

  // Text tool: RightPanel hands up the create geometry (origin + box + lineMode)
  // from a click/drag. Spin up an (empty) text layer, select it, and OPEN the
  // on-canvas editor (phase 5). The tool deliberately STAYS on 'text' through
  // create — switching to 'select' here would, via the tool-switch effect below,
  // immediately exit (and remove) the just-created empty layer. The effect uses
  // a prev-tool ref so this same-commit (tool='text' + editingNodeId set) does
  // not count as a switch; a later real switch away from 'text' commits + exits.
  const handleCreateText = useCallback(
    ({ x, y, box, lineMode }) => {
      const outcome = addTextLayer({ params: { x, y, box, lineMode } });
      if (!outcome.ok) return;
      setSelectedLayerId(outcome.id);
      setEditingNodeId(outcome.id);
    },
    [addTextLayer]
  );

  // Typing in the overlay writes through to the layer's params.text live (one
  // setLayers map per keystroke — see useLayers.updateLayer). This is NOT in the
  // undo history (only operation assignments are snapshotted), so it does not
  // spam undo; history coalescing for text is a phase 6 concern.
  const handleEditText = useCallback(
    (id, text) => {
      const layer = layers.find((l) => l.id === id);
      if (!layer) return;
      updateLayer(id, { params: { ...layer.params, text } });
    },
    [layers, updateLayer]
  );

  // Exit edit (Escape, or a tool switch via the effect below). Removes an
  // abandoned EMPTY text layer (a create the user typed nothing into), then
  // returns to the Select tool so the freshly-committed text is movable.
  const handleExitEdit = useCallback(() => {
    const id = editingNodeId;
    setEditingNodeId(null);
    if (id) {
      const layer = layers.find((l) => l.id === id);
      if (layer && isTextLayer(layer) && !(layer.params?.text || "").trim()) {
        removeLayer(id);
      }
    }
    setActiveTool("select");
  }, [editingNodeId, layers, removeLayer, setActiveTool]);

  // Re-enter edit for an existing text layer (double-click). Selects it and
  // opens the editor; the tool is left as-is (double-click works from Select).
  const handleRequestEdit = useCallback((id) => {
    setSelectedLayerId(id);
    setEditingNodeId(id);
  }, []);

  // Effect-ordering guard: only exit edit on an ACTUAL tool switch away from
  // 'text' while editing. The create transition keeps tool='text' AND sets
  // editingNodeId in the same commit, so prev === activeTool there and the body
  // no-ops — the editor survives create. A later switch (Select/Hand/Zoom)
  // commits + exits via handleExitEdit.
  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = activeTool;
    if (editingNodeId && prev !== activeTool && activeTool !== "text") {
      handleExitEdit();
    }
  }, [activeTool, editingNodeId, handleExitEdit]);

  // Esc cancels an armed placement (mirrors the modal's Esc-to-close).
  useEffect(() => {
    if (!placement) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPlacement(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placement]);

  // File > Import — open a file picker and read the chosen .svg.
  const handleImportClick = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-importing the same file
      if (!file) return;
      try {
        const text = await file.text();
        handleImportSVG(text);
      } catch {
        setImportError("Could not read that file.");
      }
    },
    [handleImportSVG]
  );

  // Drag-drop + paste onto the canvas (the other two entry points).
  useSvgImport(canvasContainerRef, handleImportSVG);

  // === Dirty-tracking + share-link hydration ===
  const { markCleanFrom, isDirty } = useDesignPersistence({
    layers,
    bgColor,
    loadLayerSet,
    setBgColor,
    setCanvasW,
    setCanvasH,
    setPresetIndex,
    setUnit,
    setMargin,
    persistToLocal: limits.localStorage,
  });

  // === Cloud save/load ===
  const {
    currentDesignId,
    setCurrentDesignId,
    handleSaveToCloud,
    handleLoadCloudDesign,
    saveState,
    lastSavedAt,
    designName,
    setDesignName,
  } = useCloudPersistence({
    user,
    limits,
    layers,
    canvasW,
    canvasH,
    presetIndex,
    bgColor,
    // Panels ride the cloud blob UNGATED (WI-6). localStorage is already ungated
    // via useLayers; gating the cloud-save panels behind laser would silently
    // drop `panels` when saving in plotter, breaking dormancy + the cloud
    // round-trip. Always pass the real array + setter.
    panels,
    setPanels,
    loadLayerSet,
    applyCanvasSize,
    markCleanFrom,
    canvasContainerRef,
  });

  // Document Setup apply (C6 / #14). Routes the profile half through the SAME
  // handleProfileChange the LayerTree selector uses (so the remap + default-bed
  // reset stay single-sourced), THEN overrides the bed with the dialog's chosen
  // preset/custom dims. Order matters: handleProfileChange resets the bed to the
  // new profile's default first, so the setBedSize below must come AFTER it or
  // the reset would clobber the custom bed.
  // Also re-homes the EXPORT document size (#16 AC2): canvasW/canvasH come back
  // from the dialog (px) and route through applyCanvasSize so the export
  // dimensions become user-settable again AND presetIndex stays coherent (snaps
  // to a known preset or Custom, exactly as the cloud/example loaders do).
  const handleDocumentSetupApply = useCallback(
    ({ profileId, bedSize: nextBed, unit: nextUnit, canvasW: nextW, canvasH: nextH }) => {
      if (profileId && profileId !== activeProfileId) {
        handleProfileChange(profileId);
      }
      if (nextBed) setBedSize(nextBed);
      // The dialog's mm/in toggle drives the document's global unit (rulers,
      // status bar, length-tagged params all follow). bedSize stays canonical mm.
      if ((nextUnit === "mm" || nextUnit === "in") && nextUnit !== unit) {
        setUnit(nextUnit);
      }
      if (typeof nextW === "number" && typeof nextH === "number") {
        applyCanvasSize(nextW, nextH);
      }
    },
    [activeProfileId, handleProfileChange, applyCanvasSize, unit, setUnit]
  );

  // AI-pattern chat (create / revise) — re-homed for #16 AC2. The legacy
  // LayersSection per-layer "AI" action (onOpenAIChat) is gone; the shell re-homes
  // a trigger as an Object-menu item ("Generate with AI…", create-mode) AND keeps
  // the per-layer "revise" path available (the chat opens against the selected
  // layer when one exists). The open/mode/target state already lives in useUIState
  // (aiChatOpen/aiChatMode/aiChatLayer). handleAIPatternGenerated re-homes the
  // surviving success behavior verbatim (switch the target layer to the generated
  // pattern, merging the dynamic defaults).
  const handleOpenAIChat = useCallback(
    (layer) => {
      if (layer?.patternType?.startsWith("ai-")) {
        setUI("aiChatMode", "revise");
        setUI("aiChatLayer", layer);
      } else {
        setUI("aiChatMode", "create");
        setUI("aiChatLayer", layer || null);
      }
      setUI("aiChatOpen", true);
    },
    [setUI]
  );

  const handleAIPatternGenerated = useCallback(
    (patternId, defaultParams) => {
      const target = ui.aiChatLayer;
      if (target) {
        updateLayer(target.id, {
          patternType: patternId,
          params: { ...(defaultParams || {}), ...(getDynamicDefaults(patternId) || {}) },
        });
      }
    },
    [ui.aiChatLayer, updateLayer]
  );

  // The active machine profile drives export. `activeProfileId` is the single
  // source of truth (#16); on the export path (laser | plotter) it equals the
  // persisted `outputMode`, so the resolved colors are unchanged.
  const machineProfile = activeProfileId;

  // Resolve a layer's export color through its operation (A4). Laser → the
  // operation's locked-convention color; plotter → the layer's own color.
  const exportLayer = (layer) => ({
    ...layer,
    color: resolveExportColor(layer, {
      operations,
      outputMode: machineProfile,
    }),
  });

  const buildExportManifest = () =>
    buildManifest({
      version: "1",
      machineProfile,
      operations,
      bedW: bedWmm,
      bedH: bedHmm,
      bedUnit: "mm",
      layers,
      optimizations: appliedOpsList,
    });

  // Per-layer SVG export (#16 AC2 re-home). Re-homed onto the LayerTree row's
  // Export action. The legacy LayersSection row action called exportLayerSVG with
  // the layer + its live pattern instance; here we additionally resolve the
  // layer's export color through its operation (exportLayer), so a single-layer
  // export matches the active-profile color convention used by Export-all.
  const handleExportLayer = (layerId) => {
    const layer = layers.find((l) => l.id === layerId);
    const instance = patternInstancesRef.current?.[layerId];
    if (!layer || !instance) return;
    exportLayerSVG(exportLayer(layer), instance, canvasW, canvasH, {
      metadata: limits.svgMetadata,
      profileId: machineProfile,
      font: textFont,
    });
  };

  const handleExportAll = (includeHidden, opts = {}) => {
    const mapped = layers.map(exportLayer);
    exportAllLayersSVG(
      mapped,
      patternInstancesRef.current || {},
      canvasW,
      canvasH,
      includeHidden,
      {
        metadata: limits.svgMetadata,
        manifest: buildExportManifest(),
        filename: opts.filename,
        optimizations: appliedOptimizations,
        // Active profile drives the per-element variable-weight realization for
        // enabled layers (#17 / #4 follow-up). Additive: non-enabled layers are
        // unaffected and export byte-identically.
        profileId: machineProfile,
        // Resolved font so text layers export their glyph outlines (phase 6).
        font: textFont,
      }
    );
  };

  // Per-panel ZIP export (Naqsha Panels WI-6, spec §3). Laser-only affordance:
  // bundles one SVG per VISIBLE panel + a combined SVG into a timestamped ZIP.
  // Mirrors handleExportAll's option shape; `exportLayer` spreads each layer so
  // `panelId` survives → `layersForPanel` inside exportPanelsZip partitions
  // correctly. Leaves the flat handleExportAll path untouched.
  const handleExportPanelsZip = () => {
    const mapped = layers.map(exportLayer);
    exportPanelsZip(panels, mapped, patternInstancesRef.current || {}, canvasW, canvasH, {
      designName: "untitled",
      svg: {
        metadata: limits.svgMetadata,
        manifest: buildExportManifest(),
        optimizations: appliedOptimizations,
        profileId: machineProfile,
        font: textFont,
      },
    });
  };

  const handleSaveLayerGroup = () => {
    setUI("saveName", "");
    setUI("showSaveDialog", true);
  };

  // Share-link state snapshot, shared by the legacy top bar's ShareLinkButton
  // and the pro menu bar's account cluster so both reproduce the same design.
  const buildShareState = () => ({
    canvasW,
    canvasH,
    presetIndex,
    unit,
    margin,
    bgColor,
    layers,
  });

  const handleConfirmSave = () => {
    const container = canvasContainerRef.current;
    const canvas = container?.querySelector("canvas");
    let thumbnail = null;
    if (canvas) {
      try {
        thumbnail = canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        /* tainted canvas or unavailable */
      }
    }
    const name = saveName.trim() || "Untitled";
    saveGroup(name, layers, canvasW, canvasH, thumbnail);
    setUI("showSaveDialog", false);
  };

  const handleLoadGroup = (group) => {
    loadLayerSet(group.layers);
    if (group.canvasW && group.canvasH) {
      applyCanvasSize(group.canvasW, group.canvasH);
    }
    markCleanFrom(group.layers, bgColor);
  };

  // === Examples ===
  // Apply a curated example onto the canvas: layers, background, and size.
  // presetIndex is recomputed from the canvas size (as the cloud loader does),
  // so the example JSON never has to store it. currentDesignId is cleared so a
  // later Save creates a new design rather than overwriting a real saved one.
  const applyExample = useCallback(
    (example) => {
      const cfg = example?.config;
      if (!cfg?.layers) return;
      loadLayerSet(cfg.layers);
      if (typeof cfg.bgColor === "string") setBgColor(cfg.bgColor);
      if (cfg.canvasW && cfg.canvasH) {
        applyCanvasSize(cfg.canvasW, cfg.canvasH);
      }
      setCurrentDesignId(null);
      markCleanFrom(cfg.layers, cfg.bgColor ?? bgColor);
      setUI("activeTab", "design");
      setUI("showExamples", false);
      setUI("pendingExample", null);
    },
    [
      loadLayerSet,
      setBgColor,
      applyCanvasSize,
      setCurrentDesignId,
      markCleanFrom,
      bgColor,
      setUI,
    ]
  );

  // Card click: confirm first if there's unsaved work, otherwise load now.
  const handleSelectExample = useCallback(
    (example) => {
      if (isDirty()) setUI("pendingExample", example);
      else applyExample(example);
    },
    [isDirty, applyExample, setUI]
  );

  if (loading) {
    return (
      <div className="h-screen bg-paper flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-paper">
      {/* Hidden file input backing File > Import (issue #12). Click is triggered
          by the menu item; reads the chosen .svg and adds one artwork layer. */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={handleImportFileChange}
      />
      {/* Studio-in-canvas (Lane B / B7, #16): hosted inside the pro shell's
          Canvas region, so Studio renders ONLY the live canvas here. The title,
          menu, tool strip, inspector, object tree, status bar, and operations
          panel are all portaled into their own shell regions below. The legacy
          two-pane layout (loose top bar + LeftPanel Design/Prepare/Export tabs)
          was removed in #16. */}
      <div className="relative flex-1 min-h-0">
        {/* SVG import failure message (issue #12). No toast system in the app,
            so a brief inline banner over the canvas. Auto-clears after 4s. */}
        {importError && (
          <div
            role="alert"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-paper border border-red-500/50 text-red-500 text-xs rounded-md px-3 py-1.5 shadow-sm"
          >
            {importError}
          </div>
        )}
        <RightPanel
          layers={layers}
          // Operation library + active profile → canvas strokes match export
          // color (each layer draws in its operation's color on laser).
          operations={operations}
          machineProfile={activeProfileId}
          colorView={colorView.colorView}
          // Naqsha Panels (WI-6): laser-gated. Empty in plotter/dragCutter so the
          // canvas render is byte-identical to today; the real panels fold in
          // per-panel visibility only in laser mode.
          panels={activeProfileId === "laser" ? panels : []}
          canvasW={canvasW}
          canvasH={canvasH}
          patternInstancesRef={patternInstancesRef}
          canvasContainerRef={canvasContainerRef}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          unit={unit}
          externalZoom={canvasView.zoom}
          onZoomChange={canvasView.setZoom}
          externalPan={canvasView.pan}
          bedSize={bedSize}
          onCursorMove={setCursorPos}
          showPlotOverlay={showOverlays}
          appliedOptimizations={appliedOptimizations}
          activeTool={activeTool}
          transforms={canvasTransforms}
          selectedNodeId={selectedLayerId}
          onSelect={setSelectedLayerId}
          onMove={handleCanvasMove}
          onCommit={handleCanvasCommit}
          onPanBy={canvasView.panBy}
          placement={placement}
          onPlaceAsset={handlePlaceAsset}
          onCancelPlacement={handleCancelPlacement}
          onCreateText={handleCreateText}
          editingNodeId={editingNodeId}
          onEditText={handleEditText}
          onExitEdit={handleExitEdit}
          onRequestEdit={handleRequestEdit}
        />

        {/* Color-view lens switch — bottom-left of the canvas. Operation (technical
            cut/score/engrave) vs Material (preview on a real sheet). Preview-only. */}
        <ColorViewControl
          mode={colorView.mode}
          material={colorView.material}
          materials={colorView.materials}
          needsMaterialChoice={colorView.needsMaterialChoice}
          onSetMode={colorView.setMode}
          onSelectMaterial={colorView.selectMaterial}
        />

        {/* Per-panel ZIP export (Naqsha Panels WI-6, spec §5) — LASER-ONLY. The
            grouped-tier affordance: bundles one SVG per visible panel + a combined
            SVG into a timestamped ZIP. Hidden in plotter/dragCutter so the flat
            export path is the only one there. Stable aria-label so the gate is
            assertable. */}
        {activeProfileId === "laser" && (
          <div className="absolute top-3 right-3 z-20">
            <button
              type="button"
              aria-label="Export panels (ZIP)"
              onClick={handleExportPanelsZip}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-paper-warm border border-hairline hover:border-ink-soft transition-colors shadow-lg text-xs text-ink-soft"
            >
              Export panels (ZIP)
            </button>
          </div>
        )}

        {/* Examples gallery (re-homed in #16). Opened from File > Examples;
            overlays the canvas region (the legacy LeftPanel that used to host it
            is gone). Picking an example loads it; Close dismisses the overlay. */}
        {showExamples && (
          <div className="absolute inset-0 z-30">
            <ExamplesGallery
              examples={EXAMPLES}
              onSelect={handleSelectExample}
              onClose={() => setUI("showExamples", false)}
            />
          </div>
        )}
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center"
          onClick={() => setUI("showSaveDialog", false)}
        >
          <div
            className="bg-paper border border-hairline rounded-sm w-80 p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-ink">
              Save layer group
            </h3>
            <input
              className="w-full bg-paper-warm text-ink text-sm px-2.5 py-1.5 rounded-xs border border-hairline outline-none focus:border-violet transition-colors duration-fast ease-out-quart"
              placeholder="Untitled"
              value={saveName}
              onChange={(e) => setUI("saveName", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmSave()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleConfirmSave}
                className="flex-1 py-1.5 text-sm font-medium rounded-xs bg-saffron text-ink hover:bg-saffron-hover transition-colors duration-fast ease-out-quart"
              >
                Save
              </button>
              <button
                onClick={() => setUI("showSaveDialog", false)}
                className="flex-1 py-1.5 text-sm font-medium rounded-xs bg-paper-warm text-ink-soft hover:bg-muted hover:text-ink transition-colors duration-fast ease-out-quart"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New-layer pattern picker (the "periodic table") */}
      <PatternPickerModal
        open={ui.showPatternPicker}
        onClose={() => setUI("showPatternPicker", false)}
        onPick={(id) => {
          addLayer(id);
          setUI("showPatternPicker", false);
        }}
      />

      {/* Load modal */}
      {showLoadModal && (
        <LayerGroupModal
          groups={groups}
          onLoad={handleLoadGroup}
          onDelete={deleteGroup}
          onRename={renameGroup}
          onClose={() => setUI("showLoadModal", false)}
        />
      )}

      {showCloudModal && (
        <CloudSaveModal
          onLoad={handleLoadCloudDesign}
          onLoadConfig={(config) => {
            if (config.layers) loadLayerSet(config.layers);
            if (config.canvasW && config.canvasH) {
              applyCanvasSize(config.canvasW, config.canvasH);
            }
            markCleanFrom(config.layers || layers, bgColor);
          }}
          onClose={() => setUI("showCloudModal", false)}
        />
      )}

      {showSubmitModal && (user || submitOrg) && (
        <StudioSubmitModal
          userId={user?.id}
          submitOrg={submitOrg}
          layers={layers}
          getPatternInstances={() => patternInstancesRef.current || {}}
          canvasW={canvasW}
          canvasH={canvasH}
          operations={operations}
          designId={currentDesignId}
          onClose={() => setUI("showSubmitModal", false)}
          onSubmitted={() => setUI("showSubmitModal", false)}
        />
      )}


      {/* Pro-shell top menu bar (B5 / #8). Portaled into the shell's Menu bar
          region when the slot is present; renders nothing in the legacy layout
          (slot is null → no-op). Its items wire to the existing Studio handlers
          (Examples/Load/Cloud/Export/Save/Share), so behavior is unchanged. */}
      {menuSlot &&
        createPortal(
          <MenuBar
            onNew={() => setUI("showPatternPicker", true)}
            onOpen={() => setUI("showLoadModal", true)}
            onExamples={() => setUI("showExamples", !showExamples)}
            onImport={handleImportClick}
            onExport={() => handleExportAll(true)}
            onSubmitToOrg={user || submitOrg ? () => setUI("showSubmitModal", true) : undefined}
            onSave={handleSaveLayerGroup}
            onSaveToCloud={handleSaveToCloud}
            onOpenCloudDesigns={() => setUI("showCloudModal", true)}
            onDocumentSetup={() => setDocumentSetupOpen(true)}
            onUndo={canUndo ? undo : undefined}
            onRedo={canRedo ? redo : undefined}
            onToggleOverlays={() => setShowOverlays((v) => !v)}
            overlaysOn={showOverlays}
            onGenerateAI={() =>
              handleOpenAIChat(
                layers.find((l) => l.id === selectedLayerId) || null
              )
            }
            buildShareState={buildShareState}
            showAdmin={showAdmin}
            onOpenAdmin={() => navigate("/admin")}
            // Save-status surface (Rec 1). Collapse the raw signals into a single
            // {kind,label} via the pure resolver; the indicator formats the
            // timestamp + offers Retry. Rename routes straight to the hook's
            // setDesignName (sent as the save `name` on the next save).
            status={resolveSaveStatus({
              saving: saveState === "saving",
              error: saveState === "error",
              dirty: isDirty(),
              lastSavedAt,
            })}
            lastSavedAt={lastSavedAt}
            onRetry={handleSaveToCloud}
            designName={designName}
            onRenameDesign={setDesignName}
          />,
          menuSlot
        )}

      {/* Pro-shell tool strip (B6 / #9). Portaled into the shell's Tool strip
          region when the slot is present; renders nothing in the legacy layout
          (slot is null → no-op). Active-tool state is owned by Studio so it also
          drives the contextual control bar below. */}
      {toolStripSlot &&
        createPortal(
          <ToolStrip activeTool={activeTool} onToolChange={setActiveTool} />,
          toolStripSlot
        )}

      {/* Pro-shell contextual control bar (B6 / #9). Portaled into the shell's
          Contextual control bar region; swaps its contents by the active tool /
          selection. No-op in the legacy layout (slot null). The inspector
          defaults to the top layer for now (object-tree selection is #5), so a
          selection exists whenever there are layers. */}
      {controlBarSlot &&
        createPortal(
          <ControlBar
            activeTool={activeTool}
            hasSelection={selectedLayerId !== null}
            docInfo={{
              canvasW,
              canvasH,
              unit,
              layerCount: layers.length,
            }}
            operation={swatchOperation}
            operations={operations}
            onAssignOperation={handleSwatchAssign}
            view={canvasView}
          />,
          controlBarSlot
        )}

      {/* Pro-shell param inspector (B3 / #6). Portaled into the shell's right
          Inspector region when the slot is present; renders nothing in the
          legacy layout (slot is null → no-op). */}
      {inspectorSlot &&
        createPortal(
          <Inspector
            layers={layers}
            // For a Moiré role-B selection this is the partner-A id, so edits
            // redirect to A (B reads A) — matching legacy LayersSection behavior.
            selectedLayerId={inspectorTargetId}
            // Active document unit (#13) — length-tagged params display/convert
            // in this unit; values stay px in layer state.
            unit={unit}
            // Active machine profile (#17, C8) — capability-gates the
            // variable-weight UI (drag-cutter hides it).
            profileId={activeProfileId}
            onUpdateLayer={updateLayer}
            onChangeLayerPattern={changeLayerPattern}
            onVariableWeightChange={handleVariableWeightChange}
          />,
          inspectorSlot
        )}

      {/* Pro-shell object tree + machine-profile selector (B2 / #5). Portaled
          into the shell's left Object-tree region when the slot is present;
          renders nothing in the legacy layout (slot null → no-op). Drives live
          selection (consumed by the Inspector above) and the document profile /
          operation-library remap. */}
      {objectTreeSlot &&
        createPortal(
          <LayerTree
            layers={layers}
            operations={operations}
            profileId={activeProfileId}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onUpdateLayer={updateLayer}
            onReorderLayers={reorderLayers}
            onProfileChange={handleProfileChange}
            // Gear beside the machine selector opens the Document Setup dialog —
            // a second entry point alongside the File menu's "Document Setup…".
            onDocumentSetup={() => setDocumentSetupOpen(true)}
            onAssignOperation={assignOperationToLayer}
            // Re-homed per-layer + header actions (#16 AC2) — wired to the
            // surviving useLayers / per-layer-export handlers.
            onDeleteLayer={removeLayer}
            onDuplicateLayer={duplicateLayer}
            onRandomizeLayerParams={randomizeLayerParams}
            onExportLayer={handleExportLayer}
            onRandomizeAll={randomizeAll}
            onRandomizeAllParams={randomizeAllParams}
            // "+ New" add-layer row → opens the pattern picker, same path as the
            // menu's New. Disabled at the tier's layer cap (addLayer no-ops there).
            onAddLayer={() => setUI("showPatternPicker", true)}
            addDisabled={layers.length >= (limits.maxLayers ?? Infinity)}
            // Naqsha Panels grouped tier (WI-6, spec §5) — LASER-ONLY. Passing []
            // in plotter/dragCutter makes LayerTree render the flat list (its
            // grouped tier renders only when panels.length > 0), so non-laser
            // profiles are byte-unchanged. The four handlers are passed
            // unconditionally; they are inert in flat mode (the grouped tier that
            // calls them isn't rendered).
            panels={activeProfileId === "laser" ? panels : []}
            onAddPanel={() => setPanels((p) => addPanel(p))}
            onAssignLayerToPanel={(layerId, panelId) =>
              updateLayer(layerId, { panelId })
            }
            onUpdatePanel={(id, patch) =>
              setPanels((p) =>
                p.map((pn) => (pn.id === id ? { ...pn, ...patch } : pn))
              )
            }
            onDeletePanel={(id, { deleteLayers }) => {
              const { panels: np, layers: nl } = deletePanel(panels, layers, id, {
                deleteLayers,
              });
              setPanels(np);
              loadLayerSet(nl);
            }}
          />,
          objectTreeSlot
        )}

      {/* Pro-shell bottom status bar (B4 / #7). Portaled into the shell's
          Status bar region when the slot is present; renders nothing in the
          legacy layout (slot null → no-op). Reports the active unit, live zoom
          %, the live cursor coords (in the active unit, fed from RightPanel via
          the same px→unit scale the rulers use), and the active machine/bed
          (from the active profile, so it tracks profile changes). */}
      {statusBarSlot &&
        createPortal(
          <StatusBar
            unit={unit}
            zoom={canvasView.zoom}
            cursor={cursorPos}
            profileId={activeProfileId}
            bedSize={bedSize}
          />,
          statusBarSlot
        )}

      {/* Pro-shell operations / cut-settings panel (C1 / #10). Portaled into the
          shell's right-bottom Operations-panel region when the slot is present;
          renders nothing in the legacy layout (slot null → no-op). Lists the
          operation library as rows with the active profile's param fields, and
          routes every edit (add / reorder / recolor / param-edit) through the
          undo/redo history so library + assignment changes are reversible. */}
      {operationsPanelSlot &&
        createPortal(
          <>
            <OperationsPanel
              operations={operations}
              profileId={activeProfileId}
              onCommitOperations={commitOperations}
              onAddOperation={handleAddOperation}
            />
            {/* Re-homed optimize controls (#16 AC2). Sibling of OperationsPanel
                in the SAME shell region so OperationsPanel (and its tests) stay
                untouched. Wired to the surviving useOptimizations API; the
                applied state already feeds export + the plot overlay. */}
            <OptimizeControls
              optimizations={optimizations}
              onUpdate={updateOptimization}
              onApply={applyOptimization}
              onRevert={revertOptimization}
            />
          </>,
          operationsPanelSlot
        )}

      {/* Document Setup dialog (C6 / #14). Gated on the pro-shell slots so it is
          live ONLY in the pro shell and a true no-op in the legacy layout. It has
          TWO entry points, both pro-shell-only: the File-menu item (menuSlot) and
          the gear beside the LayerTree machine selector (objectTreeSlot) — gate on
          either so neither opener can set documentSetupOpen with nothing mounted.
          Reads the LIVE active profile + bed so reopening shows current settings;
          Apply routes the profile half through the shared handleProfileChange,
          overrides the artboard bed, and syncs the document unit. */}
      {(menuSlot || objectTreeSlot) && (
        <DocumentSetupDialog
          open={documentSetupOpen}
          profileId={activeProfileId}
          bedSize={bedSize}
          unit={unit}
          // Export document size (#16 AC2) — makes canvasW/canvasH user-settable
          // again in the shell so export dimensions are controllable.
          canvasW={canvasW}
          canvasH={canvasH}
          onApply={handleDocumentSetupApply}
          onClose={() => setDocumentSetupOpen(false)}
        />
      )}

      {/* AI-pattern chat (#16 AC2 re-home). Gated on the menu slot so it is live
          ONLY in the pro shell (its entry point is the Object-menu item) and a
          no-op in any non-shell mount. Opens against ui.aiChatLayer when a layer
          was targeted (revise) or with none (create). On success the surviving
          handleAIPatternGenerated switches the target layer to the generated
          pattern. */}
      {menuSlot && ui.aiChatOpen && (
        <AIPatternChat
          mode={ui.aiChatMode}
          existingSource={
            ui.aiChatMode === "revise" && ui.aiChatLayer ? null : undefined
          }
          existingName={ui.aiChatLayer?.name}
          onPatternGenerated={handleAIPatternGenerated}
          onClose={() => setUI("aiChatOpen", false)}
        />
      )}

      <ConfirmDialog
        open={pendingExample !== null}
        title="Discard current work?"
        message="Loading this example replaces everything on the canvas. This can't be undone."
        confirmLabel="Load example"
        cancelLabel="Cancel"
        onConfirm={() => applyExample(pendingExample)}
        onCancel={() => setUI("pendingExample", null)}
      />
    </div>
  );
}
