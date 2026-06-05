import Slider from "./Slider";
import Select from "./Select";

// Dispatcher: owns the `def.type -> control component` mapping so ParamGroup /
// the featured slot don't switch inline. New controls (WI-2..WI-6) register here.
//
// Single-key controls read `params[def.key]` and write a one-key patch.
// Composite controls (WI-3's pad2d) carry `def.keys` and no real `def.key`
// value; their dedicated component maps the listed keys. Until those land, an
// unknown `type` falls through to Slider gracefully (no crash).
export default function ParamControl({ def, params, onChange }) {
  switch (def.type) {
    // case "iconselect": -> IconSelect   (WI-2 / WI-5)
    // case "pad2d":      -> Pad2D        (WI-3)
    // case "dial":       -> AngleDial    (WI-4)
    // case "curve":      -> CurveEditor  (WI-6)

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
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );
  }
}
