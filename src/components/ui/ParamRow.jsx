import ParamControl from "./ParamControl";
import HeroDragCue from "./HeroDragCue";
import { isRowDefault } from "../../lib/params/paramOps";
import { useLayerParams } from "../../lib/useLayerParams";

// Reusable reset icon (circular refresh arrows)
function ResetIcon({ size = 12 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
      <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14" />
    </svg>
  );
}

// One parameter row: control + per-param reset + randomize checkbox + randomize
// button. Shared by ParamGroup (inside a group) and the featured-param slot.
//
// AR-3B: only `def` is a prop now (per-row identity). params/defaults/keys + the
// toggle/randomize/reset handlers are read from the LayerParams context provided
// at LayerCard. `key={def.key}` upstream keeps each row stable across re-renders.
export default function ParamRow({ def }) {
  const {
    params,
    defaults,
    randomizeKeys,
    onChange,
    toggleKey,
    randomizeSingle,
    resetSingle,
  } = useLayerParams();
  const keys = randomizeKeys || [];
  const isDefault = isRowDefault(def, params, defaults);

  return (
    <div className="flex items-start gap-1.5" data-testid={`param-row-${def.key}`}>
      {/* Param control — S3: wrapped in HeroDragCue, a no-op passthrough
          unless this row is the active guest seed's hero control (D6). */}
      <div className="flex-1 min-w-0">
        <HeroDragCue def={def}>
          <ParamControl def={def} params={params} onChange={onChange} />
        </HeroDragCue>
      </div>

      {/* Per-param reset */}
      <button
        onClick={() => resetSingle(def)}
        disabled={isDefault}
        className="mt-[3px] shrink-0 p-0.5 rounded text-ink-soft hover:text-tone-mild transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        title={
          isDefault
            ? `${def.label} is at default`
            : `Reset ${def.label} to default`
        }
      >
        <ResetIcon size={12} />
      </button>

      {/* Randomize checkbox */}
      <label
        className="flex items-center mt-[3px] shrink-0"
        title="Include in randomize"
      >
        <input
          type="checkbox"
          checked={keys.includes(def.key)}
          onChange={() => toggleKey(def.key)}
          className="accent-saffron w-3 h-3 cursor-pointer"
        />
      </label>

      {/* Per-param randomize */}
      <button
        onClick={() => randomizeSingle(def)}
        className="mt-[3px] shrink-0 p-0.5 rounded text-ink-soft hover:text-saffron transition-colors"
        title={`Randomize ${def.label}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M16 3h5v5" />
          <path d="M4 20L21 3" />
          <path d="M21 16v5h-5" />
          <path d="M15 15l6 6" />
          <path d="M4 4l5 5" />
        </svg>
      </button>
    </div>
  );
}
