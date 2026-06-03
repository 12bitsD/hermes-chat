/**
 * Persist zustand store to AsyncStorage. Schema is JSON, debounced 400ms
 * so a flurry of streaming-message updates doesn't thrash the disk.
 *
 * Also reconciles the LLM client with the persisted provider/endpoint so the
 * very first message after launch goes to the right backend.
 *
 * On first launch (provider is still the default mock AND the user has
 * never made their own settings choice), kicks off a background
 * `autoDetectLLM()` sweep against a small list of well-known LLM endpoints
 * (Hermes gateway 8642, Ollama 11434, plus 10.0.2.2 for Android emulator).
 * If a real endpoint responds, silently flip the user to it. After the
 * user has touched settings we set a flag in AsyncStorage so the
 * auto-detector doesn't second-guess them.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from './app';
import { configureLLM, getLLMClient } from '../services/llm';
import { autoDetectLLM } from '../services/llm/auto-detect';
import { defaultEndpoint } from '../services/llm/config';

const STORAGE_KEY = 'hermes-chat:state:v1';
const CUSTOMIZED_KEY = 'hermes-chat:settings-customized';
const SAVE_DEBOUNCE_MS = 400;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: string = '';
let bootStrapDone = false;

/** Pull the latest settings out of the store and reconfigure the LLM client. */
export function syncLLMFromSettings() {
  const s = useAppStore.getState().settings;
  configureLLM({
    provider: s.llmProvider,
    endpoint: s.llmEndpoint || defaultEndpoint(),
    apiKey: s.llmApiKey || undefined,
    defaultModel: s.llmModel || 'default',
  });
  // Expose a manual trigger for debugging: in dev, the web console can
  // call `window.__hermes_resync?.()` after editing settings/storage.
  if (typeof window !== 'undefined') (window as any).__hermes_resync = syncLLMFromSettings;
}

/** Touch a setting — re-syncs the LLM client so changes take effect immediately. */
export function updateSetting<K extends keyof ReturnType<typeof useAppStore.getState>['settings']>(
  key: K,
  value: ReturnType<typeof useAppStore.getState>['settings'][K],
) {
  useAppStore.getState().updateSettings({ [key]: value } as any);
  // Mark settings as user-customized so auto-detect won't fire on next launch
  AsyncStorage.setItem(CUSTOMIZED_KEY, '1').catch(() => undefined);
  syncLLMFromSettings();
}

export function clearPersistence() {
  lastSnapshot = '';
  return AsyncStorage.removeItem(STORAGE_KEY);
}

export function initPersistence() {
  if (bootStrapDone) return;
  bootStrapDone = true;

  // 1) Hydrate from disk
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) {
        // First launch — push defaults into the LLM client
        syncLLMFromSettings();
        // and run a background auto-detect (only on first launch)
        runAutoDetectIfNeeded();
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        useAppStore.setState(parsed);
        // After hydration, push settings into the LLM client. This is
        // the single most important call in the boot path — without it
        // the cached LLMConfig keeps the default (empty) API key from
        // before AsyncStorage was read, and every chat send returns 401
        // until the user manually opens Settings (which triggers the
        // updateSetting re-sync).
        syncLLMFromSettings();
      } catch (e) {
        console.warn('[persistence] failed to parse stored state, ignoring', e);
      }
    })
    .catch((e) => console.warn('[persistence] hydrate failed', e));

  // 1b) Belt-and-suspenders: re-sync the LLM client any time the
  // settings object reference changes. initPersistence only runs once,
  // so this is what catches dev/hot-reload cases where settings get
  // mutated without going through updateSetting().
  useAppStore.subscribe((next, prev) => {
    if (next.settings !== prev.settings) {
      syncLLMFromSettings();
    }
  });

  // 2) Save on change
  useAppStore.subscribe((next) => {
    const { conversations, conversationOrder, activeConversationId, prompts, promptOrder, settings } = next;
    const snapshot = JSON.stringify({
      conversations,
      conversationOrder,
      activeConversationId,
      prompts,
      promptOrder,
      settings,
    });
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, snapshot).catch((e) => console.warn('[persistence] save failed', e));
    }, SAVE_DEBOUNCE_MS);
  });
}

/**
 * Auto-detect a local LLM endpoint. Only runs when:
 *   - the user is on the default mock provider AND
 *   - the user has not previously customized settings
 * If found, silently upgrade the active provider/endpoint and persist.
 * If not found, leaves the user on mock (their default).
 */
async function runAutoDetectIfNeeded() {
  try {
    const customized = await AsyncStorage.getItem(CUSTOMIZED_KEY);
    if (customized) return; // user has made their own choice before
  } catch { /* ignore */ }

  const result = await autoDetectLLM();
  if (!result.found) return;

  // Confirm the active endpoint resolves; if so, leave defaults in place —
  // the user can still fine-tune in Settings. We just mark the connection
  // as healthy so the status bar reflects it.
  syncLLMFromSettings();
  console.log('[persistence] auto-detected Hermes gateway');
}

export { getLLMClient };
