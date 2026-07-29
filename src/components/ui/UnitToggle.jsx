// UnitToggle — "Travelling rule": a two-or-more-way switch between readings of
// one value. Both words stay readable; a saffron underline slides beneath the
// live one and resizes to its width.
//
// ── PORTABILITY IS A REQUIREMENT, NOT A NICE-TO-HAVE ────────────────────────
// This file imports nothing from this repo, knows nothing about density,
// spacing, anchors or motifs, carries no Tailwind classes, needs no global
// store and no context, and reaches for no build step. Everything it draws
// lives in the stylesheet it injects. Lifting it into another repo means
// remapping exactly these custom properties and nothing else:
//
//   colour   --ink  --ink-soft  --hairline  --saffron  --violet
//   motion   --motion-medium  --motion-fast  --ease-out-quint
//   type     --text-xs  --font-body
//   radius   --radius-xs
//
// ── THE BET ────────────────────────────────────────────────────────────────
// Colour as punctuation taken to its limit (`.impeccable.md` principle 2): a
// 2px rule is the least ink that can still say "this one", so the control
// disappears into the panel until you look at it. It is deliberately the most
// restrained shape available, because it sits directly above a graphic that is
// already doing the explaining.
//
// ── THE VISUAL LAW, AND THE HAZARD IT EXISTS FOR ───────────────────────────
// Selected word `--ink`; unselected `--ink-soft` AND slightly reduced opacity,
// so selection is carried twice over on a control with no fill.
//
// ⚠️ NEVER `font-weight`. Measured in the prototype: weighting the selected
// word made it ONE PIXEL WIDER, which moves every option box on flip — the
// underline then animates toward a target that no longer exists and lands off
// the word. Colour and opacity are safe precisely because neither affects
// layout. This is the whole reason the rule below is measured in JS at all.
//
// ── MOTION LAW ─────────────────────────────────────────────────────────────
// `transform` and `opacity` only — never `width`, `left`, `margin` or
// `padding`. The rule is ONE element whose layout width is the track's; it is
// placed with `translateX` and sized with `scaleX`, so nothing ever reflows.
// One ease-out curve, no bounce, no elastic, no overshoot (principle 4).
//
// `prefers-reduced-motion` is honoured TWICE: the host's motion tokens collapse
// to 0ms, AND the JS hook below drops the transition outright, so the rule
// lands instantly and fully legible. The control is never disabled.
//
// ── ACCESSIBILITY ──────────────────────────────────────────────────────────
// A real `role="radiogroup"` over native `<input type="radio">`: one tab stop,
// native ←/→/↑/↓, native Space, free announcement of the change. Enter is added
// by hand (radios ignore it) and wraps. Space is left ENTIRELY native — a
// hand-rolled Space handler with `preventDefault` is the classic way to break a
// radio. Each input carries `aria-label` from `a11yLabel`, so the accessible
// name states the unit rather than only the word.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/* ------------------------------------------------------------- stylesheet */

const STYLE_ID = "unit-toggle-styles";

const STYLESHEET = `
.ut-root {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  line-height: 1;
  -webkit-user-select: none;
  user-select: none;
}
.ut-track {
  position: relative;
  display: flex;
  align-items: stretch;
  padding-bottom: 4px;
  /* NO overflow:hidden. The rule never exceeds the track — its widest state is
     one option box — and clipping here would cut the focus ring off the outer
     edge of the first and last options. Measured in the prototype. */
}
.ut-opt {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 2px 6px;
  cursor: pointer;
  white-space: nowrap;
}
/* Visually hidden, still focusable and still a real radio — clip-path rather
   than display:none, which would take it out of the tab order entirely. */
.ut-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  clip-path: inset(50%);
  pointer-events: none;
}
.ut-word {
  position: relative;
  z-index: 2;
  color: var(--ink-soft);
  opacity: 0.72;
  border-radius: var(--radius-xs);
  transition: color var(--motion-fast) linear, opacity var(--motion-fast) linear;
}
.ut-opt[data-selected="true"] .ut-word {
  color: var(--ink);
  opacity: 1;
}
/* Principle 5 — the focus ring is violet, obvious on all four sides, and never
   animated. outline-offset is what keeps it off the glyphs. */
.ut-input:focus-visible + .ut-word {
  outline: 2px solid var(--violet);
  outline-offset: 1px;
}
.ut-hairline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--hairline);
}
.ut-rule {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background: var(--saffron);
  transform-origin: left center;
  will-change: transform;
}
/* Before the first measurement the rule has no honest place to be, so it does
   not claim one. visibility, not display, so it stays measurable. */
.ut-rule[data-measured="false"] { visibility: hidden; }
.ut-rule[data-animate="true"] {
  transition: transform var(--motion-medium) var(--ease-out-quint);
}
`;

/**
 * Injected once per document, so the component carries its own styling with no
 * import a host repo has to wire up and no build step. Rewritten rather than
 * skipped when the node already exists, so an edit to the sheet lands under HMR
 * without a reload; idempotent for the N-instance case.
 */
function useInjectedStyles() {
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    if (el.textContent !== STYLESHEET) el.textContent = STYLESHEET;
  }, []);
}

/** Inlined on purpose — the portable component must not import a repo hook. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return undefined;
    }
    const on = () => setReduced(mq.matches);
    on();
    // `addEventListener` on a MediaQueryList is the modern spelling; older
    // engines only have `addListener`. Both are guarded so neither is assumed.
    if (mq.addEventListener) {
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
    if (mq.addListener) {
      mq.addListener(on);
      return () => mq.removeListener(on);
    }
    return undefined;
  }, []);
  return reduced;
}

/**
 * Every option box in track-local px — measured from the track's PADDING edge,
 * which is what `offsetLeft` reports.
 *
 * Observes the OPTION elements as well as the track, so the async webfont swap
 * — which changes label widths without changing the track — is caught for free
 * rather than leaving the rule measured against fallback metrics.
 */
function useOptionBoxes(options) {
  const trackRef = useRef(null);
  const elsRef = useRef(new Map());
  const [geo, setGeo] = useState({ trackW: 0, boxes: {} });
  const idKey = options.map((o) => o.id).join(" ");

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const trackW = track.clientWidth;
    const boxes = {};
    for (const [id, el] of elsRef.current) {
      if (el) boxes[id] = { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth };
    }
    // Bail out of the state write when nothing moved: a ResizeObserver fires on
    // every layout pass, and an unconditional setState here would re-render the
    // whole control on each one.
    setGeo((prev) => {
      if (prev.trackW !== trackW) return { trackW, boxes };
      const a = Object.keys(prev.boxes);
      const b = Object.keys(boxes);
      const same =
        a.length === b.length &&
        b.every((k) => prev.boxes[k] && prev.boxes[k].l === boxes[k].l && prev.boxes[k].r === boxes[k].r);
      return same ? prev : { trackW, boxes };
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    let live = true;
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (ro) {
      if (trackRef.current) ro.observe(trackRef.current);
      for (const el of elsRef.current.values()) if (el) ro.observe(el);
    }
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (live) measure(); }).catch(() => {});
    }
    return () => {
      live = false;
      if (ro) ro.disconnect();
    };
  }, [measure, idKey]);

  // Cached per id — a fresh ref callback every render would detach and
  // re-attach the node on every paint, and the ResizeObserver with it.
  const cbRef = useRef(new Map());
  const setOptionEl = useCallback((id) => {
    let cb = cbRef.current.get(id);
    if (!cb) {
      cb = (el) => {
        if (el) elsRef.current.set(id, el);
        else elsRef.current.delete(id);
      };
      cbRef.current.set(id, cb);
    }
    return cb;
  }, []);

  const measured = geo.trackW > 0 && options.every((o) => geo.boxes[o.id]);
  return { trackRef, setOptionEl, trackW: geo.trackW, boxes: geo.boxes, measured };
}

const EMPTY = [];

/**
 * @param {object} props
 * @param {Array<{id: string, label: string, a11yLabel?: string}>} props.options
 *   Two options is the case this ships for, but nothing below assumes exactly
 *   two — the keyboard wraps over N and the rule measures whatever is there.
 *   Keep the array identity stable; it is a measurement dependency.
 * @param {string} props.value        the selected option's `id`.
 * @param {(id: string) => void} props.onChange
 * @param {string} props.label        names the radiogroup.
 */
export default function UnitToggle({ options, value, onChange, label }) {
  useInjectedStyles();
  const name = useId();
  const reduced = useReducedMotion();
  const opts = Array.isArray(options) ? options : EMPTY;
  const { trackRef, setOptionEl, trackW, boxes, measured } = useOptionBoxes(opts);

  /**
   * The radiogroup keyboard contract. ←/→/↑/↓ and Space are NATIVE; the arrows
   * merely stop propagating because the group owns them — a host that also
   * listens on window for ←/→ (or an adjacent DragNumber that steps on them)
   * must not see them. Enter advances to the next option, wrapping.
   */
  const onKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.stopPropagation();
        return;
      }
      if (e.key !== "Enter" || opts.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const index = Math.max(0, opts.findIndex((o) => o.id === value));
      onChange?.(opts[(index + 1) % opts.length].id);
    },
    [opts, value, onChange],
  );

  if (opts.length === 0) return null;

  const box = boxes[value] ?? { l: 0, r: 0 };
  const scale = trackW > 0 ? (box.r - box.l) / trackW : 0;

  return (
    <div className="ut-root" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      <div className="ut-track" ref={trackRef}>
        <div className="ut-hairline" />
        <div
          className="ut-rule"
          data-testid="unit-toggle-rule"
          data-measured={measured ? "true" : "false"}
          data-animate={reduced ? "false" : "true"}
          // translateX places the left edge; scaleX sizes it against the track's
          // own width. Never `width`, never `left`.
          style={{ transform: `translateX(${box.l}px) scaleX(${scale})` }}
        />
        {opts.map((o) => (
          <label
            key={o.id}
            className="ut-opt"
            data-selected={o.id === value ? "true" : "false"}
            ref={setOptionEl(o.id)}
          >
            <input
              className="ut-input"
              type="radio"
              name={name}
              value={o.id}
              checked={o.id === value}
              aria-label={o.a11yLabel ?? o.label}
              onChange={() => onChange?.(o.id)}
            />
            <span className="ut-word">{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
