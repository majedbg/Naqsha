// P0-B — enablement gate for the frame-time readout (D19).
//
// Deliberately query-param-only (`?fps=1`), not an env/DEV check: a DEV-only
// gate would still show it to every developer by default, which the brief
// explicitly says not to do ("do NOT show it to normal users... by default").
// Query-param opt-in means it's off for everyone — guests, devs, prod — until
// someone deliberately asks for it, in dev or prod builds alike.

export function isFrameStatsEnabled(search) {
  try {
    const raw = search ?? (typeof window !== "undefined" ? window.location.search : "");
    const params = new URLSearchParams(raw);
    return params.get("fps") === "1";
  } catch {
    // Malformed/unavailable location — never let a diagnostic overlay throw.
    return false;
  }
}

export default isFrameStatsEnabled;
