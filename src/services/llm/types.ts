/**
 * LLM client interface: the UI talks to Hermes through this port, while
 * HermesGatewayClient owns the wire protocol and gateway headers.
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

/**
 * Reachability verdict.
 *
 * `ok` is true only when the gateway actually accepted our credentials
 * (HTTP 2xx). 401/403 means the server is up but our key is wrong or
 * missing — that's not "reachable", that's "talking to a wall".
 *
 * `status` carries the more granular state so the UI can show a
 * specific message ("✕ auth failed — paste API_SERVER_KEY" vs.
 * "✕ server down — is the gateway running on 8642?").
 */
export type Reachability = {
  ok: boolean;
  status: 'ok' | 'no-auth' | 'down' | 'timeout' | 'config-missing';
  message: string;
};

export const REACHABLE: Reachability = { ok: true,  status: 'ok',         message: 'Reachable' };
export const NO_AUTH:    Reachability = { ok: false, status: 'no-auth',    message: 'Auth failed (401) — check API key' };
export const DOWN:       Reachability = { ok: false, status: 'down',       message: 'Server not responding' };
export const TIMEOUT:    Reachability = { ok: false, status: 'timeout',    message: 'Probe timed out' };
export const NO_CONFIG:  Reachability = { ok: false, status: 'config-missing', message: 'No endpoint configured' };

export interface LLMClient {
  /** Provider id used in the settings UI / logs */
  readonly id: 'hermes-gateway';
  /** Human-readable provider name */
  readonly displayName: string;
  /** Cheap, non-streaming ping used at boot to decide which provider to use.
   *  Returns a Reachability so the UI can distinguish auth-failed from down. */
  isReachable(): Promise<Reachability>;
  /** Start a streaming chat completion. Returns once the stream ends or errors. */
  streamChat(req: LLMStreamRequest, handlers: LLMStreamHandlers, ctx?: LLMStreamContext): Promise<void>;
  /** Optional — list available models for the model-picker UI */
  listModels?(): Promise<{ id: string; label: string }[]>;
}
