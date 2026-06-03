import { create } from 'zustand';
import { Conversation, Message, AppSettings, PromptTemplate } from '../types';
import type { Reachability } from '../services/llm/types';
import { DEFAULT_SESSION_TITLE } from '../config/app-constants';
import { createSeedConversation } from '../domain/chat/defaults';
import { createConversationFromRemoteSession, mergeRemoteMessages } from '../domain/chat/remote-session';
import { createId, now } from '../domain/ids';
import { createSeedPrompts } from '../domain/prompts/defaults';
import { DEFAULT_SETTINGS } from '../domain/settings/defaults';

interface AppState {
  conversations: Record<string, Conversation>;
  conversationOrder: string[];
  activeConversationId: string | null;

  prompts: Record<string, PromptTemplate>;
  promptOrder: string[];

  settings: AppSettings;

  // selectors
  getActiveConversation: () => Conversation | null;
  getActiveMessages: () => Message[];

  // actions
  createConversation: (title?: string) => string;
  setActiveConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  appendMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, patch: Partial<Message>) => void;
  /** Drop a message and everything after it. Used by 'Edit & resend' to
   *  reset a turn from a chosen point. Returns the index of the kept
   *  boundary (length of the new array). */
  truncateMessagesAt: (conversationId: string, messageId: string) => number;
  /** Import a remote Hermes session as a local conversation (id is mirrored). */
  importRemoteSession: (sessionId: string, title: string, messages: unknown[]) => void;
  mergeRemoteMessages: (conversationId: string, messages: unknown[]) => number;
  clearMessages: (conversationId: string) => void;

  addPrompt: (p: Omit<PromptTemplate, 'id' | 'createdAt' | 'usageCount'>) => string;
  usePrompt: (id: string) => void;
  deletePrompt: (id: string) => void;
  togglePinPrompt: (id: string) => void;

  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Live reachability of the configured LLM endpoint. null = probing. */
  gatewayReachable: Reachability | null;
  /** Optional override used by the background probe. */
  setGatewayReachable: (r: Reachability | null) => void;
  /** Live snapshot of the Hermes backend — sessions, skills, toolsets, jobs. null = unknown. */
  hermesSnapshot: HermesSnapshot | null;
  setHermesSnapshot: (snap: HermesSnapshot | null) => void;
}

export interface HermesSnapshot {
  sessions: { id: string; title?: string; messageCount?: number; updatedAt?: number }[];
  skills:    { id: string; name: string; description?: string }[];
  toolsets:  { id: string; name: string; description?: string }[];
  jobs:      { id: string; title?: string; state?: string; nextRunAt?: number }[];
  updatedAt: number;
}

const seedConversation = createSeedConversation();
const seedConversationId = seedConversation.id;
const seedPrompts = createSeedPrompts();

export const useAppStore = create<AppState>((set, get) => ({
  conversations: { [seedConversationId]: seedConversation },
  conversationOrder: [seedConversationId],
  activeConversationId: seedConversationId,

  prompts: Object.fromEntries(seedPrompts.map((p) => [p.id, p])),
  promptOrder: seedPrompts.map((p) => p.id),

  settings: { ...DEFAULT_SETTINGS },

  getActiveConversation: () => {
    const { activeConversationId, conversations } = get();
    return activeConversationId ? conversations[activeConversationId] ?? null : null;
  },

  getActiveMessages: () => {
    const c = get().getActiveConversation();
    return c ? c.messages : [];
  },

  createConversation: (title) => {
    const id = createId();
    const conv: Conversation = {
      id,
      title: title ?? DEFAULT_SESSION_TITLE,
      createdAt: now(),
      updatedAt: now(),
      messages: [],
    };
    set((s) => ({
      conversations: { ...s.conversations, [id]: conv },
      conversationOrder: [id, ...s.conversationOrder],
      activeConversationId: id,
    }));
    return id;
  },

  /**
   * Import a remote Hermes session as a local conversation. The local
   * conversation id is set to the Hermes sessionId so the next time
   * the user sends a message, the gateway sees the same id and
   * stitches the turn into the existing session (instead of starting
   * a new one).
   */
  importRemoteSession: (sessionId, title, messages) => {
    const conv = createConversationFromRemoteSession(sessionId, title, messages);
    set((s) => {
      // If a local conversation with this id already exists, merge.
      const existing = s.conversations[sessionId];
      if (existing) {
        return {
          conversations: {
            ...s.conversations,
            [sessionId]: {
              ...existing,
              ...conv,
              messages: mergeRemoteMessages(existing.messages, messages).messages,
              id: sessionId,
            },
          },
          conversationOrder: s.conversationOrder.includes(sessionId) ? s.conversationOrder : [sessionId, ...s.conversationOrder],
          activeConversationId: sessionId,
        };
      }
      return {
        conversations: { ...s.conversations, [sessionId]: conv },
        conversationOrder: [sessionId, ...s.conversationOrder],
        activeConversationId: sessionId,
      };
    });
  },

  mergeRemoteMessages: (conversationId, messages) => {
    let added = 0;
    set((s) => {
      const c = s.conversations[conversationId];
      if (!c) return {};
      const merged = mergeRemoteMessages(c.messages, messages);
      added = merged.added;
      if (added === 0) return {};
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: { ...c, messages: merged.messages, updatedAt: now() },
        },
      };
    });
    return added;
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  deleteConversation: (id) =>
    set((s) => {
      const { [id]: _gone, ...rest } = s.conversations;
      const order = s.conversationOrder.filter((x) => x !== id);
      const active = s.activeConversationId === id ? order[0] ?? null : s.activeConversationId;
      return { conversations: rest, conversationOrder: order, activeConversationId: active };
    }),

  renameConversation: (id, title) =>
    set((s) => {
      const c = s.conversations[id];
      if (!c) return {};
      return { conversations: { ...s.conversations, [id]: { ...c, title, updatedAt: now() } } };
    }),

  appendMessage: (conversationId, message) =>
    set((s) => {
      const c = s.conversations[conversationId];
      if (!c) return {};
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: { ...c, messages: [...c.messages, message], updatedAt: now() },
        },
      };
    }),

  updateMessage: (conversationId, messageId, patch) =>
    set((s) => {
      const c = s.conversations[conversationId];
      if (!c) return {};
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: {
            ...c,
            messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
            updatedAt: now(),
          },
        },
      };
    }),

  clearMessages: (conversationId) =>
    set((s) => {
      const c = s.conversations[conversationId];
      if (!c) return {};
      return { conversations: { ...s.conversations, [conversationId]: { ...c, messages: [], updatedAt: now() } } };
    }),

  truncateMessagesAt: (conversationId, messageId) => {
    let kept = 0;
    set((s) => {
      const c = s.conversations[conversationId];
      if (!c) return {};
      const idx = c.messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return {};
      // Keep the message at idx (so we can patch its content) and drop
      // everything after. This preserves sync ordering and lets the
      // caller rewrite this message and re-send a fresh assistant turn.
      kept = idx + 1;
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: { ...c, messages: c.messages.slice(0, kept), updatedAt: now() },
        },
      };
    });
    return kept;
  },

  addPrompt: (p) => {
    const id = createId();
    const prompt: PromptTemplate = { id, createdAt: now(), usageCount: 0, ...p };
    set((s) => ({
      prompts: { ...s.prompts, [id]: prompt },
      promptOrder: [id, ...s.promptOrder],
    }));
    return id;
  },

  usePrompt: (id) =>
    set((s) => {
      const p = s.prompts[id];
      if (!p) return {};
      return {
        prompts: {
          ...s.prompts,
          [id]: { ...p, usageCount: p.usageCount + 1, lastUsedAt: now() },
        },
        promptOrder: [id, ...s.promptOrder.filter((x) => x !== id)],
      };
    }),

  deletePrompt: (id) =>
    set((s) => {
      const { [id]: _gone, ...rest } = s.prompts;
      return { prompts: rest, promptOrder: s.promptOrder.filter((x) => x !== id) };
    }),

  togglePinPrompt: (id) =>
    set((s) => {
      const p = s.prompts[id];
      if (!p) return {};
      return { prompts: { ...s.prompts, [id]: { ...p, pinned: !p.pinned } } };
    }),

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  gatewayReachable: null as Reachability | null,
  setGatewayReachable: (r: Reachability | null) => set({ gatewayReachable: r }),

  hermesSnapshot: null as HermesSnapshot | null,
  setHermesSnapshot: (snap: HermesSnapshot | null) => set({ hermesSnapshot: snap }),
}));
