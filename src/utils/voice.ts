/**
 * Voice input helper. Wraps `expo-speech-recognition` so the rest of the
 * app doesn't have to know about the module's API quirks.
 *
 * Flow:
 *   1. requestPermissions() — call before starting
 *   2. start(onPartial, onFinal) — returns a stop() function
 *   3. onPartial fires repeatedly while user speaks; onFinal once they stop
 *
 * The module is loaded lazily so the app still works if the native binary
 * is missing (e.g. Expo Go on a device that hasn't rebuilt).
 */

type Stop = () => Promise<string | null>;

export async function requestVoicePermission(): Promise<boolean> {
  try {
    const mod = require('expo-speech-recognition');
    const M = mod?.ExpoSpeechRecognitionModule ?? mod?.default ?? mod;
    if (!M?.requestPermissionsAsync) return false;
    const res = await M.requestPermissionsAsync();
    return !!res?.granted;
  } catch {
    return false;
  }
}

export async function startVoice(
  onPartial: (text: string, isFinal: boolean) => void,
  onError: (err: Error) => void,
): Promise<Stop | null> {
  let SR: any;
  try {
    const mod = require('expo-speech-recognition');
    SR = mod?.ExpoSpeechRecognitionModule ?? mod?.default ?? mod;
    if (!SR) throw new Error('expo-speech-recognition unavailable');
  } catch (e: any) {
    onError(new Error(`Voice not available: ${e?.message ?? e}`));
    return null;
  }

  let stopped = false;
  const sub = SR.addListener?.('result', (event: any) => {
    const text = event?.results?.[0]?.transcript ?? event?.transcript ?? '';
    const isFinal = !!event?.isFinal;
    onPartial(text, isFinal);
  });
  const errSub = SR.addListener?.('error', (event: any) => {
    onError(new Error(event?.message ?? 'speech recognition error'));
  });

  try {
    await SR.startAsync?.({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      // Android-only options we just pass through; ignored on iOS
      maxAlternatives: 1,
    });
  } catch (e: any) {
    sub?.remove?.();
    errSub?.remove?.();
    onError(new Error(`start failed: ${e?.message ?? e}`));
    return null;
  }

  return async () => {
    if (stopped) return null;
    stopped = true;
    try { await SR.stopAsync?.(); } catch { /* ignore */ }
    sub?.remove?.();
    errSub?.remove?.();
    return null;
  };
}
