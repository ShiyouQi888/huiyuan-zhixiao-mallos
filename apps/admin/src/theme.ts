export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'solar_theme_mode';

export function getThemeMode(): ThemeMode {
  return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;
  root.setAttribute('theme-mode', mode);
  root.classList.toggle('dark', mode === 'dark');
  localStorage.setItem(STORAGE_KEY, mode);
}

export function initializeThemeMode(): ThemeMode {
  const mode = getThemeMode();
  applyThemeMode(mode);
  return mode;
}
