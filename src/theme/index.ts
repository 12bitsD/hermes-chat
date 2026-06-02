/**
 * Theme entry point. Re-exports the active theme and a useTheme() hook that
 * subscribes to settings.theme. The legacy `palette` / `bevel` / `type`
 * objects are kept as static references to win95 for back-compat with any
 * code that still imports them directly (the bulk of components now use
 * `useTheme()` and re-render on theme change).
 */
import { useAppStore } from '../store/app';
import { themes, getTheme, Theme } from './themes';
import { palette as w95Palette, bevel as w95Bevel, type as w95Type } from './win95';

export { themes, getTheme };
export type { Theme };

// Back-compat re-exports (default = win95)
export const palette = w95Palette;
export const bevel = w95Bevel;
export const type = w95Type;
export type BevelKey = keyof typeof w95Bevel;

export { radius, space, shadow, z, easing } from './win95';

/** React hook — re-renders the consumer when the theme setting changes. */
export function useTheme(): Theme {
  const name = useAppStore((s) => s.settings.theme);
  return getTheme(name);
}
