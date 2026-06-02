/**
 * Theme entry point — flat design. The legacy `palette` / `bevel` exports
 * are kept (with neutral/empty values) so any old import that slips through
 * doesn't crash. All new code uses `useTheme()` + the named exports below.
 */

import { useColorScheme } from 'react-native';
import { useAppStore } from '../store/app';
import { accentList, getAccent, FlatTheme, AccentName } from './win95';
import { lightNeutral, darkNeutral, neutral as defaultNeutral, type, space, radius, shadow, z, easing } from './win95';

export { accentList, getAccent, lightNeutral, darkNeutral, type, space, radius, shadow, z, easing };
export type { FlatTheme, AccentName };

// Back-compat: theme/index.ts still re-exports `neutral` (resolves to light).
// Components that need dark mode should call useNeutral() instead.
export const neutral = defaultNeutral;

// ─── legacy back-compat shims ────────────────────────────────────────────────
// Old code that still imports { palette, bevel, type, BevelKey } from 'theme'
// gets a flat, light, no-bevel shim so it doesn't crash. The chrome rewrite
// no longer uses any of these.

const _palette = {
  desktop: defaultNeutral.bg,
  surface: defaultNeutral.surface,
  surfaceAlt: defaultNeutral.surfaceMuted,
  surfaceDark: defaultNeutral.borderStrong,
  paper: defaultNeutral.surface,
  canvas: defaultNeutral.bg,
  bevelHi: defaultNeutral.border,
  bevelLo: defaultNeutral.borderStrong,
  bevelLight: defaultNeutral.border,
  bevelDark: defaultNeutral.borderStrong,
  bevelDarker: defaultNeutral.borderStrong,
  ink: defaultNeutral.ink,
  inkSoft: defaultNeutral.inkSoft,
  inkMuted: defaultNeutral.inkMuted,
  inkInverse: defaultNeutral.inkInverse,
  inkBlue: '#007AFF',
  inkLink: '#007AFF',
  titlebarActive: defaultNeutral.ink,
  titlebarActiveText: defaultNeutral.inkInverse,
  titlebarInactive: defaultNeutral.surfaceMuted,
  titlebarInactiveText: defaultNeutral.inkMuted,
  hotPink: '#E91E63',
  cyberBlue: '#00B8D4',
  sakura: '#FFB7C5',
  ok: defaultNeutral.ok,
  warn: defaultNeutral.warn,
  err: defaultNeutral.err,
};

const _bevel = {
  raised: { borderWidth: 0 },
  raisedThin: { borderWidth: 0 },
  inset: { borderWidth: 0 },
  sunken: { borderWidth: 0 },
};

/** Hook — accent color. Re-renders when the accent setting changes. */
export function useTheme(): FlatTheme {
  const accent = useAppStore((s) => (s.settings as any).accent as AccentName | undefined);
  return getAccent(accent);
}

/**
 * Hook — full color palette that respects system light/dark. Components
 * that style with `neutral.xxx` should call this instead of importing the
 * static `neutral`, so the app flips with the user's system theme.
 */
export function useNeutral() {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkNeutral : lightNeutral;
}

export const palette = _palette;
export const bevel = _bevel;
export type BevelKey = keyof typeof _bevel;
