import Slider from "./Slider";
import Select from "./Select";
import IconSelect from "./IconSelect";
import Pad2D from "./Pad2D";
import AngleDial from "./AngleDial";

// Dispatcher: owns the `def.type -> control component` mapping so ParamGroup /
// the featured slot don't switch inline. New controls (WI-2..WI-6) register here.
//
// Single-key controls read `params[def.key]` and write a one-key patch.
// Composite controls (WI-3's pad2d) carry `def.keys` and no real `def.key`
// value; their dedicated component maps the listed keys. Until those land, an
// unknown `type` falls through to Slider gracefully (no crash).
export default function ParamControl({ def, params, onChange }) {
  switch (def.type) {
    // case "curve":      -> CurveEditor  (WI-6)

    // Composite: Pad2D reads/writes both def.keys; pass the trio straight
    // through and let it map the keys.
    case "pad2d":
      return <Pad2D def={def} params={params} onChange={onChange} />;

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
          onChange={(v) => onChange({ ...params, [def.key]: v })}
          tooltip={def.tooltip}
        />
      );
  }
}
