/**
 * Theme entry point — flat design. The legacy `palette` / `bevel` exports
 * are kept (with neutral/empty values) so any old import that slips through
 * doesn't crash. All new code uses `useTheme()` + the named exports below.
 */

import { useAppStore } from '../store/app';
import { accentList, getAccent, FlatTheme, AccentName } from './win95';
import { neutral, type, space, radius, shadow, z, easing } from './win95';

export { accentList, getAccent, neutral, type, space, radius, shadow, z, easing };
export type { FlatTheme, AccentName };

// ─── legacy back-compat shims ────────────────────────────────────────────────
// Old components still import { palette, bevel, type, BevelKey }. We expose
// minimal stubs that match the names they touch — they're flat now, no chrome.

const _palette = {
  desktop: neutral.bg,
  surface: neutral.surface,
  surfaceAlt: neutral.surfaceMuted,
  surfaceDark: neutral.borderStrong,
  paper: neutral.surface,
  canvas: neutral.bg,
  bevelHi: neutral.border,
  bevelLo: neutral.borderStrong,
  bevelLight: neutral.border,
  bevelDark: neutral.borderStrong,
  bevelDarker: neutral.borderStrong,
  ink: neutral.ink,
  inkSoft: neutral.inkSoft,
  inkMuted: neutral.inkMuted,
  inkInverse: neutral.inkInverse,
  inkBlue: '#007AFF',
  inkLink: '#007AFF',
  titlebarActive: neutral.ink,
  titlebarActiveText: neutral.inkInverse,
  titlebarInactive: neutral.surfaceMuted,
  titlebarInactiveText: neutral.inkMuted,
  hotPink: '#E91E63',
  cyberBlue: '#00B8D4',
  sakura: '#FFB7C5',
  ok: neutral.ok,
  warn: neutral.warn,
  err: neutral.err,
};

const _bevel = {
  raised: { borderWidth: 0 },
  raisedThin: { borderWidth: 0 },
  inset: { borderWidth: 0 },
  sunken: { borderWidth: 0 },
};

/** Hook — re-renders when the accent setting changes. */
export function useTheme(): FlatTheme {
  const accent = useAppStore((s) => (s.settings as any).accent as AccentName | undefined);
  return getAccent(accent);
}

export const palette = _palette;
export const bevel = _bevel;
export type BevelKey = keyof typeof _bevel;
