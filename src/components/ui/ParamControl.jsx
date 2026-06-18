import Slider from "./Slider";
import Select from "./Select";
import IconSelect from "./IconSelect";
import Pad2D from "./Pad2D";
import ParamPlot from "./ParamPlot";
import AngleDial from "./AngleDial";
import CurveEditor from "./CurveEditor";
import { useLayerParams } from "../../lib/useLayerParams";

// Dispatcher: owns the `def.type -> control component` mapping so ParamGroup /
// the featured slot don't switch inline. New controls (WI-2..WI-6) register here.
//
// Single-key controls read `params[def.key]` and write a one-key patch.
// Composite controls (WI-3's pad2d) carry `def.keys` and no real `def.key`
// value; their dedicated component maps the listed keys. Until those land, an
// unknown `type` falls through to Slider gracefully (no crash).
//
// Unit tagging (issue #13): a param def may carry `unit: 'length'`, meaning its
// value is a px-backed real-world length. When the active document unit (read
// from the LayerParams context) is mm/in, a length-tagged Slider DISPLAYS in
// that unit and converts typed entry back to px. The stored value stays px, so
// pattern generation/export are unchanged. Absence of the tag = raw px. The
// active unit is only present on the shell Inspector's context; the legacy
// LayerCard context omits it, so legacy keeps showing raw px automatically.
export default function ParamControl({ def, params, onChange }) {
  const { unit } = useLayerParams();
  switch (def.type) {
    // Single-key (like Slider), but the honest preview needs two sibling
    // params: the curve plots the engine's actual scaleNonLinearity falloff,
    // whose bend depends on `scaleFactor` and `depth`. Writes a one-key patch.
    case "curve":
      return (
        <CurveEditor
          label={def.label}
          value={params[def.key] ?? def.min}
          min={def.min}
          max={def.max}
          step={def.step}
          scaleFactor={params.scaleFactor}
          depth={params.depth}
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );

    // Composite: Pad2D reads/writes both def.keys; pass the trio straight
    // through and let it map the keys.
    case "pad2d":
      return <Pad2D def={def} params={params} onChange={onChange} />;

    // Composite: ParamPlot reads/writes both def.keys, each over its own axis
    // range. Two differently-ranged named scalars on one labelled plane.
    case "plot2d":
      return <ParamPlot def={def} params={params} onChange={onChange} />;

    // Single-key (like Slider): reads params[def.key], writes a one-key patch.
    // Carries dial-specific props wrap / detent / detentLabel.
    case "dial":
      return (
        <AngleDial
          label={def.label}
          value={params[def.key] ?? def.min}
          min={def.min}
          max={def.max}
          step={def.step}
          wrap={def.wrap}
          detent={def.detent}
          detentLabel={def.detentLabel}
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );

    case "iconselect":
      return (
        <IconSelect
          label={def.label}
          value={params[def.key] ?? def.min}
          options={def.options}
          range={def.range}
          glyph={def.glyph}
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );

    case "select":
      return (
        <Select
          label={def.label}
          value={params[def.key] || def.options[0].value}
          options={def.options}
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );

    default:
      return (
        <Slider
          label={def.label}
          value={params[def.key] ?? def.min}
          min={def.min}
          max={def.max}
          step={def.step}
          // Only length-tagged params follow the active document unit; everything
          // else stays raw px regardless of `unit`.
          unit={def.unit === "length" ? unit : undefined}
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );
  }
}
