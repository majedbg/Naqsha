import { describe, it, expect } from "vitest";
import { buildModulationGraph } from "./modulationGraph";

// buildModulationGraph(layers) builds the relationship edge model that drives
// the git-graph rail (WI-8) and the connection badges (WI-9). One edge per
// modulator map whose target resolves to an existing layer, from a guide that
// can produce a field. `active` mirrors resolveModulationForTarget's first-match
// (first incoming edge into a target wins). `polaritySign` derives from the
// guide range midpoint.

const guide = (over = {}) => ({
  id: "g",
  patternType: "topographic",
  params: {},
  seed: 1,
  ...over,
});
const target = (id, over = {}) => ({ id, patternType: "grainfield", ...over });

const mods = (maps, range) => ({
  modulator: { ...(range ? { range } : {}), maps },
});

describe("buildModulationGraph", () => {
  it("emits one edge per resolvable map; byGuide/byTarget counts are correct", () => {
    const g = guide(mods([
      { targetLayerId: "t1", amount: 1 },
      { targetLayerId: "t2", amount: 1 },
    ]));
    const layers = [g, target("t1"), target("t2")];
    const graph = buildModulationGraph(layers);

    expect(graph.edges.length).toBe(2);
    expect(graph.byGuide.get("g").length).toBe(2);
    expect(graph.byTarget.get("t1").length).toBe(1);
    expect(graph.byTarget.get("t2").length).toBe(1);
  });

  it("marks exactly the first incoming edge (array order) active for a target mapped by two guides", () => {
    const g1 = guide({ id: "g1", ...mods([{ targetLayerId: "t", amount: 1 }]) });
    const g2 = guide({ id: "g2", ...mods([{ targetLayerId: "t", amount: 1 }]) });
    const layers = [g1, g2, target("t")];
    const graph = buildModulationGraph(layers);

    const incoming = graph.byTarget.get("t");
    expect(incoming.length).toBe(2);
    expect(incoming.filter((e) => e.active).length).toBe(1);
    expect(incoming.find((e) => e.guideId === "g1").active).toBe(true);
    expect(incoming.find((e) => e.guideId === "g2").active).toBe(false);
  });

  it("derives polaritySign from the range midpoint", () => {
    const mk = (range) =>
      buildModulationGraph([
        guide(mods([{ targetLayerId: "t", amount: 1 }], range)),
        target("t"),
      ]).edges[0].polaritySign;

    expect(mk({ min: 0, max: 1 })).toBe(1); // attract / garnet
    expect(mk({ min: -1, max: 0 })).toBe(-1); // repel / sapphire
    expect(mk({ min: -1, max: 1 })).toBe(0); // bipolar
    // absent range defaults to {-1,1} → midpoint 0
    expect(
      buildModulationGraph([
        guide(mods([{ targetLayerId: "t", amount: 1 }])),
        target("t"),
      ]).edges[0].polaritySign
    ).toBe(0);
  });

  it("uses the map channel, falling back to channelForTarget(target.patternType)", () => {
    const g = guide(mods([
      { targetLayerId: "t1", channel: "warp", amount: 1 },
      { targetLayerId: "t2", amount: 1 }, // no channel → grainfield → density
    ]));
    const graph = buildModulationGraph([g, target("t1"), target("t2")]);
    expect(graph.byTarget.get("t1")[0].channel).toBe("warp");
    expect(graph.byTarget.get("t2")[0].channel).toBe("density");
  });

  it("emits no edges for a guide that cannot produce a field", () => {
    const g = {
      id: "g",
      patternType: "grainfield", // not a field producer
      ...mods([{ targetLayerId: "t", amount: 1 }]),
    };
    const graph = buildModulationGraph([g, target("t")]);
    expect(graph.edges.length).toBe(0);
    expect(graph.byGuide.get("g")).toBeUndefined();
  });

  it("skips self-maps and maps to non-existent targets", () => {
    const g = guide(mods([
      { targetLayerId: "g", amount: 1 }, // self-map
      { targetLayerId: "nope", amount: 1 }, // missing target
      { targetLayerId: "t", amount: 1 }, // valid
    ]));
    const graph = buildModulationGraph([g, target("t")]);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].targetId).toBe("t");
  });

  it("tolerates missing/empty modulator, empty maps, and empty layers", () => {
    expect(buildModulationGraph([]).edges).toEqual([]);
    expect(buildModulationGraph(undefined).edges).toEqual([]);
    const g = guide({ modulator: undefined });
    expect(buildModulationGraph([g, target("t")]).edges).toEqual([]);
    const g2 = guide(mods([]));
    expect(buildModulationGraph([g2, target("t")]).edges).toEqual([]);
  });

  it("does not mutate input layers", () => {
    const g = guide(mods([{ targetLayerId: "t", amount: 1 }]));
    const snapshot = JSON.stringify(g);
    buildModulationGraph([g, target("t")]);
    expect(JSON.stringify(g)).toBe(snapshot);
  });
});
