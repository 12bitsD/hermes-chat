/**
 * Compatibility shim. Old code imported `streamMockReply`, `makeUserMessage`,
 * `makeAssistantMessage` directly. After the LLM client refactor those helpers
 * live behind a generic interface — but we keep these exports alive for the
 * few callers that still use them.
 *
 * New code should call `getLLMClient().streamChat(...)` directly.
 */

import type { Message } from '../types';

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Backwards-compatible mock streamer that uses the new LLMClient interface. */
export async function* streamMockReply(userText: string, signal?: AbortSignal): AsyncGenerator<string, void, void> {
  // Lazy import to avoid pulling the LLM registry into a tight loop
  const { getLLMClient } = await import('./llm');
  const queue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  let error: Error | null = null;

  getLLMClient().streamChat(
    {
      conversationId: 'mock',
      messages: [{ role: 'user', content: userText }],
      signal,
    },
    {
      onChunk: (chunk) => {
        queue.push(chunk);
        resolveNext?.();
      },
      onDone: () => {
        done = true;
        resolveNext?.();
      },
      onError: (e) => {
        error = e;
        done = true;
        resolveNext?.();
      },
    },
  );

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (error) throw error;
    if (done) return;
    await new Promise<void>((r) => { resolveNext = r; });
  }
}

export function makeUserMessage(content: string): Message {
  return { id: uid(), role: 'user', status: 'done', content, createdAt: Date.now() };
}

export function makeAssistantMessage(content = ''): Message {
  return { id: uid(), role: 'assistant', status: 'streaming', content, createdAt: Date.now() };
}
