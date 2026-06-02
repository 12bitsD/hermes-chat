/**
 * Text-to-speech helper. Wraps the platform TTS so the long-press menu
 * in MessageBubble can offer a "Read aloud" action.
 *
 * Uses lazy `require()` so the web bundle doesn't pull in any TTS polyfill
 * (Speech is iOS/Android only, and we no-op there with a haptic).
 */
import { Platform } from 'react-native';
import { haptic } from './haptic';

let cachedSpeech: any = null;
function getSpeech(): any {
  if (cachedSpeech) return cachedSpeech;
  try {
    // expo-speech is the canonical TTS for Expo. It's not a hard dep so
    // we try to require it; if missing, fall back to RN's bare Speech.
    const expo = require('expo-speech');
    cachedSpeech = expo?.default ?? expo;
  } catch {
    try {
      const rn = require('react-native').Speech;
      cachedSpeech = rn;
    } catch { cachedSpeech = null; }
  }
  return cachedSpeech;
}

export function speak(text: string, opts: { rate?: number; pitch?: number } = {}): void {
  const S = getSpeech();
  if (!S?.speak) {
    // No TTS available — at least acknowledge with a haptic so the user
    // knows the tap was received.
    haptic('light');
    return;
  }
  // Strip markdown / formatting so the speech is clean
  const cleaned = text
    .replace(/[#*_`>]+/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\n+/g, '. ')
    .slice(0, 4000); // bound length to keep TTS fast
  if (!cleaned) return;
  try {
    S.stop?.();
    S.speak(cleaned, {
      language: 'en-US',
      pitch: opts.pitch ?? 1.0,
      rate: opts.rate ?? (Platform.OS === 'ios' ? 0.5 : 0.45),
    });
  } catch {
    haptic('light');
  }
}

export function stopSpeaking(): void {
  try { getSpeech()?.stop?.(); } catch { /* ignore */ }
}
