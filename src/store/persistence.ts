import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from './app';
import { configureLLM, getLLMClient } from '../services/llm';
import { defaultEndpoint } from '../services/llm/config';

const STORAGE_KEY = 'hermes-chat:state:v1';
const SAVE_DEBOUNCE_MS = 400;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: string = '';
let bootStrapDone = false;

/**
 * Persist zustand store to AsyncStorage. Schema is JSON, debounced 400ms
 * so a flurry of streaming-message updates doesn't thrash the disk.
 *
 * Also reconciles the LLM client with the persisted provider/endpoint so the
 * very first message after launch goes to the right backend.
 */
export function initPersistence() {
  if (bootStrapDone) return;
  bootStrapDone = true;

  // 1) Hydrate from disk
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) {
        // First launch — just push defaults into the LLM client
        syncLLMFromSettings();
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        useAppStore.setState(parsed);
        // After hydration, push settings into the LLM client
        syncLLMFromSettings();
      } catch (e) {
        console.warn('[persistence] failed to parse stored state, ignoring', e);
      }
    })
    .catch((e) => console.warn('[persistence] hydrate failed', e));

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

/** Pull the latest settings out of the store and reconfigure the LLM client. */
export function syncLLMFromSettings() {
  const s = useAppStore.getState().settings;
  configureLLM({
    provider: s.llmProvider,
    endpoint: s.llmEndpoint || defaultEndpoint(),
    apiKey: s.llmApiKey || undefined,
    defaultModel: s.llmModel || 'default',
  });
}

/** Touch a setting — re-syncs the LLM client so changes take effect immediately. */
export function updateSetting<K extends keyof ReturnType<typeof useAppStore.getState>['settings']>(
  key: K,
  value: ReturnType<typeof useAppStore.getState>['settings'][K],
) {
  useAppStore.getState().updateSettings({ [key]: value } as any);
  syncLLMFromSettings();
}

export function clearPersistence() {
  lastSnapshot = '';
  return AsyncStorage.removeItem(STORAGE_KEY);
}

export { getLLMClient };
