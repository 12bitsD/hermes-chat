/**
 * LLM client interface — the seam between the UI and whatever backend is
 * behind it (mock today, real Hermes tomorrow).
 *
 * Two implementations live side-by-side:
 *   - MockLLMClient: char-by-char fake streaming, useful for offline dev
 *   - HermesGatewayClient: real OpenAI-compatible streaming against the
 *     local Hermes gateway (see ../config.ts for endpoint resolution)
 *
 * The UI never imports an implementation directly; it always goes through
 * `getLLMClient()` which is configured at app boot from settings.
 */

import type { Role } from '../../types';

export interface ChatMessageInput {
  role: Role;
  /** Plain text or simple markdown — no attachments in v1, those are inlined as part of the prompt */
  content: string;
}

export interface LLMStreamRequest {
  conversationId: string;
  messages: ChatMessageInput[];
  /** Model id, e.g. "default", "fast", "smart". Resolved against the gateway. */
  model?: string;
  /** Abort signal — UI can cancel mid-stream */
  signal?: AbortSignal;
  /** Max tokens; undefined = server default */
  maxTokens?: number;
  /** Sampling temperature, 0-1 */
  temperature?: number;
}

export interface LLMStreamHandlers {
  /** Called for each text chunk as it streams in */
  onChunk: (text: string) => void;
  /** Called when the full response has been received */
  onDone: (fullText: string) => void;
  /** Called on any error — including network, abort, or upstream failure */
  onError: (err: Error) => void;
}

export interface LLMStreamContext {
  /** Optional Hermes-specific context. Other clients ignore this. */
  sessionId?: string;
  sessionKey?: string;
}

export interface LLMClient {
  /** Provider id used in the settings UI / logs */
  readonly id: 'mock' | 'hermes-gateway' | 'openai-compatible';
  /** Human-readable provider name */
  readonly displayName: string;
  /** Cheap, non-streaming ping used at boot to decide which provider to use */
  isReachable(): Promise<boolean>;
  /** Start a streaming chat completion. Returns once the stream ends or errors. */
  streamChat(req: LLMStreamRequest, handlers: LLMStreamHandlers, ctx?: LLMStreamContext): Promise<void>;
  /** Optional — list available models for the model-picker UI */
  listModels?(): Promise<{ id: string; label: string }[]>;
}
