// RoleGlyphToggles — Route's collapsed summary control. One small toggle per role
// the host kind offers (crossing / cell / edge / tip via the caller's `options`,
// the same host-scoped role list the detail checkboxes use). Each toggle draws a
// single-role RoleBadge fragment as its mark and reads pressed/unpressed by
// whether that role is in the current `roles` set, with the role NAME as its
// accessible name.
//
// SEAM: toggling reports only the role KEY up via onToggle(key); the caller owns
// the roles array and writes the add/remove through the SAME editChain path as
// the detail checkboxes — so the two never drift. The `motif-role-toggle-<key>`
// testid is the summary handle (distinct from the detail checkbox's
// `motif-block-role-<key>`), so summary and detail never collide when both mount.
import RoleBadge from "./RoleBadge";

export default function RoleGlyphToggles({
  hostKind,
  options = [],
  roles = [],
  onToggle,
  size = 16,
}) {
  const on = new Set(Array.isArray(roles) ? roles : []);
  return (
    <div className="flex items-center gap-1" data-testid="motif-role-toggles">
      {options.map((r) => {
        const pressed = on.has(r.key);
        return (
          <button
            key={r.key}
            type="button"
            data-testid={`motif-role-toggle-${r.key}`}
            aria-pressed={pressed}
            aria-label={r.label}
            title={r.label}
            onClick={() => onToggle?.(r.key)}
            className={[
              "flex items-center rounded-xs border p-0.5 outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-violet",
              pressed
                ? "border-ink-soft bg-paper-warm text-ink"
                : "border-hairline bg-paper text-ink-soft opacity-60 hover:opacity-100",
            ].join(" ")}
          >
            <RoleBadge hostKind={hostKind} roles={[r.key]} size={size} />
          </button>
        );
      })}
    </div>
  );
}
