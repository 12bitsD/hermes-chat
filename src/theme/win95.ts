/**
 * Win95 / Win98 / System 7 inspired design tokens.
 * Not literal pixel-clone — slightly modernized spacing + AA contrast
 * while keeping the chrome (raised/inset/3D) faithful to the era.
 */

export const palette = {
  // Surfaces
  desktop: '#008C8C', // classic teal wallpaper
  surface: '#C0C0C0', // base gray
  surfaceAlt: '#D4D0C8', // slightly warmer gray (System 7)
  surfaceDark: '#808080',
  paper: '#FFFFFF', // text editor / chat canvas
  canvas: '#FAFAF6', // softer paper for chat
  // 3D bevels
  bevelHi: '#FFFFFF',
  bevelLo: '#000000',
  bevelLight: '#DFDFDF',
  bevelDark: '#808080',
  bevelDarker: '#404040',
  // Text
  ink: '#000000',
  inkSoft: '#222222',
  inkMuted: '#5A5A5A',
  inkInverse: '#FFFFFF',
  inkBlue: '#000080', // selected text
  inkLink: '#0000EE',
  // Accents
  titlebarActive: '#000080',
  titlebarActiveText: '#FFFFFF',
  titlebarInactive: '#808080',
  titlebarInactiveText: '#D4D0C8',
  hotPink: '#FF66CC', // 90s anime magenta
  cyberBlue: '#00FFFF',
  sakura: '#FFB7C5',
  // Status
  ok: '#008000',
  warn: '#A07000',
  err: '#A00000',
} as const;

export const radius = {
  none: 0,
  sm: 2,
  md: 3,
  lg: 4,
} as const;

export const space = {
  hair: 1,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  xxxl: 32,
} as const;

export const type = {
  ui: {
    fontFamily: 'System',
    fontSize: 11,
    lineHeight: 14,
  },
  uiBold: {
    fontFamily: 'System',
    fontSize: 11,
    fontWeight: 'bold' as const,
    lineHeight: 14,
  },
  body: {
    fontFamily: 'System',
    fontSize: 13,
    lineHeight: 18,
  },
  title: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: 'bold' as const,
    lineHeight: 16,
  },
  display: {
    fontFamily: 'Courier',
    fontSize: 16,
    lineHeight: 20,
  },
  code: {
    fontFamily: 'Courier',
    fontSize: 12,
    lineHeight: 16,
  },
  // Hero — used by greeting card, larger Win95-styled
  hero: {
    fontFamily: 'System',
    fontSize: 20,
    fontWeight: 'bold' as const,
    lineHeight: 24,
  },
} as const;

export const shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;

export const z = {
  base: 0,
  chrome: 10,
  dropdown: 100,
  popover: 1000,
  modal: 10000,
  tooltip: 100000,
  cursor: 999999,
} as const;

export const easing = {
  // Win95 dialog snap — no easing, no real animation
  instant: 0,
  fast: 80,
  normal: 150,
} as const;

// 3D bevel constants used across raised/inset/sunken surfaces
export const bevel = {
  raised: {
    borderTopColor: palette.bevelHi,
    borderLeftColor: palette.bevelHi,
    borderRightColor: palette.bevelLo,
    borderBottomColor: palette.bevelLo,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  raisedThin: {
    borderTopColor: palette.bevelLight,
    borderLeftColor: palette.bevelLight,
    borderRightColor: palette.bevelDark,
    borderBottomColor: palette.bevelDark,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  inset: {
    borderTopColor: palette.bevelLo,
    borderLeftColor: palette.bevelLo,
    borderRightColor: palette.bevelHi,
    borderBottomColor: palette.bevelHi,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  sunken: {
    borderTopColor: palette.bevelDark,
    borderLeftColor: palette.bevelDark,
    borderRightColor: palette.bevelHi,
    borderBottomColor: palette.bevelHi,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
} as const;

export type Palette = typeof palette;
export type BevelKey = keyof typeof bevel;
