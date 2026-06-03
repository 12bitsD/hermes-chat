/**
 * hermesApi — the public `window.hermes.*` command bus.
 *
 * This is the in-page CLI surface for hermes-chat. Once injected
 * (see `installHermesCli` in App.tsx), any code that can reach the
 * page's globalThis — devtools, Tampermonkey, sibling iframes with
 * same-origin trust, even other agents via WebSocket bridge — can:
 *
 *   await hermes.chat.send('summarize the last 3 messages')
 *   await hermes.chat.list()
 *   const unsub = hermes.chat.subscribe(e => console.log(e))
 *   await hermes.config.get('llmEndpoint')
 *   await hermes.system.screenshot()
 *
 * All methods return `Promise<{ok, ...}>`. The API never throws on
 * expected user errors — it returns a structured failure with a
 * `reason` code. Real bugs (programmer error) still throw.
 *
 * Type safety: `declare global { interface Window { hermes: HermesApi } }`
 * is exposed at the bottom of this file.
 *
 * Lifecycle: the api is created once at app boot. It re-reads the
 * zustand store lazily (so post-hydration changes are visible). It
 * uses `dispatchChatSend` to ask the mounted chat controller to
 * actually drive a send (since the controller owns the AbortController
 * + run state machine).
 */

import { useAppStore } from '../store/app';
import type { AppSettings, Conversation, Message } from '../types';
import { dispatchChatSend, emitLegacyInsertPrompt } from './chatSendBus';
import { publishCli, subscribeCli } from './hermesCliBus';

// ─── Public types ─────────────────────────────────────────────────────────

export const HERMES_CLI_VERSION = '0.1.0';

export type ChatEvent =
  | { type: 'message:added';     message: Message;     conversationId: string }
  | { type: 'message:updated';   conversationId: string; messageId: string; patch: Partial<Message> }
  | { type: 'conversation:created'; conversationId: string }
  | { type: 'conversation:activated'; conversationId: string }
  | { type: 'run:started';       conversationId: string; runId: string }
  | { type: 'run:completed';     conversationId: string; runId: string; content: string }
  | { type: 'run:failed';        conversationId: string; runId: string; error: string }
  | { type: 'tool:started';      runId: string; tool: string; preview?: string }
  | { type: 'tool:completed';    runId: string; tool: string; durationMs: number; ok: boolean }
  | { type: 'approval:required'; runId: string; approvalId: string; tool: string; prompt: string };

export type HermesCliEvent = ChatEvent;

export interface ChatListItem {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  pinned?: boolean;
}

export interface SendResult {
  ok: true;
  runId: string;
  status: 'started' | 'streaming' | 'done';
}

export interface SendFailure {
  ok: false;
  reason: string;
  message?: string;
}

export interface ChatSendOptions {
  conversationId?: string;
  silent?: boolean;
}

export interface ToolListItem {
  name: string;
  description?: string;
}

export interface ToolInvokeResult {
  ok: true;
  result: unknown;
}

export interface ToolInvokeFailure {
  ok: false;
  reason: string;
  needsApproval?: boolean;
  message?: string;
}

export interface SystemNotifyResult {
  ok: boolean;
  reason?: string;
}

export interface SystemScreenshotResult {
  ok: true;
  dataUrl: string;
}

export interface SystemScreenshotFailure {
  ok: false;
  reason: string;
}

export interface SystemHapticResult {
  ok: boolean;
}

export interface ClipboardReadResult {
  ok: true;
  text: string;
}

export interface ClipboardWriteResult {
  ok: boolean;
}

export interface ConfigGetAll {
  ok: true;
  settings: AppSettings;
}

export interface ConfigSetResult {
  ok: boolean;
}

// ─── The API shape ────────────────────────────────────────────────────────

export interface HermesApi {
  readonly version: string;
  help(): void;

  chat: {
    send(text: string, opts?: ChatSendOptions): Promise<SendResult | SendFailure>;
    list(): Promise<ChatListItem[]>;
    get(id: string): Promise<{ id: string; title: string; messages: Message[] } | null>;
    create(title?: string): Promise<{ id: string; ok: true } | { ok: false; reason: string }>;
    activate(id: string): Promise<{ ok: boolean; reason?: string }>;
    subscribe(cb: (event: HermesCliEvent) => void): () => void;
  };

  tools: {
    list(): Promise<ToolListItem[]>;
    /** Direct tool invoke. For most tools this routes through the
     *  normal chat pipeline (so approval flow + tool events work).
     *  For high-risk tools (shell, write_file, ...) the user must
     *  approve via the standard ApprovalModal. */
    invoke(name: string, args?: unknown): Promise<ToolInvokeResult | ToolInvokeFailure>;
  };

  system: {
    notify(msg: string, opts?: { title?: string; preview?: string }): Promise<SystemNotifyResult>;
    haptic(severity: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'): Promise<SystemHapticResult>;
    screenshot(): Promise<SystemScreenshotResult | SystemScreenshotFailure>;
    clipboard: {
      read(): Promise<ClipboardReadResult | { ok: false; reason: string }>;
      write(text: string): Promise<ClipboardWriteResult>;
    };
  };

  config: {
    get(): Promise<ConfigGetAll>;
    get<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]>;
    set(patch: Partial<AppSettings>): Promise<ConfigSetResult>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function summarizeConv(c: Conversation): ChatListItem {
  return {
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
    pinned: c.pinned,
  };
}

function readStore() {
  return useAppStore.getState();
}

async function tryClipboardRead(): Promise<ClipboardReadResult | { ok: false; reason: string }> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
    return { ok: false, reason: 'clipboard-api-unavailable' };
  }
  try {
    const text = await navigator.clipboard.readText();
    return { ok: true, text };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? 'denied' };
  }
}

async function tryClipboardWrite(text: string): Promise<ClipboardWriteResult> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return { ok: false };
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// Lazy import to avoid bundling react-native internals on the web.
async function callHaptic(severity: Parameters<HermesApi['system']['haptic']>[0]) {
  try {
    const { haptic } = await import('../utils/haptic');
    haptic(severity as any);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function callSystemNotify(msg: string, opts: { title?: string; preview?: string } = {}) {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-window' };
  // 1) Tab title flash + Web Notification
  try {
    const { incomingNotify } = await import('../utils/incomingNotify');
    incomingNotify({ conversationTitle: opts.title ?? 'Hermes', preview: opts.preview ?? msg });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? 'notify-failed' };
  }
}

async function callScreenshot(): Promise<SystemScreenshotResult | SystemScreenshotFailure> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { ok: false, reason: 'no-document' };
  }
  // Use html2canvas if available, else fall back to a minimal
  // SVG-to-data-URL of the current root.
  try {
    // @ts-ignore — html2canvas is an optional dep; not yet added.
    const mod = await import(/* webpackIgnore: true */ 'html2canvas').catch(() => null);
    if (mod) {
      const canvas: HTMLCanvasElement = await mod.default(document.body);
      return { ok: true, dataUrl: canvas.toDataURL('image/png') };
    }
  } catch {
    // fall through
  }
  // Lightweight fallback: snapshot the visible text content as a
  // text data URL. Not a real screenshot, but discoverable.
  try {
    const text = (document.body?.innerText ?? '').slice(0, 2000);
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    return { ok: true, dataUrl };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? 'screenshot-failed' };
  }
}

// ─── The factory ──────────────────────────────────────────────────────────

export interface HermesApiDeps {
  // No required deps yet — all methods are self-contained via
  // useAppStore / chatSendBus / cliBus. We keep the `deps` arg for
  // future dependency injection (mock in tests, alternative store
  // in Web Worker, etc.).
  getSettings?: () => AppSettings;
}

export function createHermesApi(_deps: HermesApiDeps = {}): HermesApi {
  // Internal event bus: re-emit ChatEvents from zustand subscriptions.
  // We wire this once and never tear it down (the api lives for the
  // page's lifetime).
  let lastMessagesRef: Record<string, Message[]> = {};

  // Subscribe to zustand to publish conversation/message lifecycle events.
  // Doing this in the api means callers don't have to wire it themselves.
  if (typeof window !== 'undefined') {
    // Initial seed
    const init = readStore();
    for (const c of Object.values(init.conversations)) {
      lastMessagesRef[c.id] = c.messages;
    }

    useAppStore.subscribe((next, prev) => {
      // conversation:activated
      if (next.activeConversationId !== prev.activeConversationId) {
        publishCli({ type: 'conversation:activated', conversationId: next.activeConversationId ?? '' });
      }
      // conversation:created
      const newConvIds = Object.keys(next.conversations).filter((id) => !prev.conversations[id]);
      for (const id of newConvIds) {
        publishCli({ type: 'conversation:created', conversationId: id });
      }
      // message:added / message:updated — diff each conversation
      for (const c of Object.values(next.conversations)) {
        const prevMsgs = lastMessagesRef[c.id] ?? [];
        const nextMsgs = c.messages;
        // Detect added
        if (nextMsgs.length > prevMsgs.length) {
          const added = nextMsgs.slice(prevMsgs.length);
          for (const m of added) {
            publishCli({ type: 'message:added', message: m, conversationId: c.id });
          }
        }
        // Detect updated — same id, different ref
        for (const m of nextMsgs) {
          const pm = prevMsgs.find((x) => x.id === m.id);
          if (pm && pm !== m) {
            publishCli({
              type: 'message:updated',
              conversationId: c.id,
              messageId: m.id,
              patch: m,
            });
          }
        }
        lastMessagesRef[c.id] = nextMsgs;
      }
    });
  }

  const api: HermesApi = {
    version: HERMES_CLI_VERSION,

    help() {
      const rows: [string, string][] = [
        ['hermes.version',                'string — CLI api version'],
        ['hermes.help()',                 'print this table'],
        ['hermes.chat.send(text, opts?)', 'inject + send a message in the active conv'],
        ['hermes.chat.list()',            'list conversations (id, title, updatedAt, pinned)'],
        ['hermes.chat.get(id)',           'fetch one conversation + its messages'],
        ['hermes.chat.create(title?)',    'create a new conversation'],
        ['hermes.chat.activate(id)',      'switch the active conversation'],
        ['hermes.chat.subscribe(cb)',     'watch events — returns unsubscribe fn'],
        ['hermes.tools.list()',           'list available tools (from gateway snapshot)'],
        ['hermes.tools.invoke(name,args?)','run a tool via the normal chat pipeline'],
        ['hermes.system.notify(msg,opts?)','raise a tab-title flash + Web Notification'],
        ['hermes.system.haptic(severity)', 'fire a haptic (light/medium/...)'],
        ['hermes.system.screenshot()',    'capture the current view (data URL)'],
        ['hermes.system.clipboard.read()','read clipboard text'],
        ['hermes.system.clipboard.write(s)','write text to clipboard'],
        ['hermes.config.get()',           'read all settings'],
        ['hermes.config.get(key)',        'read one setting by key'],
        ['hermes.config.set(patch)',      'update settings (object merge)'],
      ];
      // Print as a markdown-ish table for the devtools console.
      // eslint-disable-next-line no-console
      console.log(
        '%c✨ hermes-cli v' + HERMES_CLI_VERSION + ' — try these methods:',
        'color:#FF6FA8;font-weight:600',
      );
      for (const [sig, doc] of rows) {
        // eslint-disable-next-line no-console
        console.log('  ' + sig.padEnd(38) + '  ' + doc);
      }
    },

    chat: {
      async send(text, opts) {
        const trimmed = (text ?? '').trim();
        if (!trimmed) return { ok: false, reason: 'empty-text' };
        // Bridge to the legacy CustomEvent so any pre-existing listener
        // (PromptNavigator insert, etc.) still sees the prompt.
        emitLegacyInsertPrompt(trimmed);
        // Hand off to the mounted controller. If no controller is
        // mounted yet (race during boot), the bus returns
        // `no-controller-mounted` and we surface that.
        const result = await dispatchChatSend({ text: trimmed, opts });
        if (!result.ok) {
          return { ok: false, reason: result.reason ?? 'unknown' };
        }
        // We don't have a real runId here (the bus result is a
        // pass-through; the controller will publish run:started via
        // the cliBus once it actually starts). Return a synthetic id
        // derived from the conversation + timestamp.
        const state = readStore();
        return {
          ok: true,
          runId: `${state.activeConversationId ?? 'c'}-${Date.now()}`,
          status: 'started',
        };
      },

      async list() {
        const state = readStore();
        return Object.values(state.conversations)
          .map(summarizeConv)
          .sort((a, b) => {
            // pinned first
            const ap = a.pinned ? 1 : 0;
            const bp = b.pinned ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return b.updatedAt - a.updatedAt;
          });
      },

      async get(id) {
        const state = readStore();
        const c = state.conversations[id];
        if (!c) return null;
        return { id: c.id, title: c.title, messages: c.messages };
      },

      async create(title) {
        try {
          const id = readStore().createConversation(title);
          return { id, ok: true };
        } catch (err: any) {
          return { ok: false, reason: err?.message ?? 'create-failed' };
        }
      },

      async activate(id) {
        const state = readStore();
        if (!state.conversations[id]) {
          return { ok: false, reason: 'not-found' };
        }
        state.setActiveConversation?.(id);
        return { ok: true };
      },

      subscribe(cb) {
        return subscribeCli(cb);
      },
    },

    tools: {
      async list() {
        const state = readStore();
        const snap = state.hermesSnapshot;
        if (!snap) return [];
        return (snap.toolsets ?? []).map((t) => ({
          name: t.name,
          description: t.description,
        }));
      },

      async invoke(name, args) {
        // Direct tool invocation isn't a first-class Hermes gateway
        // operation. The right path is to send a chat message that
        // asks the agent to run the tool. For most tools this still
        // surfaces the approval flow correctly.
        const state = readStore();
        if (!state.activeConversationId) {
          return { ok: false, reason: 'no-active-conversation' };
        }
        const argsJson = args == null ? '' : JSON.stringify(args);
        const prompt = `Run tool \`${name}\` with args: \n\`\`\`json\n${argsJson}\n\`\`\``;
        const r = await dispatchChatSend({ text: prompt });
        if (!r.ok) return { ok: false, reason: r.reason ?? 'dispatch-failed' };
        return { ok: true, result: { dispatched: true, prompt } };
      },
    },

    system: {
      notify: (msg, opts) => callSystemNotify(msg, opts),
      haptic: (severity) => callHaptic(severity),
      screenshot: () => callScreenshot(),
      clipboard: {
        read: () => tryClipboardRead(),
        write: (text) => tryClipboardWrite(text),
      },
    },

    config: {
      async get(): Promise<ConfigGetAll> {
        return { ok: true, settings: readStore().settings };
      },
      async set(patch) {
        try {
          readStore().updateSettings(patch);
          return { ok: true };
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.warn('[hermes-cli] config.set failed', err);
          return { ok: false };
        }
      },
    },
    };

    // Attach a typed `config.get(key)` overload. We do this after the
    // object is built so the function overloads don't conflict with the
    // parameterless `get` already declared in the object literal above.
    const configGet = api.config.get.bind(api.config);
    (api.config as any).get = (key?: keyof AppSettings) => {
      if (key === undefined) return configGet();
      return Promise.resolve(readStore().settings[key]);
    };

  return api;
}

// ─── Install helpers ──────────────────────────────────────────────────────

/**
 * Install the Hermes CLI on the globalThis. Two names are written:
 *   - globalThis.hermes  (the user-friendly alias)
 *   - globalThis.__hermes_chat_app__  (canonical, no collision risk)
 *
 * Idempotent: calling twice replaces the previous instance and
 * returns the new one. Use the return value in tests.
 */
export function installHermesCli(deps: HermesApiDeps = {}): HermesApi {
  const api = createHermesApi(deps);
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).hermes = api;
    (globalThis as any).__hermes_chat_app__ = api;
  }
  return api;
}

// ─── Global types ─────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var hermes: HermesApi | undefined;
  // eslint-disable-next-line no-var
  var __hermes_chat_app__: HermesApi | undefined;
}
