/**
 * Persist zustand store to AsyncStorage. Schema is JSON, debounced 400ms
 * so a flurry of streaming-message updates doesn't thrash the disk.
 *
 * Hermes is the only backend. On boot we hydrate settings, then sync the
 * gateway client before the first message can be sent.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from './app';
import { configureLLM, getLLMClient } from '../services/llm';
import { PERSISTENCE_SAVE_DEBOUNCE_MS, STORAGE_KEY } from '../config/app-constants';
import { buildLLMConfig } from '../services/llm/factory';

const SAVE_DEBOUNCE_MS = PERSISTENCE_SAVE_DEBOUNCE_MS;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: string = '';
let bootStrapDone = false;

/** Pull the latest settings out of the store and reconfigure the LLM client. */
export function syncLLMFromSettings() {
  const s = useAppStore.getState().settings;
  configureLLM(buildLLMConfig(s));
  // Expose a manual trigger for debugging: in dev, the web console can
  // call `window.__hermes_resync?.()` after editing settings/storage.
  if (typeof window !== 'undefined') (window as any).__hermes_resync = syncLLMFromSettings;
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
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        useAppStore.setState(parsed);
        // After hydration, push settings into the LLM client. This is
        // the single most important call in the boot path — without it
        // the cached LLMConfig keeps the default (empty) API key from
        // before AsyncStorage was read, and every chat send returns 401
        // until the user manually opens Settings.
        syncLLMFromSettings();
      } catch (e) {
        console.warn('[persistence] failed to parse stored state, ignoring', e);
      }
    })
    .catch((e) => console.warn('[persistence] hydrate failed', e));

  // 1b) Belt-and-suspenders: re-sync the LLM client any time the
  // settings object reference changes. initPersistence only runs once,
  // so this is what catches dev/hot-reload cases where settings get
  // mutated without going through the Settings panel.
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

export { getLLMClient };
