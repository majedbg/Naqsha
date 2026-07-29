// @vitest-environment jsdom
//
// UnitToggle — the portable "Travelling rule" unit switch.
//
// WHAT THESE TESTS DELIBERATELY DO NOT ASSERT. jsdom reports `clientWidth`,
// `offsetLeft` and `offsetWidth` as 0 and implements no ResizeObserver, so the
// underline's measured geometry is unavailable: a test that watched the rule
// "slide" would either pass vacuously or become a test of a layout stub. The
// contract is asserted instead — semantics, keyboard, the visual law, and the
// data attributes through which the motion is expressed — plus one test that
// stubs the layout box explicitly and says so.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import UnitToggle from "./UnitToggle";

const SOURCE = resolve(process.cwd(), "src/components/ui/UnitToggle.jsx");

/** The source with every comment removed — JS line/block comments AND the CSS
 *  comments inside the injected stylesheet. The guards below are about what the
 *  component DOES; a prose warning naming `font-weight` must not read as a
 *  violation of the rule it is warning about. */
const code = () =>
  readFileSync(SOURCE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");

const OPTIONS = [
  { id: "density", label: "Density", a11yLabel: "Density, anchors per 100 units" },
  { id: "spacing", label: "Spacing", a11yLabel: "Spacing, units between anchors" },
];

const realMatchMedia = window.matchMedia;
function mockReducedMotion(matches) {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

const setup = (over = {}) => {
  const onChange = vi.fn();
  const utils = render(
    <UnitToggle options={OPTIONS} value="density" onChange={onChange} label="Unit" {...over} />,
  );
  return { onChange, ...utils };
};

describe("UnitToggle — semantics", () => {
  it("is a radiogroup of native radios, named by its label", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: "Unit" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("names each option by its UNIT, not just its word", () => {
    // The graphic beside it is aria-hidden, so this is the only surface that
    // can say what each reading measures.
    setup();
    expect(screen.getByRole("radio", { name: "Density, anchors per 100 units" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Spacing, units between anchors" })).toBeInTheDocument();
  });

  it("falls back to the visible word when no a11yLabel is supplied", () => {
    setup({ options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }], value: "a" });
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeInTheDocument();
  });

  it("checks exactly the option named by `value`", () => {
    const { rerender } = setup();
    expect(screen.getByRole("radio", { name: /^Density/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Spacing/ })).not.toBeChecked();
    rerender(<UnitToggle options={OPTIONS} value="spacing" onChange={() => {}} label="Unit" />);
    expect(screen.getByRole("radio", { name: /^Spacing/ })).toBeChecked();
  });

  it("leaves the tab order entirely to the native radio group", () => {
    // One tab stop is what a same-named radio group gives you for free (roving
    // focus onto the checked member). jsdom does not implement that behaviour,
    // so what is assertable — and what would actually break it — is whether
    // this component overrides `tabindex` on either radio. It must not.
    setup();
    const radios = screen.getAllByRole("radio");
    for (const r of radios) expect(r).not.toHaveAttribute("tabindex");
    // …and they must share one `name`, or they are two groups and two tab stops.
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios[0].name).toBeTruthy();
  });

  it("reports the picked option and writes nothing itself", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /^Spacing/ }));
    expect(onChange).toHaveBeenCalledWith("spacing");
    // Still showing `value` — the parent owns it. A toggle that moved on its
    // own would make "the toggle writes nothing" untestable downstream.
    expect(screen.getByRole("radio", { name: /^Density/ })).toBeChecked();
  });

  it("renders nothing rather than an empty track when given no options", () => {
    const { container } = render(<UnitToggle options={[]} value="x" onChange={() => {}} label="Unit" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("survives a missing onChange", () => {
    render(<UnitToggle options={OPTIONS} value="density" label="Unit" />);
    expect(() => fireEvent.click(screen.getByRole("radio", { name: /^Spacing/ }))).not.toThrow();
  });
});

describe("UnitToggle — keyboard", () => {
  it("advances on Enter and wraps", () => {
    const { onChange, rerender } = setup();
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("spacing");
    rerender(<UnitToggle options={OPTIONS} value="spacing" onChange={onChange} label="Unit" />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("density"); // wrapped
  });

  it("leaves Space entirely native", () => {
    // A hand-rolled Space handler with preventDefault is the classic way to
    // break a radio, so the group must not claim the key at all.
    const { onChange } = setup();
    const e = fireEvent.keyDown(screen.getByRole("radiogroup"), { key: " ", cancelable: true });
    expect(e).toBe(true); // not prevented
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops the arrow keys escaping to the host", () => {
    // The arrows belong to the radio group natively; the DragNumber beside it
    // also steps on ArrowUp/ArrowDown. A host listening above must not see a
    // keystroke the group is handling.
    const onOuter = vi.fn();
    const onChange = vi.fn();
    render(
      <div onKeyDown={onOuter}>
        <UnitToggle options={OPTIONS} value="density" onChange={onChange} label="Unit" />
      </div>,
    );
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      fireEvent.keyDown(screen.getByRole("radiogroup"), { key });
    }
    expect(onOuter).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled(); // the native radio does that, not us
  });

  it("lets Enter reach the group but not the host above it", () => {
    const onOuter = vi.fn();
    const onChange = vi.fn();
    render(
      <div onKeyDown={onOuter}>
        <UnitToggle options={OPTIONS} value="density" onChange={onChange} label="Unit" />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("spacing");
    expect(onOuter).not.toHaveBeenCalled();
  });

  it("ignores keys it does not own", () => {
    const { onChange } = setup();
    for (const key of ["Escape", "Tab", "a", "Home"]) {
      fireEvent.keyDown(screen.getByRole("radiogroup"), { key });
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("UnitToggle — the visual law", () => {
  it("marks selection with colour and opacity, and NEVER with font-weight", () => {
    // Measured in the prototype: a bolder selected word is 1px wider, which
    // moves every option box on flip and lands the underline off the word.
    // A source guard because the rule is about what CSS exists at all.
    const src = code();
    expect(src).not.toMatch(/font-weight|font-variation|font-stretch/);
    expect(src).toMatch(/\.ut-opt\[data-selected="true"\] \.ut-word \{[^}]*color: var\(--ink\);/);
    expect(src).toMatch(/\.ut-word \{[^}]*color: var\(--ink-soft\);[^}]*opacity: 0\.\d+;/);
  });

  it("uses design tokens only — no hex colour literals in the source", () => {
    const src = readFileSync(SOURCE, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(src).toContain("var(--saffron)");
    expect(src).toContain("var(--violet)");
  });

  it("moves the rule with transform only — never width, left, margin or padding", () => {
    const ruleBlock = code().match(/\.ut-rule\[data-animate="true"\] \{([^}]*)\}/)[1];
    expect(ruleBlock).toMatch(/transition: transform var\(--motion-medium\) var\(--ease-out-quint\)/);
    expect(ruleBlock).not.toMatch(/width|left|margin|padding/);
  });

  it("carries no bounce, elastic or overshoot curve", () => {
    // Principle 4. Every easing named in the sheet is one of the host's
    // ease-outs, and no raw bezier can smuggle an overshoot past them.
    const src = code();
    const eases = src.match(/--ease-[a-z-]+/g) ?? [];
    expect(eases.length).toBeGreaterThan(0);
    for (const e of eases) expect(e).toMatch(/^--ease-out-/);
    expect(src).not.toMatch(/cubic-bezier|elastic|bounce|overshoot|steps\(/i);
  });

  it("does not clip the track, so a focus ring on an outer option survives", () => {
    const track = code().match(/\.ut-track \{([^}]*)\}/)[1];
    expect(track).not.toMatch(/overflow/);
  });

  it("imports nothing but React — the portability guarantee", () => {
    const src = readFileSync(SOURCE, "utf8");
    const imports = [...src.matchAll(/^import .*? from ["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(imports).toEqual(["react"]);
    // No Tailwind class names either: every className here is a `ut-` hook.
    for (const [, cls] of src.matchAll(/className="([^"]*)"/g)) {
      for (const token of cls.split(/\s+/).filter(Boolean)) expect(token).toMatch(/^ut-/);
    }
  });

  it("injects its own stylesheet exactly once, however many instances mount", () => {
    render(
      <>
        <UnitToggle options={OPTIONS} value="density" onChange={() => {}} label="A" />
        <UnitToggle options={OPTIONS} value="spacing" onChange={() => {}} label="B" />
      </>,
    );
    expect(document.querySelectorAll("#unit-toggle-styles")).toHaveLength(1);
    expect(document.getElementById("unit-toggle-styles").textContent).toContain(".ut-rule");
  });
});

describe("UnitToggle — motion state", () => {
  it("animates by default", () => {
    mockReducedMotion(false);
    setup();
    expect(screen.getByTestId("unit-toggle-rule")).toHaveAttribute("data-animate", "true");
  });

  it("under prefers-reduced-motion lands instantly instead of being disabled", () => {
    mockReducedMotion(true);
    const { onChange } = setup();
    expect(screen.getByTestId("unit-toggle-rule")).toHaveAttribute("data-animate", "false");
    // Still fully operable and still fully legible — reduced motion removes the
    // travel, never the control or the reading.
    fireEvent.click(screen.getByRole("radio", { name: /^Spacing/ }));
    expect(onChange).toHaveBeenCalledWith("spacing");
    expect(screen.getByText("Density")).toBeVisible();
    expect(screen.getByText("Spacing")).toBeVisible();
  });

  it("hides the rule until it has an honest place to be", () => {
    // jsdom lays nothing out, so this is the unmeasured state by construction.
    setup();
    expect(screen.getByTestId("unit-toggle-rule")).toHaveAttribute("data-measured", "false");
  });

  it("places and sizes the rule from the measured option box", () => {
    // The ONE test that needs layout, so it stubs the three properties jsdom
    // reports as 0 and says so rather than pretending to measure.
    // `clientWidth` lives on Element.prototype in jsdom and the two offsets on
    // HTMLElement.prototype, so the saved descriptor is `undefined` for some of
    // them and restoring means DELETING the shadow rather than redefining it.
    const saved = {};
    const define = (prop, get) => {
      saved[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get });
    };
    const restore = () => {
      for (const [prop, desc] of Object.entries(saved)) {
        if (desc) Object.defineProperty(HTMLElement.prototype, prop, desc);
        else delete HTMLElement.prototype[prop];
      }
    };
    define("clientWidth", function () {
      return this.classList.contains("ut-track") ? 100 : 0;
    });
    // Laid out the way the real thing is: two 50px options side by side in a
    // 100px track. Position comes from the option's INDEX, never from which one
    // is selected — that is the point (the boxes must not move on flip).
    const indexOf = (el) => [...el.parentElement.children].filter((c) => c.classList.contains("ut-opt")).indexOf(el);
    define("offsetLeft", function () {
      return this.classList.contains("ut-opt") ? indexOf(this) * 50 : 0;
    });
    define("offsetWidth", function () {
      return this.classList.contains("ut-opt") ? 50 : 0;
    });
    try {
      const { rerender } = setup();
      const rule = screen.getByTestId("unit-toggle-rule");
      expect(rule).toHaveAttribute("data-measured", "true");
      expect(rule.style.transform).toBe("translateX(0px) scaleX(0.5)");
      rerender(<UnitToggle options={OPTIONS} value="spacing" onChange={() => {}} label="Unit" />);
      // Travelled to the second option, same size. `width` never changed.
      expect(screen.getByTestId("unit-toggle-rule").style.transform).toBe(
        "translateX(50px) scaleX(0.5)",
      );
    } finally {
      restore();
    }
  });
});
