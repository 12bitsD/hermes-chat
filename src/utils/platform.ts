/**
 * Platform / screen-size helpers. Centralized so the rest of the app
 * doesn't sprinkle `Platform.OS` and `Dimensions.get` everywhere.
 *
 * "isNarrow" drives the mobile-first layout. We deliberately don't use
 * `useWindowDimensions` from a hook here because callers want a stable
 * value at module init (e.g. for class-style pickers).
 */
import { Platform, Dimensions } from 'react-native';

const NARROW_BREAKPOINT = 768;

export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';
export const isWeb = Platform.OS === 'web';
export const isNative = isAndroid || isIOS;

const { width } = Dimensions.get('window');
export const isNarrow = width < NARROW_BREAKPOINT;
export const isWide = !isNarrow;

export const SCREEN = { width, height: Dimensions.get('window').height };

/** Subscribe to size changes — wrap in useEffect at the call site. */
export function watchScreen(cb: (size: { width: number; height: number }) => void) {
  const sub = Dimensions.addEventListener('change', ({ window }) => cb(window));
  return () => sub.remove();
}
