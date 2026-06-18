import { useCallback, useState } from 'react';

const STORAGE_KEY = 'sonoform-theme';

// The themes Naqsha knows. 'light'/'dark' are the base pair; 'itp-camp' is the
// named kit theme skin (issue #18) applied by the ITP Camp kit mode. Anything
// outside this set is coerced to 'light' (paper is the anchor).
const KNOWN_THEMES = new Set(['light', 'dark', 'itp-camp']);

function readTheme() {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  return KNOWN_THEMES.has(attr) ? attr : 'light';
}

// Naqsha defaults to light regardless of OS preference. The OS
// prefers-color-scheme change listener has been intentionally removed —
// the naqsheh anchor is paper, and a user sitting down to the tool for the
// first time should always see paper, even if their system-wide theme is
// dark. The in-UI toggle is the only way to switch; that choice persists
// to localStorage and wins on subsequent visits.
export function useTheme() {
  const [theme, setThemeState] = useState(readTheme);

  const setTheme = useCallback((next) => {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
