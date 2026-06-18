// Feature flag for the pro app-shell (Lane B / B1, GitHub issue #2).
//
// OFF (default): the app renders the legacy Studio layout, byte-identical to the
// pre-shell app. ON: the eight empty pro-shell region frames render, with the
// existing Studio hosted inside the canvas region.
//
// Matches the repo's existing convention of Vite env flags (see
// `import.meta.env.VITE_*` in ShareButton/AuthContext/supabase). Toggle by
// setting `VITE_PRO_SHELL=true` (or `1`) in the environment / `.env`. Anything
// else (including unset) is OFF, so production is unaffected until later slices
// are ready.
//
// Tests pass the resolved boolean explicitly as a prop (`StudioRoute proShell`)
// to stay independent of env stubbing.
export const PRO_SHELL_FLAG =
  import.meta.env.VITE_PRO_SHELL === 'true' ||
  import.meta.env.VITE_PRO_SHELL === '1';
