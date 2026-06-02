import { create } from 'zustand';
import { Conversation, Message, AppSettings, DEFAULT_SETTINGS, PromptTemplate } from '../types';

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
  clearMessages: (conversationId: string) => void;

  addPrompt: (p: Omit<PromptTemplate, 'id' | 'createdAt' | 'usageCount'>) => string;
  usePrompt: (id: string) => void;
  deletePrompt: (id: string) => void;
  togglePinPrompt: (id: string) => void;

  updateSettings: (patch: Partial<AppSettings>) => void;
  /** Live reachability of the configured LLM endpoint. null = probing. */
  gatewayReachable: boolean | null;
  /** Optional override used by the background probe. */
  setGatewayReachable: (ok: boolean | null) => void;
}

const now = () => Date.now();
const uid = () => `${now()}-${Math.random().toString(36).slice(2, 8)}`;

const seedConversationId = uid();
const seedConversation: Conversation = {
  id: seedConversationId,
  title: 'Welcome to Hermes Chat',
  createdAt: now(),
  updatedAt: now(),
  messages: [
    {
      id: uid(),
      role: 'system',
      status: 'done',
      createdAt: now() - 6000,
      content: `# Welcome to Hermes Chat ✦

A clean little chatbot client for talking to **Hermes** — built with Expo + React Native.

## What works in this build

- Flat kawaii aesthetic 🌸
- Mock streaming LLM responses
- Markdown rendering (headings / lists / code / tables / blockquote)
- Right-side prompt template navigator
- Voice + image attachments (mocked in web)
- Multiple conversations

## What doesn't yet

- Real Hermes backend (still mock)
- PDF / PPT in-line preview
- Real illustrations on every screen
`,
    },
  ],
};

const seedPrompts: PromptTemplate[] = [
  {
    id: uid(),
    title: 'Explain like I\'m 5',
    body: 'Explain the following concept as if I were 5 years old, with one concrete example:\n\n{{topic}}',
    category: 'Learning',
    pinned: true,
    usageCount: 0,
    createdAt: now(),
  },
  {
    id: uid(),
    title: 'Code review',
    body: 'Review this code for bugs, performance, and readability. Be specific — quote line numbers and propose exact edits:\n\n```\n{{code}}\n```',
    category: 'Coding',
    usageCount: 0,
    createdAt: now(),
  },
  {
    id: uid(),
    title: 'Summarize article',
    body: 'Summarize the following article in 5 bullet points and one closing one-sentence takeaway:\n\n{{article}}',
    category: 'Reading',
    usageCount: 0,
    createdAt: now(),
  },
  {
    id: uid(),
    title: 'Brainstorm names',
    body: 'Brainstorm 10 product name ideas for: {{product}}. Each should be 1-2 syllables, easy to spell, no trademark conflicts in tech.',
    category: 'Product',
    usageCount: 0,
    createdAt: now(),
  },
  {
    id: uid(),
    title: 'Translate CN→EN',
    body: 'Translate the following Chinese text into natural, idiomatic English (not literal):\n\n{{text}}',
    category: 'Language',
    usageCount: 0,
    createdAt: now(),
  },
];

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
    const id = uid();
    const conv: Conversation = {
      id,
      title: title ?? 'New conversation',
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

  addPrompt: (p) => {
    const id = uid();
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

  gatewayReachable: null as boolean | null,
  setGatewayReachable: (ok: boolean | null) => set({ gatewayReachable: ok }),
}));
