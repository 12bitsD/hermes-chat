/**
 * Flat design tokens — replaces the Win95 3D chrome with a flat, low-noise
 * aesthetic closer to Linear / iMessage / Notion.
 *
 * Accent variants ('mono' | 'blue' | 'pink' | 'green') pick a single color
 * for the interactive states. Everything else is gray scale.
 */

import type { TextStyle } from 'react-native';

export type AccentName = 'mono' | 'ocean' | 'sakura' | 'forest';

export interface FlatTheme {
  name: AccentName;
  displayName: string;
  accent: {
    fg: string;            // primary interactive color (e.g. links, send button)
    fgOn: string;          // text/icon color when sitting on accent
    soft: string;          // tinted background (selected, hover, focus)
    line: string;          // 1px lines
  };
}

const accentDefs: Record<AccentName, FlatTheme> = {
  mono: {
    name: 'mono',
    displayName: 'Mono',
    accent: { fg: '#111', fgOn: '#fff', soft: '#f1f1f1', line: '#e3e3e6' },
  },
  ocean: {
    name: 'ocean',
    displayName: 'Ocean',
    accent: { fg: '#007AFF', fgOn: '#fff', soft: '#e6f0ff', line: '#d6e4ff' },
  },
  sakura: {
    name: 'sakura',
    displayName: 'Sakura',
    accent: { fg: '#E91E63', fgOn: '#fff', soft: '#fde7ef', line: '#f7d4e0' },
  },
  forest: {
    name: 'forest',
    displayName: 'Forest',
    accent: { fg: '#16a34a', fgOn: '#fff', soft: '#e8f7ee', line: '#d4ecde' },
  },
};

export const accentList = Object.values(accentDefs);

export function getAccent(name: string | undefined): FlatTheme {
  return accentDefs[(name as AccentName)] ?? accentDefs.mono;
}

// ─── neutral grays ───────────────────────────────────────────────────────────

export const lightNeutral = {
  bg: '#FAFAFA',            // app background
  surface: '#FFFFFF',        // cards / inputs
  surfaceMuted: '#F4F4F5',  // hover, secondary surfaces
  border: '#E4E4E7',        // 1px dividers
  borderStrong: '#D4D4D8',  // heavier dividers
  ink: '#18181B',           // primary text
  inkSoft: '#3F3F46',       // secondary text
  inkMuted: '#71717A',      // tertiary text / hints
  inkInverse: '#FFFFFF',
  ok: '#16a34a',
  warn: '#D97706',
  err: '#DC2626',
} as const;

export const darkNeutral = {
  bg: '#0E0E10',             // app background
  surface: '#1B1B1F',         // cards / inputs
  surfaceMuted: '#26262C',   // hover, secondary surfaces
  border: '#2A2A30',         // 1px dividers
  borderStrong: '#3F3F46',   // heavier dividers
  ink: '#FAFAFA',            // primary text
  inkSoft: '#D4D4D8',
  inkMuted: '#8E8E93',
  inkInverse: '#18181B',
  ok: '#4ADE80',
  warn: '#FBBF24',
  err: '#F87171',
} as const;

// Use light by default; theme/index.ts will swap based on Appearance.
export const neutral = lightNeutral;

// ─── spacing & radius ────────────────────────────────────────────────────────

export const radius = { sm: 6, md: 8, lg: 12, pill: 999 } as const;
export const space = { hair: 1, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

// ─── typography (system font, lean line-height) ──────────────────────────────

export const type = {
  // Re-organised into a strict 8-step scale so every component
  // picks a tier, not a fontSize. This collapses 14 different
  // fontSize values down to 8 and lines each one up with a role.
  captionXs: { fontFamily: 'System', fontSize: 10, lineHeight: 13 } as TextStyle,
  captionSm: { fontFamily: 'System', fontSize: 11, lineHeight: 14 } as TextStyle,
  caption:   { fontFamily: 'System', fontSize: 12, lineHeight: 16 } as TextStyle,
  body:      { fontFamily: 'System', fontSize: 13, lineHeight: 18 } as TextStyle,
  bodyMd:    { fontFamily: 'System', fontSize: 14, lineHeight: 20 } as TextStyle,
  bodyLg:    { fontFamily: 'System', fontSize: 15, lineHeight: 22 } as TextStyle,
  title:     { fontFamily: 'System', fontSize: 17, fontWeight: '600', lineHeight: 22 } as TextStyle,
  display:   { fontFamily: 'System', fontSize: 19, fontWeight: '600', lineHeight: 26 } as TextStyle,
  hero:      { fontFamily: 'System', fontSize: 24, fontWeight: '700', lineHeight: 30 } as TextStyle,
  // Aliases for components that already say `type.ui` / `type.uiBold`
  ui:        { fontFamily: 'System', fontSize: 13, lineHeight: 18 } as TextStyle,
  uiBold:    { fontFamily: 'System', fontSize: 13, fontWeight: '600', lineHeight: 18 } as TextStyle,
  // Mono — for ids, code, technical data
  code:      { fontFamily: 'Courier', fontSize: 12, lineHeight: 17 } as TextStyle,
} as const;

export const shadow = { none: { elevation: 0 } } as const;
export const z = { base: 0, chrome: 10, dropdown: 100, popover: 1000, modal: 10000, tooltip: 100000 } as const;
export const easing = { instant: 0, fast: 120, normal: 180 } as const;
