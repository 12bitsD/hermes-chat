/**
 * Lightweight haptic helper. Uses `expo-haptics` if installed, falls back to
 * a no-op on web. Wrapped in try/catch so missing native module never crashes.
 *
 * We don't add `expo-haptics` as a hard dependency — the iOS Taptic Engine
 * is nice but not required for v0.5.
 */
import { isNative } from './platform';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export async function haptic(style: HapticStyle = 'light'): Promise<void> {
  if (!isNative) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Haptics = require('expo-haptics');
    const M = Haptics?.default ?? Haptics;
    if (!M) return;
    switch (style) {
      case 'light':   await M.impactAsync?.(M.ImpactFeedbackStyle?.Light).catch(() => {}); break;
      case 'medium':  await M.impactAsync?.(M.ImpactFeedbackStyle?.Medium).catch(() => {}); break;
      case 'heavy':   await M.impactAsync?.(M.ImpactFeedbackStyle?.Heavy).catch(() => {}); break;
      case 'success': await M.notificationAsync?.(M.NotificationFeedbackType?.Success).catch(() => {}); break;
      case 'warning': await M.notificationAsync?.(M.NotificationFeedbackType?.Warning).catch(() => {}); break;
      case 'error':   await M.notificationAsync?.(M.NotificationFeedbackType?.Error).catch(() => {}); break;
    }
  } catch {
    // module not installed — silent no-op
  }
}
