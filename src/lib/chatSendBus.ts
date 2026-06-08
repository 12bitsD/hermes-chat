/**
 * chatSendBus — tiny pub/sub that lets the `window.hermes.*` API ask
 * the mounted chat controller to send a message, without holding a
 * direct reference to a React hook (which can't cross the globalThis
 * boundary cleanly).
 *
 * Wire-up:
 *  - useChatController subscribes once on mount with its `send` fn.
 *  - hermesApi.chat.send dispatches `{ text, opts }` to all subscribers.
 *  - If no controller is mounted yet (race during boot), the dispatch
 *    is dropped with a soft `ok: false, reason: 'no-controller'`. The
 *    caller is expected to retry, or surface a friendly error.
 *
 * Backward compat: the existing `hermes:insert-prompt` CustomEvent is
 * still emitted on the window so any pre-existing listeners keep
 * working. `hermes.chat.send` is the new primary path.
 */

export interface ChatSendRequest {
  text: string;
  opts?: {
    conversationId?: string;
    silent?: boolean;
    appendUserMessage?: boolean;
    userMessageId?: string;
    assistantMessageId?: string;
    files?: unknown[];
  };
}

export interface ChatSendResult {
  ok: boolean;
  reason?: string;
  runId?: string;
}

type Subscriber = (req: ChatSendRequest) => Promise<ChatSendResult>;

let subscribers: Subscriber[] = [];

export function subscribeChatSend(fn: Subscriber): () => void {
  subscribers.push(fn);
  return () => {
    subscribers = subscribers.filter((s) => s !== fn);
  };
}

export async function dispatchChatSend(req: ChatSendRequest): Promise<ChatSendResult> {
  if (subscribers.length === 0) {
    return { ok: false, reason: 'no-controller-mounted' };
  }
  // Dispatch to the first subscriber (in practice there's only one
  // active controller at a time — the conversation is mounted in
  // ChatView). We use Promise.all so any future multi-mount case
  // works, but in practice only the first result matters.
  const results = await Promise.all(subscribers.map((s) => Promise.resolve(s(req))));
  const first = results[0];
  return first ?? { ok: false, reason: 'no-result' };
}

/** Fire the legacy CustomEvent so any pre-existing listeners still work. */
export function emitLegacyInsertPrompt(text: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('hermes:insert-prompt', { detail: text }));
}
