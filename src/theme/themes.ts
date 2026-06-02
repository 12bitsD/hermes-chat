/**
 * Theme system — one source of truth for all chrome.
 *
 * 4 themes:
 *   - win95: classic Windows 95 gray + teal desktop
 *   - win98: lighter gray, soft drop shadows, rounded buttons
 *   - system7: warm beige (System 7.5 "Platinum"), black 1px lines
 *   - sakura: 90s anime magenta + hot pink accents, sakura-pink desktop
 *
 * Each theme exports the same shape as the legacy `palette` / `bevel` /
 * `type` objects so existing call-sites needn't change. We re-export the
 * active theme from theme/index.ts.
 */

import type { TextStyle } from 'react-native';

export interface Theme {
  name: 'win95' | 'win98' | 'system7' | 'sakura';
  displayName: string;
  palette: {
    desktop: string;
    surface: string;
    surfaceAlt: string;
    surfaceDark: string;
    paper: string;
    canvas: string;
    bevelHi: string;
    bevelLo: string;
    bevelLight: string;
    bevelDark: string;
    bevelDarker: string;
    ink: string;
    inkSoft: string;
    inkMuted: string;
    inkInverse: string;
    inkBlue: string;
    inkLink: string;
    titlebarActive: string;
    titlebarActiveText: string;
    titlebarInactive: string;
    titlebarInactiveText: string;
    accent: string;        // theme-specific signature color
    accentSoft: string;
    ok: string;
    warn: string;
    err: string;
  };
  bevel: {
    raised: any;
    raisedThin: any;
    inset: any;
    sunken: any;
  };
  type: {
    ui: TextStyle;
    uiBold: TextStyle;
    body: TextStyle;
    title: TextStyle;
    display: TextStyle;
    code: TextStyle;
    hero: TextStyle;
  };
}

// ─── win95 ───────────────────────────────────────────────────────────────────

const win95: Theme = {
  name: 'win95',
  displayName: 'Windows 95',
  palette: {
    desktop: '#008C8C',
    surface: '#C0C0C0',
    surfaceAlt: '#D4D0C8',
    surfaceDark: '#808080',
    paper: '#FFFFFF',
    canvas: '#FAFAF6',
    bevelHi: '#FFFFFF',
    bevelLo: '#000000',
    bevelLight: '#DFDFDF',
    bevelDark: '#808080',
    bevelDarker: '#404040',
    ink: '#000000',
    inkSoft: '#222222',
    inkMuted: '#5A5A5A',
    inkInverse: '#FFFFFF',
    inkBlue: '#000080',
    inkLink: '#0000EE',
    titlebarActive: '#000080',
    titlebarActiveText: '#FFFFFF',
    titlebarInactive: '#808080',
    titlebarInactiveText: '#D4D0C8',
    accent: '#000080',
    accentSoft: '#E6F4FE',
    ok: '#008000',
    warn: '#A07000',
    err: '#A00000',
  },
  bevel: {
    raised: {
      borderTopColor: '#FFFFFF', borderLeftColor: '#FFFFFF',
      borderRightColor: '#000000', borderBottomColor: '#000000',
      borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2,
    },
    raisedThin: {
      borderTopColor: '#DFDFDF', borderLeftColor: '#DFDFDF',
      borderRightColor: '#808080', borderBottomColor: '#808080',
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    },
    inset: {
      borderTopColor: '#000000', borderLeftColor: '#000000',
      borderRightColor: '#FFFFFF', borderBottomColor: '#FFFFFF',
      borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2,
    },
    sunken: {
      borderTopColor: '#808080', borderLeftColor: '#808080',
      borderRightColor: '#FFFFFF', borderBottomColor: '#FFFFFF',
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    },
  },
  type: {
    ui: { fontFamily: 'System', fontSize: 11, lineHeight: 14 },
    uiBold: { fontFamily: 'System', fontSize: 11, fontWeight: 'bold', lineHeight: 14 },
    body: { fontFamily: 'System', fontSize: 13, lineHeight: 18 },
    title: { fontFamily: 'System', fontSize: 13, fontWeight: 'bold', lineHeight: 16 },
    display: { fontFamily: 'Courier', fontSize: 16, lineHeight: 20 },
    code: { fontFamily: 'Courier', fontSize: 12, lineHeight: 16 },
    hero: { fontFamily: 'System', fontSize: 20, fontWeight: 'bold', lineHeight: 24 },
  },
};

// ─── win98 ───────────────────────────────────────────────────────────────────

const win98: Theme = {
  name: 'win98',
  displayName: 'Windows 98',
  palette: {
    ...win95.palette,
    surface: '#D4D0C8',        // a touch warmer than win95
    surfaceAlt: '#ECE9D8',
    canvas: '#FBFAF6',
    bevelHi: '#FFFFFF',
    bevelLo: '#404040',        // softer black
    inkBlue: '#0A246A',        // navy
    titlebarActive: '#0A246A',
    accent: '#316AC5',
    accentSoft: '#E8EEF7',
  },
  bevel: {
    ...win95.bevel,
  },
  type: { ...win95.type },
};

// ─── system7 ─────────────────────────────────────────────────────────────────

const system7: Theme = {
  name: 'system7',
  displayName: 'System 7',
  palette: {
    desktop: '#7A7568',          // warm taupe wallpaper
    surface: '#DDDDDD',
    surfaceAlt: '#EFECDE',
    surfaceDark: '#888888',
    paper: '#FFFFFF',
    canvas: '#F5F2E9',
    bevelHi: '#FFFFFF',
    bevelLo: '#000000',
    bevelLight: '#E8E5DA',
    bevelDark: '#888888',
    bevelDarker: '#444444',
    ink: '#000000',
    inkSoft: '#1f1f1f',
    inkMuted: '#5a5a5a',
    inkInverse: '#FFFFFF',
    inkBlue: '#000000',           // System 7 used black striped selection
    inkLink: '#0000EE',
    titlebarActive: '#000000',    // classic S7 black-and-white titlebar
    titlebarActiveText: '#FFFFFF',
    titlebarInactive: '#BBBBBB',
    titlebarInactiveText: '#555555',
    accent: '#000000',
    accentSoft: '#EFECDE',
    ok: '#1B6B1B',
    warn: '#8A6300',
    err: '#8A0000',
  },
  bevel: {
    raised: {
      borderTopColor: '#FFFFFF', borderLeftColor: '#FFFFFF',
      borderRightColor: '#000000', borderBottomColor: '#000000',
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    },
    raisedThin: win95.bevel.raisedThin,
    inset: {
      borderTopColor: '#000000', borderLeftColor: '#000000',
      borderRightColor: '#FFFFFF', borderBottomColor: '#FFFFFF',
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    },
    sunken: win95.bevel.sunken,
  },
  type: {
    ...win95.type,
    body: { fontFamily: 'System', fontSize: 12, lineHeight: 17 },
  },
};

// ─── sakura ──────────────────────────────────────────────────────────────────

const sakura: Theme = {
  name: 'sakura',
  displayName: 'Sakura 🌸',
  palette: {
    desktop: '#FF8FB1',           // hot-pink desktop wallpaper
    surface: '#FFE2EC',           // pinkish-white chrome
    surfaceAlt: '#FFF2F7',
    surfaceDark: '#C9A5B0',
    paper: '#FFFFFF',
    canvas: '#FFF5F8',            // softest pink canvas
    bevelHi: '#FFFFFF',
    bevelLo: '#FF3D7F',           // hot-pink bevel (anime magenta)
    bevelLight: '#FFE0EC',
    bevelDark: '#E07AA0',
    bevelDarker: '#A00050',
    ink: '#1f0d18',
    inkSoft: '#3a1f2a',
    inkMuted: '#7a4358',
    inkInverse: '#FFFFFF',
    inkBlue: '#E0006A',
    inkLink: '#D6006A',
    titlebarActive: '#E0006A',
    titlebarActiveText: '#FFFFFF',
    titlebarInactive: '#E8B5C7',
    titlebarInactiveText: '#7a4358',
    accent: '#FF1493',            // hot pink
    accentSoft: '#FFE6F0',
    ok: '#1B7A3A',
    warn: '#B07000',
    err: '#C4004A',
  },
  bevel: {
    raised: {
      borderTopColor: '#FFFFFF', borderLeftColor: '#FFFFFF',
      borderRightColor: '#FF3D7F', borderBottomColor: '#FF3D7F',
      borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2,
    },
    raisedThin: {
      borderTopColor: '#FFE0EC', borderLeftColor: '#FFE0EC',
      borderRightColor: '#E07AA0', borderBottomColor: '#E07AA0',
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    },
    inset: {
      borderTopColor: '#FF3D7F', borderLeftColor: '#FF3D7F',
      borderRightColor: '#FFFFFF', borderBottomColor: '#FFFFFF',
      borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2,
    },
    sunken: {
      borderTopColor: '#E07AA0', borderLeftColor: '#E07AA0',
      borderRightColor: '#FFE0EC', borderBottomColor: '#FFE0EC',
      borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1,
    },
  },
  type: {
    ...win95.type,
    hero: { fontFamily: 'System', fontSize: 22, fontWeight: 'bold', lineHeight: 26 },
  },
};

export const themes: Record<Theme['name'], Theme> = { win95, win98, system7, sakura };

/** Pick the active theme by name, with safe fallback to win95. */
export function getTheme(name: string | undefined): Theme {
  return themes[(name as Theme['name'])] ?? win95;
}
