import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Global keyboard shortcut hook. Only wires on web — native key handling
 * is out of scope for Phase 1.
 *
 * Usage:
 *   useShortcut('mod+k', () => openCommandPalette())
 *   useShortcut('mod+n', () => newSession(), { allowInInputs: false })
 *   useShortcut('escape', () => close())
 */
export type ShortcutHandler = (e: KeyboardEvent) => void;

export interface ShortcutOptions {
  /** Allow firing while focus is inside a text input/textarea. Default false. */
  allowInInputs?: boolean;
  /** Prevent default browser behavior. Default true. */
  preventDefault?: boolean;
}

const isMac = Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

function normalize(combo: string): string {
  // "mod" → "meta" on mac, "ctrl" elsewhere. Strip spaces.
  return combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .map((p) => (p === 'mod' ? (isMac ? 'meta' : 'ctrl') : p))
    .sort()
    .join('+');
}

function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.metaKey) parts.push('meta');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  parts.push(e.key.toLowerCase());
  return parts.sort().join('+');
}

function isInTextField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (t as any).isContentEditable;
}

export function useShortcut(combo: string, handler: ShortcutHandler, opts: ShortcutOptions = {}) {
  const { allowInInputs = false, preventDefault = true } = opts;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const target = normalize(combo);
    const onKey = (e: KeyboardEvent) => {
      if (!allowInInputs && isInTextField(e)) return;
      if (eventCombo(e) === target) {
        if (preventDefault) e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler, allowInInputs, preventDefault]);
}
