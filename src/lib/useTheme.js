import { useCallback, useState } from 'react';

const STORAGE_KEY = 'sonoform-theme';

function readTheme() {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
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
