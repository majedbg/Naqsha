import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
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
import { use3DPreview } from "../lib/three3d/use3DPreview";
import { use3DLensEntry } from "../lib/three3d/use3DLensEntry";
import { selectedMaterialForScene } from "../lib/three3d/selectedMaterial";
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
import { centerTransform } from "../lib/scene/placement";
import StudioSubmitModal from "../components/org/StudioSubmitModal";
import MotifEditorModal from "../components/motif-editor/MotifEditorModal";
import MaterialEvaluationDialog from "../components/evaluation/MaterialEvaluationDialog";
import { parseDToAnchors, anchorsToD } from "../lib/motif/pathModel";
import useMotifEditorSession from "../lib/hooks/useMotifEditorSession";
import useGlyphCommits from "../lib/hooks/useGlyphCommits";

// Run Plan title label per Machine Profile (CONTEXT.md vocabulary: "Run Plan:
// Laser cutting", "Run Plan: Pen plotting"). Deliberately DISTINCT from
// getProfile().label (the terse machine name — "Laser" / "Pen Plotter" — the
// status bar shows): the plan titles the RUN, not the machine, so it reads as
// the fabrication verb. Falls back to the profile's own label for any unknown id.
const RUN_PLAN_PROFILE_LABELS = {
  laser: "Laser cutting",
  plotter: "Pen plotting",
  dragCutter: "Drag cutting",
};
import useLayers from "../lib/useLayers";
import useLayerGroups from "../lib/useLayerGroups";
import {
  addPanel,
  deletePanel,
  duplicatePanel,
  clearPanelLayers,
} from "../lib/panels";
import { exportPanelsZip } from "../lib/panelExport";
import { isTextLayer } from "../lib/text/textLayer";
import { useFont } from "../lib/text/fontRegistry";
import { useAuth } from "../lib/AuthContext";
import useGlobalMotifLibrary from "../lib/hooks/useGlobalMotifLibrary";
import { canUseGlobalLibrary } from "../lib/motifLibraryEntitlement";
import { useGate } from "../lib/useGate";
import AuthButton from "../components/AuthButton";
import ThemeToggle from "../components/ui/ThemeToggle";
import { exportAllLayersSVG, exportLayerSVG, buildManifest } from "../lib/svgExport";
import AIPatternChat from "../components/AIPatternChat";
// Run Plan (Wave-3 Lane I wiring, PRD #73). The plan is the pre-flight
// destination: runPlanModel is the single derived truth every Run Plan surface
// reads (panel, machine-view canvas, Export Receipt); RunPlanPanel is its
// pre-flight face; useRunPlan is the shell-morph open/closed state AppShell
// provides around the hosted Studio.
import RunPlanPanel from "../components/shell/RunPlanPanel";
import { useRunPlan } from "../components/shell/runPlanContext";
import { runPlanModel } from "../lib/plotter/runPlanModel";
import { buildExportReceipt } from "../lib/exportReceipt";
import ExportReceipt from "../components/ExportReceipt";
import PreferencesModal from "../components/PreferencesModal";
import {
  getExportSettings,
  getGuestExportSettings,
  writeExportSettings,
} from "../lib/exportSettings";
import { getDynamicDefaults } from "../lib/patternRegistry";
import ShareLinkButton from "../components/ShareLinkButton";
import { resolveExportColor } from "../lib/fabrication";
import { seedOperations, addOperation, resolveOperation } from "../lib/operations";
import { remapOperationsToProfile, defaultBedSize, bedPresetsFor, profileProcesses, defaultMachineParams, getProfile } from "../lib/machineProfiles";
import useHistory from "../lib/history/useHistory";
import { createDocumentIO } from "../lib/history/documentSnapshot";
import { readTail, writeTail, validateTail } from "../lib/history/persist";
import { isTextEntryTarget } from "../lib/history/typingGuard";
import { syncWeightBand, supportsVariableWeight, isBandOperation } from "../lib/variableWeight";
import { findMoirePartnerA } from "../lib/moirePair";
import useCanvasSize, { loadCanvasState } from "../lib/hooks/useCanvasSize";
import useUIState from "../lib/hooks/useUIState";
import useOptimizations from "../lib/hooks/useOptimizations";
import useDesignPersistence from "../lib/hooks/useDesignPersistence";
import useCloudPersistence from "../lib/hooks/useCloudPersistence";
import useAutosave from "../lib/hooks/useAutosave";
import useSaveHotkey from "../lib/hooks/useSaveHotkey";
import { resolveSaveStatus } from "../lib/saveStatus";
import { isFeatureEnabled } from "../lib/featureFlags";
import { loadAndRegisterExtractedPatterns } from "../lib/libraryRepository";

// Photo → Pattern stepper (issue #49) is lazy so potrace-wasm + the extraction
// stack stay out of the studio bundle until the tool is actually opened.
const ExtractStepper = lazy(() => import("../components/extract/ExtractStepper"));
// Pattern Library view (S1, issue #50) — lazy for the same reason: browsing
// chrome stays out of the studio bundle until the Library is opened.
const LibraryView = lazy(() => import("../components/library/LibraryView"));

export default function Studio({ submitOrg = null } = {}) {
  const { loading, user, signIn, profile } = useAuth();
  const { tier, limits, check } = useGate();
  // P4 global motif library (DECISIONS D1). Loads the signed-in user's promoted
  // motifs (empty when logged-out/offline) and exposes `promote` for "Save to my
  // library". The premium entitlement is a scaffold that ships ON-for-all
  // (canUseGlobalLibrary → true); the LOGIN gate is enforced at the button.
  const { motifs: libraryMotifs, promote: promoteMotif } =
    useGlobalMotifLibrary(user);
  const canSaveToLibrary = canUseGlobalLibrary({ user, tier });
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

  // Add-layer target panel (panel-row redesign P7 §10 slice 2). When a per-panel
  // "+ Add layer" opens the pattern picker it stashes that panel.id here; the
  // picker's onPick threads it into addLayer so the new layer is born on that
  // panel. Every OTHER picker-open path (File→New, flat add-layer) resets it to
  // undefined first, so a stale id never leaks onto a globally-added layer.
  const [pendingPanelId, setPendingPanelId] = useState(undefined);

  // Photo → Pattern stepper (issue #49). Locked decision 5: feature flag
  // (flippable per-deploy/per-browser) AND tier gate (flippable to premium in
  // tierLimits) resolve whether the menu item is live; without both, MenuBar
  // renders it present-but-disabled.
  const [extractOpen, setExtractOpen] = useState(false);
  const extractionEnabled = isFeatureEnabled("extraction") && check("extraction").allowed;

  // Pattern Library view (S1, issue #50) — same flag + tier gate as the
  // stepper (the Library is the extraction feature's second surface).
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Whether the open stepper was launched FROM the Library ("+ New from
  // Photo"), so closing/saving returns the user there instead of the picker.
  const extractFromLibraryRef = useRef(false);
  // Where to navigate AFTER the stepper is fully dismissed: 'library' | 'picker'
  // | null. Set on save, consumed on close (D5). Opening the return surface
  // straight from onSaved painted its z-50 backdrop over the still-mounted
  // session-only notice (guest saves keep the stepper up until "Continue"),
  // intercepting the notice's own clicks; deferring to onClose keeps the notice
  // fully interactive and works for the persisted path too (close fires
  // immediately after save there).
  const pendingPostExtractRef = useRef(null);

  // Rehydrate this user's extracted library patterns into the dynamic registry
  // (→ picker custom family) on sign-in. Best-effort: failures only warn.
  useEffect(() => {
    if (user?.id) loadAndRegisterExtractedPatterns(user.id);
  }, [user?.id]);

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
    captureCanvas,
    restoreCanvas,
    workPieceWmm,
    workPieceHmm,
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
    // Run Plan persistence (Lane E deferred to Lane I, ADR 0002). The applied-only
    // snapshot rides the document blob (cloud + F5/localStorage) so applied
    // Optimizations survive reload; hydrateOptimizations re-installs a stored blob
    // ("none applied" migration default) without entering the ⌘Z snapshot.
    serializedOptimizations,
    hydrateOptimizations,
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

  // === Unified app-wide undo/redo: record injection (undo-history-plan §4) ===
  // The engine is instantiated further down (once every slice exists); these
  // stable recorders are defined HERE so they can be injected into useLayers'
  // mutators. They reach the engine through `historyRef` (set in an effect once
  // useHistory returns) — a safe forward reference because recorders only run in
  // event handlers, long after mount.
  //   - recordEdit(signature): coalescing param edit. Same signature within 400ms
  //     merges into one entry; a different signature flushes the prior burst.
  //   - recordStructural(): a discrete, immediate entry (closing any open burst).
  // `restoringRef` suppresses ALL recording while restore() replays a snapshot —
  // restore calls updateLayer/setBgColor synchronously and recording is
  // imperative, so this sync flag covers every record site (invariant I6).
  const historyRef = useRef(null);
  const restoringRef = useRef(false);
  const editKeyRef = useRef(null);
  const flushEdit = useCallback(() => {
    if (editKeyRef.current !== null) {
      editKeyRef.current = null;
      historyRef.current?.endCoalesce();
    }
  }, []);
  const recordEdit = useCallback(
    (signature) => {
      if (restoringRef.current) return;
      const api = historyRef.current;
      if (!api) return;
      if (editKeyRef.current !== null && editKeyRef.current !== signature) {
        api.endCoalesce(); // flush the previous target's burst as its own entry
      }
      editKeyRef.current = signature;
      api.beginCoalesce({ idleMs: 400 });
    },
    []
  );
  const recordStructural = useCallback(() => {
    if (restoringRef.current) return;
    flushEdit(); // close any open param burst as its own entry first
    historyRef.current?.record();
  }, [flushEdit]);
  // recordBatch(fn) folds MULTIPLE slice mutations into ONE undo entry by wrapping
  // fn in a coalesce window — used where a single user action touches two slices
  // (e.g. variable-weight: a layer patch AND the operation band). Any record()
  // the inner mutators fire is absorbed into the open window, so undo reverts the
  // whole action atomically.
  const recordBatch = useCallback((fn) => {
    const api = historyRef.current;
    if (!api || restoringRef.current) {
      fn();
      return;
    }
    api.beginCoalesce();
    try {
      fn();
    } finally {
      api.endCoalesce();
    }
  }, []);

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
    addMotifLayer,
    addEtchLayer,
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
    // Custom-glyph store (WI-3). The document-level map of imported motif glyphs.
    // Threaded into the render (via RightPanel → useCanvas), the undo/redo snapshot
    // (createDocumentIO), and every document persistence surface (share / cloud /
    // draft / group / example). addCustomGlyph is the WI-4 import entry point;
    // setCustomGlyphs is the bulk document-load seam (used by loadDocumentLayers).
    customGlyphs,
    // WI-5 import entry point — MotifDevice stamps an imported glyph through this.
    addCustomGlyph,
    setCustomGlyphs,
    // Pen-editor Save seam (WI-P2-2). `updateCustomGlyph` (Save → all N layers
    // restamp via the render seam) lands in WI-P2-1b; optional-chained below so
    // this slice works before that store WI merges. (`deleteCustomGlyph` also
    // ships there, but this WI has no Delete affordance, so it's not pulled in.)
    updateCustomGlyph,
    // Naqsha Panels (WI-6). The panel array + setter are owned by useLayers (it
    // also persists `panels` to `sonoform-panels` and each `layer.panelId` to
    // `sonoform-layers` automatically). Studio threads them into cloud
    // persistence (ungated), the canvas (laser-gated), and the LayerTree grouped
    // tier + per-panel export (laser-gated).
    panels,
    setPanels,
    // Effective tier layer cap — threaded into LayerTree so its per-panel
    // canDuplicatePanel gate refuses a copy that would overflow the cap (P7).
    cap,
    // Run Plan applied Optimizations restored from local storage at mount (ADR
    // 0002) — hydrated into the optimize hook on mount below.
    initialOptimizations,
  } = useLayers({ persistToLocal: limits.localStorage, maxLayers: limits.maxLayers, getDefaultOperationId, recordEdit, recordStructural, optimizations: serializedOptimizations });

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
  // The operation library is now PLAIN Studio state — its undo/redo (and
  // assignment's) is absorbed into the unified history engine below (S5). Seeded
  // byte-identically (seedOperations(), same ids/colors) so export stays stable.
  // commitOperations records one discrete entry then applies the library mapper
  // (recolor / reorder / add / remove / param-edit); the pre-edit snapshot
  // includes operations via getOperations, so undo restores the prior library.
  // captureAssignments/restoreAssignments (above) now feed createDocumentIO.
  const [operations, setOperations] = useState(() => seedOperations());
  const commitOperations = useCallback(
    (mapper) => {
      recordStructural();
      setOperations((ops) => mapper(ops));
    },
    [recordStructural]
  );

  // === Unified app-wide undo/redo: the engine (undo-history-plan §3) ===
  // A single whole-document snapshot stack over ALL slices — the ONLY undo/redo
  // in the app (the old per-slice useOperationsHistory was absorbed in S5). The
  // engine owns no document state; it is handed one symmetric capture/restore
  // pair built from each slice's live getters + bulk setters (createDocumentIO),
  // with `restoreOperations` writing the plain `operations` state above.
  const panelsRef = useRef(panels);
  const bgColorRef = useRef(bgColor);
  const operationsRef = useRef(operations);
  const customGlyphsRef = useRef(customGlyphs);
  // P0-3: capture must read the LIVE active Machine Profile. createDocumentIO is
  // memoized with an all-stable dep array (it never recomputes after mount), so a
  // render-closure getter would freeze on the mount-time profile and snapshot a
  // stale value after any switch — hence the ref, exactly like every getter above.
  const activeProfileIdRef = useRef(activeProfileId);
  useEffect(() => {
    panelsRef.current = panels;
    bgColorRef.current = bgColor;
    operationsRef.current = operations;
    customGlyphsRef.current = customGlyphs;
    activeProfileIdRef.current = activeProfileId;
  }, [panels, bgColor, operations, customGlyphs, activeProfileId]);
  // Getters wrapped in useCallback so the ref reads live in a stable handler
  // (not an inline render-phase arrow), keeping capture reading the latest slice
  // values without re-creating the engine each render.
  const getLayers = useCallback(() => layersRef.current, []);
  const getPanels = useCallback(() => panelsRef.current, []);
  const getBgColor = useCallback(() => bgColorRef.current, []);
  const getOperations = useCallback(() => operationsRef.current, []);
  const getCustomGlyphs = useCallback(() => customGlyphsRef.current, []);
  const getActiveProfileId = useCallback(() => activeProfileIdRef.current, []);
  const { capture: captureDoc, restore: restoreDocBase } = useMemo(
    () =>
      createDocumentIO({
        getLayers,
        getPanels,
        getBgColor,
        getOperations,
        getCustomGlyphs, // WI-3: capture the custom-glyph store in each snapshot
        // P0-3: capture the active Machine Profile so undo/redo restores the
        // target machine alongside the operations remap it drove (ADR 0002).
        getActiveProfileId,
        captureAssignments,
        captureCanvas,
        loadLayerSet,
        setPanels,
        setBgColor,
        restoreOperations: setOperations, // plain non-recording setter (S5)
        setCustomGlyphs, // WI-3: restore resets the store (defaults {} for old snaps)
        // P0-3 restore setter. The snapshot carries activeProfileId; `outputMode`
        // already round-trips via the canvas slice (restoreCanvas), so only the bed
        // overlay (bedSize) is TRANSIENT — not snapshotted — and must be re-derived
        // from the restored profile so the bed follows the machine on undo, exactly
        // as handleProfileChange does on the forward path. NOTE (human eyes): the
        // bed is re-derived to the profile DEFAULT, so a custom bed set after a
        // switch is NOT recovered on undo (custom beds aren't snapshotted) — a
        // deliberate approximation, flagged for review.
        setActiveProfileId: (id) => {
          setActiveProfileId(id);
          setBedSize(defaultBedSize(id));
        },
        restoreAssignments,
        restoreCanvas,
      }),
    [
      getLayers,
      getPanels,
      getBgColor,
      getOperations,
      getCustomGlyphs,
      getActiveProfileId,
      captureAssignments,
      captureCanvas,
      loadLayerSet,
      setPanels,
      setBgColor,
      setCustomGlyphs,
      restoreAssignments,
      restoreCanvas,
    ]
  );
  // Wrap restore so self-recording is suppressed for its whole synchronous span
  // (restore replays via updateLayer/setBgColor, which would otherwise record).
  const restoreDoc = useCallback(
    (s) => {
      restoringRef.current = true;
      try {
        restoreDocBase(s);
      } finally {
        restoringRef.current = false;
      }
    },
    [restoreDocBase]
  );
  const history = useHistory({ capture: captureDoc, restore: restoreDoc });
  useEffect(() => {
    historyRef.current = history;
  });
  // The unified engine now drives ALL undo/redo (menu, toolbar, ⌘Z). undo/redo
  // are stable; canUndo/canRedo re-render the enablement state.
  const { undo, redo, canUndo, canRedo } = history;

  // bgColor user edits record a (coalesced) entry — the picker can fire rapidly
  // during a drag, so it rides the same idle-coalesce path as a slider. Loads
  // and restore() use the raw setBgColor and must NOT record (they go through
  // clear() / the restore guard).
  const handleBgColorChange = useCallback(
    (next) => {
      recordEdit("bgColor");
      setBgColor(next);
    },
    [recordEdit, setBgColor]
  );

  // Document LOAD boundary (lifecycle §6, invariant I5): dropping in a DIFFERENT
  // document must drop the prior document's history so undo can't cross into it.
  // This wraps loadLayerSet for the genuine load sites (saved group / example /
  // cloud / share-link / draft recovery). The panel-delete structural edit and
  // the restore() replay keep the RAW loadLayerSet — they must NOT clear. Tier-1
  // / Tier-2 reload-persistence (S8/S9) imports a compatible tail on top of this
  // always-safe clear floor.
  // WI-3: doc-load also swaps in the incoming document's custom-glyph store. The
  // 2nd arg defaults to {} so EVERY genuine doc-load (group / example / cloud /
  // share / draft recovery) that omits it RESETS the store — never leaking the
  // previous document's glyphs into a doc that has none (referential-integrity
  // risk #1). The RAW loadLayerSet at structural-edit sites intentionally does
  // NOT touch customGlyphs (those aren't doc loads).
  const loadDocumentLayers = useCallback(
    (newLayers, newCustomGlyphs = {}) => {
      historyRef.current?.clear();
      setCustomGlyphs(newCustomGlyphs);
      loadLayerSet(newLayers);
    },
    [loadLayerSet, setCustomGlyphs]
  );

  // === Tier-2 cloud history persistence (undo-history-plan §7, S9) ===
  // The undo/redo tail travels embedded in the MANUALLY-saved design config (see
  // useCloudPersistence). getHistoryTail is read ONLY on a manual save and feeds
  // history.exportTail() into the saved blob; importHistoryTail installs an
  // embedded tail AFTER a cloud load (which already cleared history) through the
  // same rails Tier-1 uses (validateTail → importTail) — a version/checksum
  // mismatch silently drops history and keeps the document (the safe failure
  // mode).
  const getHistoryTail = useCallback(
    () => historyRef.current?.exportTail() ?? null,
    []
  );
  // LIMITATION (S9): the present-checksum deep-equals the embedded whole-doc
  // snapshot against the live doc, but the cloud save/load only round-trip
  // layers + panels + canvas W/H. bgColor, operations, assignments, unit, margin
  // and outputMode are NOT persisted/restored (presetIndex is saved but not
  // re-applied), and within this synchronous load handler the slice refs still
  // lag the just-dispatched setState — so for any non-default doc the checksum
  // mismatches and the tail is dropped (doc always kept). The embedded WRITE is
  // the durable deliverable: once cloud load restores every slice, import starts
  // succeeding with no change here.
  const importHistoryTail = useCallback((configHistory) => {
    if (!configHistory) return;
    const api = historyRef.current;
    if (!api) return;
    const stacks = validateTail(configHistory, api.exportTail().present);
    if (stacks) api.importTail(stacks);
  }, []);

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
  // Switching the machine profile is NOT undoable (a pre-remap snapshot's
  // colors/params no longer fit the new profile — cross-profile undo is
  // semantically broken). The remap replaces the library via setOperations and
  // then clears the whole history (history.clear()), preserving the old
  // resetHistory-on-profile-switch semantics (I9).
  // Bed is now a MACHINE REFERENCE OVERLAY (UX reframe), not the artboard: it
  // is seeded from the active profile's defaultBed, switched back to that
  // default whenever the machine profile changes (inside handleProfileChange —
  // the single profile path), and selectable to a named preset or hidden via
  // the View menu's "Bed size" submenu (see showBed below). CanvasChrome
  // (bed-fill + bed-guide) and StatusBar read THIS state, so applying updates
  // them immediately. It is intentionally NOT threaded into the export
  // manifest (export reads the separate canvasW/H-derived workPieceWmm/
  // workPieceHmm — the work piece the user is designing on), so changing the
  // bed overlay never alters export output.
  const [bedSize, setBedSize] = useState(() => defaultBedSize(activeProfileId));

  // Bed overlay visibility (UX reframe): toggled from View > Bed size — picking
  // a named preset shows it, "None" hides it. Transient view state only (not
  // persisted); defaults to hidden (View > Bed size > None).
  const [showBed, setShowBed] = useState(false);

  // Document Setup dialog open state (C6 / #14). Opened from the File menu.
  const [documentSetupOpen, setDocumentSetupOpen] = useState(false);
  // Material evaluation (slice 1, docs/material-evaluation-VISION.md): the
  // render frame Scene3D's "Evaluate material" button captured, paired with the
  // material it rendered — non-null opens the side-by-side submission dialog.
  const [evaluationCapture, setEvaluationCapture] = useState(null);

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
      setOperations(
        supportsVariableWeight(nextProfileId)
          ? remapped
          : remapped.filter((o) => !isBandOperation(o))
      );
      // P0-3 (Run Plan, PRD #73 / ADR 0002): a Machine Profile switch is now a
      // recorded, UNDOABLE batch — NOT a history.clear(). activeProfileId rides the
      // snapshot (createDocumentIO), so undo restores the prior machine together
      // with the operations remap it drove. This function is therefore a PURE
      // mutation: it must NOT record and must NOT clear — the caller
      // (recordedProfileChange / handleDocumentSetupApply) wraps it in ONE
      // recordBatch window. (The stale colors/params of the pre-remap snapshot are
      // no longer a problem: undo restores the whole coherent prior document.)
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
    [setOutputMode, operations]
  );

  // P0-3: the recorded profile-switch call site. handleProfileChange is a pure
  // multi-slice mutation (profile + bed + operations remap); recordBatch folds the
  // whole switch into ONE undoable entry (beginCoalesce captures the pre-switch
  // document, endCoalesce commits it). Both entry points — the LayerTree machine
  // selector and Document Setup — route through this so a switch is exactly one
  // undo step no matter where it originates.
  const recordedProfileChange = useCallback(
    (nextProfileId) => recordBatch(() => handleProfileChange(nextProfileId)),
    [recordBatch, handleProfileChange]
  );

  // View > Bed size (UX reframe): picking a named preset shows the bed overlay
  // at that preset's dims; unknown/missing id is a no-op (defensive — the menu
  // only ever offers ids from bedPresetsFor(activeProfileId)).
  const handleSelectBedPreset = useCallback(
    (id) => {
      const preset = bedPresetsFor(activeProfileId).find((p) => p.id === id);
      if (!preset) return;
      setBedSize({ width: preset.width, height: preset.height, unit: "mm" });
      setShowBed(true);
    },
    [activeProfileId]
  );

  // View > Bed size > None: hides the bed overlay without changing bedSize, so
  // re-showing a preset (or reopening) still reflects the last chosen dims.
  const handleHideBed = useCallback(() => {
    setShowBed(false);
  }, []);

  // Which named bed preset (if any) matches the CURRENT bedSize, so the View
  // menu can check the active one. Rounded comparison guards against float
  // drift (mm math elsewhere in the app rounds too — see useCanvasSize).
  const activeBedPresetId = useMemo(() => {
    const preset = bedPresetsFor(activeProfileId).find(
      (p) =>
        Math.round(p.width) === Math.round(bedSize.width) &&
        Math.round(p.height) === Math.round(bedSize.height)
    );
    return preset ? preset.id : null;
  }, [activeProfileId, bedSize]);

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
  // in ONE handler — never in an effect (recording is imperative). The two slice
  // mutations are wrapped in recordBatch so they form a SINGLE undo entry: the
  // layer patch and the band sync revert together. syncWeightBand strips this
  // layer's old band and (when enabled on a supported profile) appends a fresh
  // N-row band, so changing N re-buckets live. setOperations is used directly
  // here (not commitOperations) so it doesn't open a second history entry.
  const handleVariableWeightChange = useCallback(
    (layerId, { enabled, n }) => {
      recordBatch(() => {
        updateLayer(layerId, { variableWeight: { enabled, n } });
        setOperations((ops) =>
          syncWeightBand(ops, { layerId, profileId: activeProfileId, enabled, n })
        );
      });
    },
    [recordBatch, updateLayer, activeProfileId]
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
  // Assigning a layer's operationId is a normal layer edit, so it records through
  // updateLayer's own history hook (a coalesced entry keyed by layer+operationId;
  // the pre-edit snapshot's assignments restore on undo). The LayerTree row chip
  // assigns its OWN row's layer.
  const assignOperationToLayer = useCallback(
    (layerId, operationId) => {
      if (!layerId) return;
      updateLayer(layerId, { operationId });
    },
    [updateLayer]
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

  // 3D preview sub-mode state machine (S1, PRD D1). Owns {subMode,
  // focusFieldLayerId}; the openers are wired to UI entry points in later
  // slices (lens peer for A; Inspector "Preview in 3D" for B). Threaded into
  // RightPanel so the lazy three.js host mounts when a sub-mode is active.
  const threeD = use3DPreview();

  // 3D entry + transition coordinator (S3, PRD D1/D2/D14). Captures the CURRENT
  // design into a frozen snapshot on enter (and on "↻ Rebuild") — the 3D scene is
  // snapshot-based, NOT live-reactive. `captureDesign` reads the live design
  // inputs Surface A needs (layers/panels/operations + active machine profile);
  // re-created when those change so a fresh enter/rebuild captures the latest.
  const captureDesign = useCallback(
    () => ({ layers, panels, operations, machineProfile: activeProfileId }),
    [layers, panels, operations, activeProfileId],
  );
  const lensEntry = use3DLensEntry({ colorView, threeD, captureDesign });

  // Motif-editor mini Preview (WI-P2-5, D5): the live full-canvas render inputs
  // the editor's throttled preview re-stamps through. MIRRORS RightPanel's
  // canonical useCanvas call exactly — `machineProfile: activeProfileId`,
  // `colorView: colorView.colorView` (the lens value off the hook object), and
  // the SAME laser-gated panels expression — so the mini preview matches the real
  // canvas byte-for-byte. Threaded down only; cheap to recompute.
  const motifPreviewContext = useMemo(
    () => ({
      layers,
      canvasW,
      canvasH,
      bgColor,
      operations,
      machineProfile: activeProfileId,
      colorView: colorView.colorView,
      panels: activeProfileId === "laser" ? panels : [],
      customGlyphs,
      textFont,
    }),
    [
      layers,
      canvasW,
      canvasH,
      bgColor,
      operations,
      activeProfileId,
      colorView.colorView,
      panels,
      customGlyphs,
      textFont,
    ],
  );

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

  // Plot preview / machine view (C7 / #15 → Run Plan, PRD #73). The standalone
  // View▸Overlays toggle RETIRED into the Run Plan (Phase 2): the canvas machine
  // view now activates exactly WITH the plan (showPlotOverlay = planOpen) and
  // reads the runPlanModel route/crops. `plotPlaying` mirrors the on-canvas
  // Play/Pause so the animated run-through state round-trips; reset on close.
  const [plotPlaying, setPlotPlaying] = useState(false);
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    []
  );

  // Pro-shell operations panel slot (C1 / #10). Null in the legacy layout (no
  // provider) → the panel portal below is a no-op. The same slot presence gates
  // the undo/redo keyboard shortcut so ⌘Z never hijacks the legacy layout.
  const operationsPanelSlot = useOperationsPanelSlot();

  // ⌘Z / ⇧⌘Z (Ctrl on non-mac) drive the unified app-wide undo/redo (D4): bound
  // GLOBALLY in every shell now that history covers the whole document, not just
  // the operation library. Guarded only while focus is in a genuine TEXT-ENTRY
  // surface (isTextEntryTarget) so native text-cursor undo survives — a focused
  // range slider / checkbox / select has no native undo and must let ⌘Z reach
  // the document history. `undo`/`redo` are stable engine callbacks, so this
  // binds once.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "z" && e.key !== "Z") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTextEntryTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const { groups, saveGroup, deleteGroup, renameGroup } = useLayerGroups();
  const patternInstancesRef = useRef({});
  const canvasContainerRef = useRef(null);

  // === Run Plan (Wave-3 Lane I, PRD #73) ===
  // The plan is a shell-morph: AppShell provides the open/closed state around the
  // hosted Studio and owns the Esc + "Back to design" exits (both call close);
  // Studio reacts to isOpen — morphing the Inspector into the RunPlanPanel and the
  // canvas into the machine view — and drives open() from its own entries (Phase 2).
  const { isOpen: planOpen, open: openRunPlan, close: closeRunPlan } = useRunPlan();

  // Crop-to-Sheet Export preference (ADR 0001). Seeded from the signed-in user's
  // persisted profile settings, or the guest localStorage namespace. Drives the
  // Run Plan / Receipt (a cropped-paths warning appears only when ON) and is
  // threaded through export; see the file-geometry-crop deviation in the report.
  const [cropToSheet, setCropToSheet] = useState(() =>
    user ? getExportSettings(profile).cropToSheet : getGuestExportSettings().cropToSheet
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // The Sheet = the work-piece the canvas maps to, in the SAME px space the
  // extracted path points live in (so runPlanModel can clip against it).
  const sheetRect = useMemo(
    () => ({ x: 0, y: 0, width: canvasW, height: canvasH }),
    [canvasW, canvasH]
  );

  // Compose the ONE Run Plan model every surface reads (panel headline + rows,
  // machine-view route/crops, Export Receipt). Reads the LIVE pattern instances
  // off the ref at call time; `cropOverride` lets an export force a crop basis
  // without a re-render. Recomputed fresh whenever any fabrication input changes.
  const computeRunPlan = useCallback(
    (cropOverride) =>
      runPlanModel({
        layers,
        instances: patternInstancesRef.current || {},
        operations,
        appliedOptimizations,
        profileId: activeProfileId,
        sheetRect,
        bedSize,
        cropToSheet: cropOverride ?? cropToSheet,
      }),
    [layers, operations, appliedOptimizations, activeProfileId, sheetRect, bedSize, cropToSheet]
  );

  // Recompute FRESH each open (story 44): `planOpen` is in the deps, so flipping
  // the plan open re-reads the current instances; while open, changing an
  // Operation (speed) or the Optimize stack updates the estimate live (the
  // pedagogical path). Null when closed → the canvas machine view stays clean.
  const runPlan = useMemo(
    () => (planOpen ? computeRunPlan() : null),
    [planOpen, computeRunPlan]
  );

  const profileLabel =
    RUN_PLAN_PROFILE_LABELS[activeProfileId] ?? getProfile(activeProfileId).label;
  const sheetLine = `Sheet ${Math.round(workPieceWmm)} × ${Math.round(
    workPieceHmm
  )} mm · Bed ${Math.round(bedSize.width)} × ${Math.round(bedSize.height)} mm`;

  // Two-way locate (PRD story 25). A panel row (op / warning) OR a canvas segment
  // click writes the SAME shared highlight target ({ opId } | { layerId } | a
  // warning's locate payload). Held here so both directions agree; cleared when
  // the plan closes. The committed RunPlanPanel / PlotOverlay expose no
  // highlight-IN prop, so this drives the layer selection the design surface
  // already renders and is surfaced as a data hook — see the report deviation.
  const [planLocate, setPlanLocate] = useState(null);
  const handlePlanLocate = useCallback((locate) => {
    setPlanLocate(locate || null);
    // Locate a concrete layer when the target names one (warning.locate.layerIds
    // or a canvas crop's { layerId }); op-row targets carry only { opId }.
    const layerId = locate?.layerId ?? locate?.layerIds?.[0] ?? null;
    if (layerId) setSelectedLayerId(layerId);
  }, []);
  useEffect(() => {
    if (!planOpen) {
      setPlanLocate(null);
      setPlotPlaying(false);
    }
  }, [planOpen]);

  // The machine view's tint→Operation lookup (opId + color) for the two-way
  // highlight, projected from the same runPlan the panel reads.
  const plotOpRows = useMemo(
    () => (runPlan?.opRows ?? []).map((r) => ({ opId: r.opId, color: r.color })),
    [runPlan]
  );

  // F5/RELOAD survival (ADR 0002). Hydrate the optimize hook ONCE on mount from
  // the applied-Optimizations blob useLayers restored from local storage
  // (undefined for a guest / an old document → hydrateOptimizations migrates to
  // "none applied"). Mount-only, outside the ⌘Z snapshot — mirrors the Tier-1
  // history import guard. A later in-session document load re-hydrates via the
  // cloud/draft seams (useCloudPersistence).
  const didHydrateOptimizationsRef = useRef(false);
  useEffect(() => {
    if (didHydrateOptimizationsRef.current) return;
    didHydrateOptimizationsRef.current = true;
    if (initialOptimizations !== undefined) hydrateOptimizations(initialOptimizations);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === SVG import (issue #12, C4 — place as artwork) ===
  // One import = one layer, via three entry points: File>Import (file picker),
  // drag-drop onto the canvas, and paste. All funnel through addImportedLayer;
  // malformed/empty SVG surfaces a brief inline message (the app has no toast).
  const importFileInputRef = useRef(null);
  const [importError, setImportError] = useState(null);
  const importErrorTimer = useRef(null);

  // Surface a brief inline import-error banner (auto-clears after 4s). Shared by
  // File>Import, click-to-place, and the Motif device's "Import SVG as motif…".
  const showImportError = useCallback((message) => {
    setImportError(message || "Could not import this SVG.");
    clearTimeout(importErrorTimer.current);
    importErrorTimer.current = setTimeout(() => setImportError(null), 4000);
  }, []);

  // Glyph Commits (Wave 1, #77) — the single write-owner for every
  // `customGlyphs` + `glyphRef` write in the app. Used directly below for the
  // Motif device's library copy/use seams; `useMotifEditorSession` also
  // consumes it internally for its own Save/Save-as-copy/import commits.
  const glyphCommits = useGlyphCommits({
    addCustomGlyph,
    updateCustomGlyph,
    updateLayer,
    recordBatch,
    layers,
    customGlyphs,
  });

  // Motif Edit Session (Wave 2, #77) — owns the pen-editor lifecycle (open's
  // fork decision, openNew, importFromFile, Save/Save-as-copy/Cancel) that used
  // to be split across this component's own state + a modal-rendering IIFE and
  // Inspector's openEditorFor/handleImportChange. `onError` reuses the exact
  // banner seam File>Import already renders through (showImportError); the
  // four promote-gate props pass straight through to the modal (grilled
  // decision 5, docs/motif-session-ORCHESTRATOR.md).
  const motifSession = useMotifEditorSession({
    layers,
    customGlyphs,
    addCustomGlyph,
    updateCustomGlyph,
    updateLayer,
    recordBatch,
    parseD: parseDToAnchors,
    anchorsToD,
    previewContext: motifPreviewContext,
    onError: showImportError,
    canSaveToLibrary,
    isLoggedIn: !!user,
    onSaveToLibrary: (glyph) => promoteMotif(glyph),
    onRequireSignIn: signIn,
  });

  const handleImportSVG = useCallback(
    (svgText) => {
      const outcome = addImportedLayer(svgText);
      if (!outcome.ok) {
        showImportError(outcome.error || "Could not import this SVG.");
      } else {
        setImportError(null);
      }
    },
    [addImportedLayer, showImportError]
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

  // Import Image (Etch) — read a raster photo, downscale it to a capped
  // (≤1024px) data-URI (guest/offline path, Raster Etch S1 #80), and create an
  // Etch layer that thresholds it to a 1-bit dot field exported as an embedded
  // bitmap. Uses the extraction imageIO seam (fileToDataURL → loadImage →
  // cropToImageData → imageDataToDataURL) so no new DOM/canvas plumbing is added.
  const etchFileInputRef = useRef(null);
  const handleImportEtchClick = useCallback(() => {
    etchFileInputRef.current?.click();
  }, []);
  const handleEtchFileChange = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-importing the same file
      if (!file) return;
      try {
        const { fileToDataURL, loadImage, cropToImageData, imageDataToDataURL } =
          await import("../lib/extraction/imageIO.js");
        const dataUrl = await fileToDataURL(file);
        const img = await loadImage(dataUrl);
        // Downscale to the capped source (longest side ≤ 1024px) held on the layer.
        const capped = cropToImageData(
          img,
          { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight },
          1024
        );
        const source = imageDataToDataURL(capped);
        const outcome = addEtchLayer({
          source,
          sourceWidth: capped.width,
          sourceHeight: capped.height,
        });
        if (outcome?.ok) {
          setSelectedLayerId(outcome.id);
        } else {
          setImportError(outcome?.error || "Could not import that image.");
        }
      } catch {
        setImportError("Could not read that image.");
      }
    },
    [addEtchLayer]
  );

  // Drag-drop + paste onto the canvas (the other two entry points).
  useSvgImport(canvasContainerRef, handleImportSVG);

  // === Dirty-tracking + share-link hydration ===
  const { markCleanFrom, isDirty } = useDesignPersistence({
    layers,
    bgColor,
    loadLayerSet: loadDocumentLayers, // share-link hydration is a document load (I5)
    setBgColor,
    setCanvasW,
    setCanvasH,
    setPresetIndex,
    setUnit,
    setMargin,
    persistToLocal: limits.localStorage,
    // Run Plan applied Optimizations fold into the dirty signal (ADR 0002) so
    // Apply / Revert schedules autosave just like a layer edit.
    optimizations: serializedOptimizations,
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
    nameDirty,
    pendingDraft,
    recoverDraft,
    discardDraft,
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
    customGlyphs, // WI-3: embedded in the saved/draft config as a sibling of layers
    // Run Plan applied Optimizations (Lane E, ADR 0002). The applied-only snapshot
    // rides the document config as a sibling of layers so they persist with the
    // document instead of vanishing on reload; hydrateOptimizations re-installs the
    // stored blob after a cloud load / draft recover ("none applied" migration).
    optimizations: serializedOptimizations,
    hydrateOptimizations,
    loadLayerSet: loadDocumentLayers, // cloud load + draft recovery are document loads (I5)
    applyCanvasSize,
    markCleanFrom,
    canvasContainerRef,
    // Tier-2 (S9): tail embedded on MANUAL save only; imported after cloud load.
    getHistoryTail,
    importHistoryTail,
  });

  // === Guest gating (Rec 3 / A) ===
  // A guest's Save (menu item or Cmd/Ctrl+S) used to no-op — useCloudPersistence
  // bails on `!user`. Route that intent to Google sign-in instead. Guest gating
  // is a UX concern at THIS layer: the hook keeps its `if (!user) return` and its
  // "does nothing without a signed-in user" test stays valid.
  // Manual save intent (⌘S + MenuBar Save). Passes `{ manual: true }` so this —
  // and ONLY this — embeds the Tier-2 history tail in the saved config; the
  // autosave caller below invokes `handleSaveToCloud` with no args (manual:false).
  const onCloudSaveIntent = useCallback(
    () => (user ? handleSaveToCloud({ manual: true }) : signIn()),
    [user, handleSaveToCloud, signIn]
  );

  // === Autosave + Cmd/Ctrl+S (Rec 2) ===
  // Both are CALLERS of the single save path (handleSaveToCloud), never a second
  // write. The combined dirty trigger ORs layer-dirty with name-dirty; its
  // identity changes whenever layers/bgColor change (isDirty's deps) OR a rename
  // flips nameDirty, so either re-schedules the debounced autosave.
  const isDirtyForAutosave = useCallback(
    () => isDirty() || nameDirty,
    [isDirty, nameDirty]
  );
  useAutosave({
    enabled: !!user, // signed-in only; guests never autosave
    hasDesignId: !!currentDesignId, // first save stays explicit
    isDirty: isDirtyForAutosave,
    save: handleSaveToCloud,
    isSaving: saveState === "saving", // bail if a manual save is already running
  });
  // Cmd/Ctrl+S works even before the first save (manual checkpoint). For a guest
  // it routes to sign-in via the same intent the MenuBar uses (Rec 3 / A).
  useSaveHotkey(onCloudSaveIntent);

  // === Tier-1 history persistence (undo-history-plan §7, D7) ===
  // History survives reload via localStorage, keyed by document identity
  // (design:<id> or draft) and gated by the same localStorage tier as layers.
  const historyIdentity = currentDesignId ? `design:${currentDesignId}` : "draft";
  // Import ONCE on mount: read the keyed tail, run the version + present-checksum
  // rails (validateTail), and install it only if it matches the freshly-loaded
  // doc. A mismatch (breaking-version / stale tail) silently drops history and
  // keeps the document (I7). Runs for the INITIAL identity (the local draft, or a
  // design opened directly); a later in-session document load clears instead.
  const didImportHistoryRef = useRef(false);
  useEffect(() => {
    if (didImportHistoryRef.current) return;
    didImportHistoryRef.current = true;
    if (!limits.localStorage) return;
    const api = historyRef.current;
    if (!api) return;
    const tail = readTail(historyIdentity);
    if (!tail) return;
    const stacks = validateTail(tail, api.exportTail().present);
    if (stacks) api.importTail(stacks);
    // Mount-only: capture the initial identity; later loads clear (loadDocumentLayers).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Debounced write (3s, riding the same cadence as the local layers writer):
  // re-persist the tail after any document change OR undo/redo (which mutate the
  // slices in the deps). exportTail re-reads `present` fresh, so the persisted
  // checksum tracks the live doc and the reload import stays consistent.
  useEffect(() => {
    if (!limits.localStorage) return undefined;
    const t = setTimeout(() => {
      const tail = historyRef.current?.exportTail();
      if (tail) writeTail(historyIdentity, tail);
    }, 3000);
    return () => clearTimeout(t);
  }, [
    limits.localStorage,
    historyIdentity,
    layers,
    bgColor,
    panels,
    operations,
    canvasW,
    canvasH,
    unit,
    margin,
    presetIndex,
    outputMode,
  ]);

  // Document Setup apply (UX reframe): the dialog no longer sets the bed (it's
  // a View-menu-only reference overlay now — see handleSelectBedPreset/
  // handleHideBed). Routes the profile half through the SAME handleProfileChange
  // the LayerTree selector uses (so the remap + default-bed reset stay
  // single-sourced; handleProfileChange still resets bedSize to the new
  // profile's default), then applies the work-piece size/unit.
  // Re-homes the EXPORT document size (#16 AC2): canvasW/canvasH come back
  // from the dialog (px) and route through applyCanvasSize so the export
  // dimensions become user-settable again AND presetIndex stays coherent (snaps
  // to a known preset or Custom, exactly as the cloud/example loaders do).
  const handleDocumentSetupApply = useCallback(
    ({ profileId, unit: nextUnit, canvasW: nextW, canvasH: nextH }) => {
      const isProfileChange = profileId && profileId !== activeProfileId;
      // The document-mutating body. Wrapped in ONE recordBatch for the pure
      // size/unit/margin path so a Document Setup apply is a single undo entry
      // (S4 gap). NOT recorded inside applyCanvasSize itself — loaders call that
      // directly and must stay unrecorded.
      const applyBody = () => {
        if (isProfileChange) {
          handleProfileChange(profileId);
        }
        // The dialog's mm/in toggle drives the document's global unit (rulers,
        // status bar, length-tagged params all follow). bedSize stays canonical mm.
        if ((nextUnit === "mm" || nextUnit === "in") && nextUnit !== unit) {
          setUnit(nextUnit);
        }
        if (typeof nextW === "number" && typeof nextH === "number") {
          applyCanvasSize(nextW, nextH);
        }
      };
      // P0-3: a Document Setup apply is ALWAYS one undoable entry, profile switch
      // included. handleProfileChange no longer clears history (it's a pure
      // mutation now), so the profile + unit + size mutations all fold into ONE
      // recordBatch window — no double-wrap, since nothing inside applyBody
      // records on its own (handleProfileChange doesn't record; applyCanvasSize
      // stays unrecorded so loaders can call it directly).
      recordBatch(applyBody);
    },
    [activeProfileId, handleProfileChange, applyCanvasSize, unit, setUnit, recordBatch]
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
      // Manifest keys stay bedW/bedH/bedUnit (export format unchanged); the
      // VALUES now come from the work piece (workPieceWmm/workPieceHmm), not
      // the machine-bed reference overlay — export tracks what the user is
      // designing on, not the bed selection.
      bedW: workPieceWmm,
      bedH: workPieceHmm,
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
      // Operation library so an Etch's embedded-bitmap colour resolves through
      // its engrave Operation (same as the canvas), not a hardcoded layer colour.
      operations,
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
        // Operation library so an Etch's embedded-bitmap colour resolves through
        // its engrave Operation (same as the canvas), not a hardcoded layer colour.
        operations,
        // Resolved font so text layers export their glyph outlines (phase 6).
        font: textFont,
      }
    );
  };

  // === Export Receipt (ADR 0001) — the calm one-line summary every export
  // carries. STORED in state as a stable ref so ExportReceipt's auto-dismiss timer
  // tracks THE receipt, not each re-render; cleared on dismiss / re-armed only by
  // a new export. The receipt reads a FRESH runPlan honoring cropToSheet, so the
  // headline minutes, cropped count, and warning tally agree with the plan by
  // construction (they read the same model).
  const [receipt, setReceipt] = useState(null);
  const dismissReceipt = useCallback(() => setReceipt(null), []);

  // The two-path export commit (ADR 0001): the quick export (⌘E, MenuBar
  // "Export SVG…") AND the plan's "Export run" both run the SAME handler — write
  // the file, then surface the receipt. Both honor cropToSheet (threaded into the
  // receipt's runPlan; file-geometry cropping is the flagged deferral).
  const runExport = useCallback(
    (includeHidden = true) => {
      handleExportAll(includeHidden);
      setReceipt(buildExportReceipt(computeRunPlan()));
    },
    // handleExportAll is a per-render closure; computeRunPlan's deps cover the same
    // live fabrication inputs it reads, so runExport re-creates alongside it.
    [computeRunPlan] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Preferences: flip crop-to-Sheet and persist it (signed-in → profile settings
  // via read-before-write; guest → localStorage). Optimistic local update so the
  // toggle + the plan/receipt reflect it immediately; the async write is
  // fire-and-forget (exportSettings is failure-tolerant and never throws).
  const handleChangeCropToSheet = useCallback(
    (next) => {
      setCropToSheet(next);
      writeExportSettings(user?.id, { cropToSheet: next });
    },
    [user?.id]
  );

  // Global export shortcuts (mirrors the useSaveHotkey pattern): ⌘E / Ctrl+E =
  // quick export (file + receipt), ⇧⌘E = open the Run Plan. Latest handlers held
  // in refs so the listener binds once and never rebinds. GUARDED against genuine
  // text-entry targets (isTextEntryTarget) so typing an "e" in a name/param field
  // never exports, and preventDefault()'d so the browser never hijacks the combo.
  const runExportRef = useRef(runExport);
  const openRunPlanRef = useRef(openRunPlan);
  useEffect(() => {
    runExportRef.current = runExport;
    openRunPlanRef.current = openRunPlan;
  });
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "e" && e.key !== "E") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTextEntryTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) openRunPlanRef.current?.();
      else runExportRef.current?.(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    // WI-3: carry the custom-glyph store so a shared design that uses an imported
    // motif reproduces (the glyph is referenced by layers' glyphRef, not inline).
    customGlyphs,
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
    saveGroup(name, layers, canvasW, canvasH, thumbnail, customGlyphs);
    setUI("showSaveDialog", false);
  };

  const handleLoadGroup = (group) => {
    // WI-3: a saved group carries its custom-glyph store; default {} resets the
    // store for a pre-WI-3 group (no field) so it never inherits current glyphs.
    loadDocumentLayers(group.layers, group.customGlyphs ?? {});
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
      // WI-3: a curated example may bundle custom glyphs; default {} resets the
      // store for examples that don't (the common case) rather than leaking.
      loadDocumentLayers(cfg.layers, cfg.customGlyphs ?? {});
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
      loadDocumentLayers,
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
    // Fill the AppShell Canvas <section> that hosts this Studio, NOT the full
    // viewport. `h-dvh` here forced 100vh even though the section starts ~one
    // toolbar-row down the page, so the studio overflowed the viewport bottom and
    // dragged the canvas's bottom chrome (Background / zoom / the 3D-view lens)
    // off-screen. `h-full min-h-0` makes it fit its container so that row stays in
    // view. (AppShell:246 / MobileStudio:109 are the real viewport roots and keep
    // h-dvh.)
    <div
      className="flex flex-col h-full min-h-0 bg-paper"
      // Two-way locate observable (PRD story 25). The shared highlight target set
      // by BOTH a RunPlanPanel row click AND an on-canvas segment/crop click; the
      // committed panel/overlay expose no highlight-IN prop, so this surfaces the
      // located target (op / layer) here. See the report's locate deviation.
      data-run-plan-locate={planLocate ? JSON.stringify(planLocate) : undefined}
    >
      {/* Hidden file input backing File > Import (issue #12). Click is triggered
          by the menu item; reads the chosen .svg and adds one artwork layer. */}
      <input
        ref={importFileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={handleImportFileChange}
      />
      {/* Hidden file input backing File > Import Image (Etch) (Raster Etch S1,
          #80). Reads a raster photo and adds one Etch layer. */}
      <input
        ref={etchFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        data-testid="etch-image-input"
        className="hidden"
        onChange={handleEtchFileChange}
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
        {/* Local-draft recovery banner (Rec 3 / B). A signed-in user whose prior
            cloud save FAILED has their work stashed locally; offer to restore it.
            Same inline-banner pattern as the import error (no toast system).
            Gated on `user` to match the "signed-in only" safety-net decision. */}
        {user && pendingDraft && (
          <div
            role="alert"
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-paper border border-hairline text-ink text-xs rounded-md px-3 py-1.5 shadow-sm"
          >
            <span>Recover unsaved changes?</span>
            <button
              type="button"
              onClick={recoverDraft}
              className="px-2 py-0.5 rounded-xs bg-accent text-paper hover:opacity-90 transition-opacity duration-fast"
            >
              Recover
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="px-2 py-0.5 rounded-xs text-ink-soft hover:text-ink hover:bg-paper-warm transition-colors duration-fast"
            >
              Discard
            </button>
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
          // Custom-glyph store (WI-3): resolves motif glyphRefs at the render seam.
          customGlyphs={customGlyphs}
          // 3D preview (S1): mounts the lazy three.js host over the canvas when a
          // sub-mode is active; 'off' → byte-identical 2D path.
          threeDMode={threeD.subMode}
          focusFieldLayerId={threeD.focusFieldLayerId}
          // In-canvas "✕" exit for the 3D overlay. exit3D closes BOTH Surface A
          // and Surface B (subMode→'off') and restores the prior 2D view.
          onClose3D={lensEntry.exit3D}
          // Frozen design snapshot the 3D scene reads from (S3, D14). Consumed by
          // Surface A geometry in later slices; null when 3D is closed.
          threeDSnapshot={lensEntry.snapshot}
          // Selected material for the 3D scene (S3, spec §3.5). LIVE — derived
          // from the colorView lens, NOT the frozen snapshot — so switching
          // material re-tints the 3D slabs without a Rebuild. Mode-gated here:
          // non-null only in the Material lens (Operation / no material → null →
          // today's substrate fallback).
          selectedMaterial={selectedMaterialForScene(colorView.colorView)}
          // Material evaluation (slice 1): Scene3D routes an "Evaluate material"
          // capture here; the material is re-derived from the SAME lens gate the
          // scene rendered with, so the pairing records what was on screen.
          onEvaluationCapture={(dataUrl) =>
            setEvaluationCapture({
              dataUrl,
              material: selectedMaterialForScene(colorView.colorView),
            })
          }
          canvasW={canvasW}
          canvasH={canvasH}
          patternInstancesRef={patternInstancesRef}
          canvasContainerRef={canvasContainerRef}
          bgColor={bgColor}
          onBgColorChange={handleBgColorChange}
          unit={unit}
          externalZoom={canvasView.zoom}
          onZoomChange={canvasView.setZoom}
          externalPan={canvasView.pan}
          bedSize={bedSize}
          showBed={showBed}
          onCursorMove={setCursorPos}
          // Run Plan machine view (PRD #73). The canvas morphs into the machine
          // view exactly WITH the plan: the overlay mounts when the plan is open,
          // fed the SAME runPlanModel the panel reads (route tinted by Operation,
          // ghosted crops, animated run-through). Closed → null slices → clean canvas.
          showPlotOverlay={planOpen}
          appliedOptimizations={appliedOptimizations}
          plotRoute={runPlan?.route ?? null}
          plotCrops={runPlan?.crops ?? null}
          plotOpRows={plotOpRows}
          sheetRect={sheetRect}
          plotPlaying={plotPlaying}
          plotLocate={planLocate}
          onPlotLocate={handlePlanLocate}
          onPlotPlayingChange={setPlotPlaying}
          prefersReducedMotion={prefersReducedMotion}
          activeTool={activeTool}
          transforms={canvasTransforms}
          selectedNodeId={selectedLayerId}
          // Motif anchor-ghost overlay writes force-include/exclude overrides
          // back onto the motif layer's binding via the shared updateLayer.
          onUpdateLayer={updateLayer}
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
          // Suppress the material auto-prompt while the 3D lens is up.
          needsMaterialChoice={colorView.needsMaterialChoice && lensEntry.activeLens !== "3d"}
          // onSetMode routes through the entry coordinator: picking a 2D lens
          // while in 3D exits 3D first (D14), then switches the underlying lens.
          onSetMode={lensEntry.selectLens}
          onSelectMaterial={colorView.selectMaterial}
          // Cut/score visibility bias — Material lens only; 0 = accurate.
          markContrast={colorView.markContrast}
          onSetMarkContrast={colorView.setMarkContrast}
          // 3D lens peer (S3, PRD D1/D2/D14).
          threeDActive={lensEntry.activeLens === "3d"}
          onEnter3D={lensEntry.enter3D}
          onExit3D={lensEntry.exit3D}
          onRebuild={lensEntry.rebuild}
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
          // Thread the pending panel (per-panel add) into the new layer; a
          // global/flat add leaves it undefined → addLayer ignores it and the
          // normalizer assigns the layer. Reset after so it never leaks again.
          addLayer(id, { panelId: pendingPanelId });
          setPendingPanelId(undefined);
          setUI("showPatternPicker", false);
        }}
      />

      {/* Material evaluation side-by-side (slice 1): opens when Scene3D's
          "Evaluate material" button captures a render frame. Self-contained
          (owns auth + submission); Studio only threads the capture pairing. */}
      {evaluationCapture?.material && (
        <MaterialEvaluationDialog
          material={evaluationCapture.material}
          renderDataUrl={evaluationCapture.dataUrl}
          onClose={() => setEvaluationCapture(null)}
        />
      )}

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
            if (config.layers) loadDocumentLayers(config.layers);
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

      {/* Pen-editor modal (Motif Edit Session, Wave 3, #77). The session hook
          (useMotifEditorSession) owns the whole lifecycle — open's fork
          decision, Save/Save-as-copy/Cancel, the Draft Glyph resolution — and
          hands back a dumb `modalProps` bag matching MotifEditorModal's frozen
          prop contract verbatim. Nothing here decides WHAT the modal shows. */}
      {motifSession.isOpen && <MotifEditorModal {...motifSession.modalProps} />}


      {/* Pro-shell top menu bar (B5 / #8). Portaled into the shell's Menu bar
          region when the slot is present; renders nothing in the legacy layout
          (slot is null → no-op). Its items wire to the existing Studio handlers
          (Examples/Load/Cloud/Export/Save/Share), so behavior is unchanged. */}
      {menuSlot &&
        createPortal(
          <MenuBar
            onNew={() => {
              // Global "New layer" — clear any pending per-panel target so the
              // layer is added unassigned (normalizer homes it), never leaking a
              // stale panel id from a prior per-panel add.
              setPendingPanelId(undefined);
              setUI("showPatternPicker", true);
            }}
            onOpen={() => setUI("showLoadModal", true)}
            onExamples={() => setUI("showExamples", !showExamples)}
            onImport={handleImportClick}
            onImportEtch={handleImportEtchClick}
            // Quick export (⌘E): write the file AND surface an Export Receipt
            // (ADR 0001) — never a silent export. Run plan… (⇧⌘E) opens the
            // pre-flight destination. Preferences… opens the crop-to-Sheet toggle.
            onExport={() => runExport(true)}
            onRunPlan={openRunPlan}
            onOpenPreferences={() => setPreferencesOpen(true)}
            onSubmitToOrg={user || submitOrg ? () => setUI("showSubmitModal", true) : undefined}
            onSave={handleSaveLayerGroup}
            onSaveToCloud={onCloudSaveIntent}
            isGuest={!user}
            onOpenCloudDesigns={() => setUI("showCloudModal", true)}
            onDocumentSetup={() => setDocumentSetupOpen(true)}
            // View > Bed size (UX reframe): named presets for the active
            // machine profile, live checked state, select/hide handlers.
            bedPresets={bedPresetsFor(activeProfileId).map((p) => ({
              id: p.id,
              label: p.label,
            }))}
            activeBedPresetId={activeBedPresetId}
            bedVisible={showBed}
            onSelectBedPreset={handleSelectBedPreset}
            onHideBed={handleHideBed}
            onUndo={canUndo ? undo : undefined}
            onRedo={canRedo ? redo : undefined}
            onGenerateAI={() =>
              handleOpenAIChat(
                layers.find((l) => l.id === selectedLayerId) || null
              )
            }
            // Photo → Pattern (issue #49): handler only when flag + tier gate
            // allow; otherwise the item renders present-but-disabled.
            onExtractPattern={
              extractionEnabled
                ? () => {
                    extractFromLibraryRef.current = false;
                    setExtractOpen(true);
                  }
                : undefined
            }
            // Pattern Library (S1, issue #50): the extraction feature's second
            // surface, so it shares the exact same flag + tier gating.
            onOpenLibrary={
              extractionEnabled ? () => setLibraryOpen(true) : undefined
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
              // Name-dirty counts as unsaved too (Rec 2), so a pending rename
              // reads "Unsaved changes" until it autosaves.
              dirty: isDirty() || nameDirty,
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
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            view={canvasView}
          />,
          controlBarSlot
        )}

      {/* Pro-shell param inspector (B3 / #6). Portaled into the shell's right
          Inspector region when the slot is present; renders nothing in the
          legacy layout (slot is null → no-op). */}
      {/* Pro-shell right column morph (Run Plan, PRD #73). When the plan is open
          the RunPlanPanel REPLACES the Inspector in the very same slot — the
          pre-flight face where upstream-live editing gives way to preview →
          apply → export. Fed the single runPlanModel + the optimize handlers;
          onLocate drives the two-way highlight; onExportRun runs the shared
          export (file + Receipt); onClose calls the shell's close(). */}
      {inspectorSlot &&
        createPortal(
          planOpen ? (
            <RunPlanPanel
              runPlan={runPlan}
              profileLabel={profileLabel}
              sheetLine={sheetLine}
              locate={planLocate}
              onLocate={handlePlanLocate}
              optimizations={optimizations}
              onUpdateOptimization={updateOptimization}
              onApplyOptimization={applyOptimization}
              onRevertOptimization={revertOptimization}
              onExportRun={() => runExport(true)}
              onClose={closeRunPlan}
            />
          ) : (
          <Inspector
            layers={layers}
            // Panels (WI-4) — the Highlight Hold control (Raster Etch S4, #83)
            // reads the selected Etch's EFFECTIVE material (panel material OR the
            // Material-lens material) to resolve its material-aware default.
            panels={panels}
            colorView={colorView.colorView}
            // For a Moiré role-B selection this is the partner-A id, so edits
            // redirect to A (B reads A) — matching legacy LayersSection behavior.
            selectedLayerId={inspectorTargetId}
            // Active document unit (#13) — length-tagged params display/convert
            // in this unit; values stay px in layer state.
            unit={unit}
            // Active machine profile (#17, C8) — capability-gates the
            // variable-weight UI (drag-cutter hides it).
            profileId={activeProfileId}
            // Sheet inspector (#75): empty selection = document properties.
            // Size commits route through the SAME handleDocumentSetupApply path
            // the Document Setup dialog uses (recordBatch = one undo entry, and
            // the dialog round-trips the same canvasW/canvasH — single source
            // of truth). Profile/unit halves untouched: size only.
            canvasW={canvasW}
            canvasH={canvasH}
            bedSize={bedSize}
            onApplySheetSize={handleDocumentSetupApply}
            onUpdateLayer={updateLayer}
            onChangeLayerPattern={changeLayerPattern}
            onVariableWeightChange={handleVariableWeightChange}
            // "Preview in 3D" (S8) — opens Surface B (modulation height-surface)
            // focused on this guide layer's field. The button is a TOGGLE: it
            // reads "Close preview" + closes when THIS guide is the open preview.
            onPreviewField={threeD.openHeightSurface}
            onClosePreview={lensEntry.exit3D}
            threeDSubMode={threeD.subMode}
            threeDFocusLayerId={threeD.focusFieldLayerId}
            // Motif device (host Inspector) — add a motif adorning the selected
            // host, and remove a motif via the same delete handler the object
            // tree uses (removeLayer / onDeleteLayer).
            onAddMotif={addMotifLayer}
            onRemoveLayer={removeLayer}
            // WI-5: the Motif device lists imported glyphs (customGlyphs) in its
            // picker (read-only prop — writes route through the session/commits
            // below).
            customGlyphs={customGlyphs}
            // Open the pen editor for a motif row's glyph (Wave 3, #77): the
            // fork decision (custom → in place, built-in → duplicate-to-edit)
            // now lives entirely in the session's `open(layerId, glyphRef)`, so
            // this is a direct pass-through — Inspector no longer decides
            // anything, it just names which layer + ref the user pointed at.
            onEditGlyph={motifSession.open}
            // "New motif…" (draw-from-scratch): a blank Draft Glyph, pen tool
            // active. Direct pass-through — same (layerId) signature Inspector
            // already called.
            onNewMotif={motifSession.openNew}
            // Import SVG as motif (Wave 3, #77): the full read → parse → error
            // → commit flow now lives in the session; Inspector keeps only the
            // <input type=file> arming/click mechanics and hands the raw file
            // + target layer id through.
            onImportFile={motifSession.importFromFile}
            // P4 global library: list the user's promoted motifs in a "My
            // library" optgroup. Copy-on-select and copy+rebind-as-one-undo-
            // entry now route through useGlyphCommits (Wave 1, #77) — the same
            // write-owner the session uses internally, so every glyph write in
            // the app funnels through one seam.
            libraryMotifs={libraryMotifs}
            onCopyLibraryGlyph={(glyph) => glyphCommits.copyGlyphToDoc(glyph)}
            onUseLibraryGlyph={(glyph, layerId, params) =>
              glyphCommits.placeFromLibrary(glyph, layerId, params)
            }
          />
          ),
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
            onProfileChange={recordedProfileChange}
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
            onAddLayer={(panelId) => {
              // Per-panel add passes panel.id; flat/global add passes undefined.
              // Stash it so onPick can thread it into the new layer.
              setPendingPanelId(panelId);
              setUI("showPatternPicker", true);
            }}
            addDisabled={layers.length >= (limits.maxLayers ?? Infinity)}
            // Naqsha Panels grouped tier (WI-6, spec §5) — LASER-ONLY. Passing []
            // in plotter/dragCutter makes LayerTree render the flat list (its
            // grouped tier renders only when panels.length > 0), so non-laser
            // profiles are byte-unchanged. The four handlers are passed
            // unconditionally; they are inert in flat mode (the grouped tier that
            // calls them isn't rendered).
            panels={activeProfileId === "laser" ? panels : []}
            onAddPanel={(substrate) => {
              recordStructural(); // capture-before: one discrete undo entry (S4)
              // NewPanelRow → onCreatePanel → onAddPanel(preset|undefined): a
              // chosen material preset is passed through as the new panel's
              // substrate; no preset → addPanel's plain default panel.
              setPanels((p) => addPanel(p, substrate));
            }}
            onAssignLayerToPanel={(layerId, panelId) =>
              updateLayer(layerId, { panelId })
            }
            onUpdatePanel={(id, patch) => {
              recordStructural();
              setPanels((p) =>
                p.map((pn) => (pn.id === id ? { ...pn, ...patch } : pn))
              );
            }}
            onDeletePanel={(id, { deleteLayers }) => {
              // Delete mutates BOTH slices (panels + layer reassignment). One
              // recordStructural BEFORE both setters folds them into a single
              // undo entry (the snapshot captures panels + layers together).
              // loadLayerSet stays RAW here (a structural edit, NOT a doc load —
              // do not switch to loadDocumentLayers, which would clear history).
              recordStructural();
              const { panels: np, layers: nl } = deletePanel(panels, layers, id, {
                deleteLayers,
              });
              setPanels(np);
              loadLayerSet(nl);
            }}
            onDuplicatePanel={(id) => {
              // Duplicate appends a panel + deep-copies its layers (fresh ids,
              // new panelId). Like delete, it mutates BOTH slices — one
              // recordStructural BEFORE both setters folds it into a single undo
              // entry. loadLayerSet stays RAW (a structural edit, NOT a doc load).
              recordStructural();
              const { panels: np, layers: nl } = duplicatePanel(panels, layers, id);
              setPanels(np);
              loadLayerSet(nl);
            }}
            onClearPanelLayers={(id) => {
              // Drop every layer on this panel. One slice mutated (layers) →
              // recordStructural before the RAW loadLayerSet makes it undoable.
              recordStructural();
              loadLayerSet(clearPanelLayers(layers, id));
            }}
            cap={cap}
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
            // The machine/bed cluster opens the Run Plan (PRD #73) — tap the
            // machine to see what it will do.
            onOpenRunPlan={openRunPlan}
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
          <OperationsPanel
            operations={operations}
            profileId={activeProfileId}
            onCommitOperations={commitOperations}
            onAddOperation={handleAddOperation}
          />,
          operationsPanelSlot
        )}
      {/* The Optimize stack's bottom-left shelf mount RETIRED (Run Plan, PRD
          #73): Optimize now lives ONLY inside the Run Plan's pre-flight face
          (RunPlanPanel renders OptimizeRows), the deliberate commit-to-the-machine
          step. The same useOptimizations handlers (updateOptimization /
          applyOptimization / revertOptimization) are wired straight into the panel
          above, so the applied state that feeds export + the machine view is
          unchanged — only its home moved. OptimizeControls is no longer imported. */}

      {/* Document Setup dialog (C6 / #14; UX reframe). Gated on the pro-shell
          slots so it is live ONLY in the pro shell and a true no-op in the
          legacy layout. It has TWO entry points, both pro-shell-only: the
          File-menu item (menuSlot) and the gear beside the LayerTree machine
          selector (objectTreeSlot) — gate on either so neither opener can set
          documentSetupOpen with nothing mounted. Reads the LIVE active profile
          + work-piece size so reopening shows current settings; Apply routes
          the profile half through the shared handleProfileChange and syncs the
          document unit + canvasW/canvasH (the work piece). The machine bed is
          no longer configured here — it's a View-menu-only reference overlay
          (see handleSelectBedPreset/handleHideBed above). */}
      {(menuSlot || objectTreeSlot) && (
        <DocumentSetupDialog
          open={documentSetupOpen}
          profileId={activeProfileId}
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

      {/* Photo → Pattern extraction stepper (issue #49). Same pro-shell gating
          as the AI chat (its entry point is the Object-menu item). Lazy-mounted
          so the extraction stack (potrace-wasm, worker) loads only when opened.
          On save the pattern picker opens: the fresh pattern is immediately
          visible in its custom family, ready to place. */}
      {menuSlot && extractOpen && (
        <Suspense fallback={null}>
          <ExtractStepper
            tier={tier}
            onClose={() => {
              setExtractOpen(false);
              // Navigate to the return surface only now that the stepper is
              // truly gone (D5). Doing this in onSaved re-opened LibraryView's
              // z-50 backdrop over the still-mounted session-only notice and
              // blocked its "Continue" button. Continue → onClose is the
              // completion signal, so the round-trip lands here for both the
              // guest (notice acknowledged) and persisted (close fires right
              // after save) paths.
              const dest = pendingPostExtractRef.current;
              pendingPostExtractRef.current = null;
              if (dest === "library") {
                setLibraryOpen(true);
              } else if (dest === "picker") {
                setPendingPanelId(undefined);
                setUI("showPatternPicker", true);
              }
            }}
            onSaved={() => {
              // Record the return surface; the actual navigation is deferred to
              // onClose (above) so a session-only notice stays interactive.
              // Round-trip UX: a stepper launched from the Library returns to
              // the Library (the fresh entry is on top); the Object-menu path
              // opens the picker, where the pattern is ready to place.
              pendingPostExtractRef.current = extractFromLibraryRef.current
                ? "library"
                : "picker";
            }}
          />
        </Suspense>
      )}

      {/* Pattern Library view (S1, issue #50). Same pro-shell gating as the
          stepper. One entity, two surfaces: this browses the very entities the
          picker's custom family registered — "Use in Studio" places one as a
          new layer through the same addLayer path the picker uses. */}
      {menuSlot && libraryOpen && (
        <Suspense fallback={null}>
          <LibraryView
            onClose={() => setLibraryOpen(false)}
            onUseInStudio={(patternId) => {
              setLibraryOpen(false);
              addLayer(patternId);
            }}
            onNewExtraction={() => {
              extractFromLibraryRef.current = true;
              setLibraryOpen(false);
              setExtractOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Export Receipt (ADR 0001) — the calm one-line summary that accompanies
          EVERY export (⌘E or the plan's "Export run"), so an export is never
          silent. Held in state (stable ref) so its auto-dismiss timer tracks the
          receipt, not each re-render; the "→ Run plan" link opens the plan. */}
      {receipt && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <ExportReceipt
            receipt={receipt}
            onOpenPlan={openRunPlan}
            onDismiss={dismissReceipt}
          />
        </div>
      )}

      {/* Preferences modal (ADR 0001) — opened from Edit▸Preferences…. Currently
          the single crop-to-Sheet Export toggle; the flip persists via
          exportSettings (profile settings signed-in, localStorage guest). */}
      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        cropToSheet={cropToSheet}
        onChangeCropToSheet={handleChangeCropToSheet}
      />

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
