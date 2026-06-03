/**
 * Hermes gateway client — talks OpenAI Chat Completions streaming to a local
 * Hermes gateway (or any OpenAI-compatible endpoint the user points it at).
 *
 * Stream format: SSE (Server-Sent Events), each line `data: {...}`.
 *   - `data: [DONE]` ends the stream
 *   - The first non-empty content delta triggers handlers.onChunk
 *   - We accumulate locally and call onDone with the full text
 *
 * Why this is the "native" integration: Hermes's own gateway already speaks
 * OpenAI Chat Completions SSE, so we don't need a custom protocol. The same
 * client can also point at any OpenAI-compatible provider if Hermes isn't
 * available, with no code change.
 *
 * Agent-friendly: we forward `X-Hermes-Session-Id` (so the Hermes backend
 * can stitch turns into a persistent session via SessionDB) and
 * `X-Hermes-Session-Key` (so a long-term memory key can scope context).
 * Both headers are no-ops on a generic OpenAI-compatible server.
 */

import type { LLMClient, LLMStreamRequest, LLMStreamHandlers, Reachability } from './types';
import { REACHABLE, NO_AUTH, DOWN, TIMEOUT, NO_CONFIG } from './types';
import type { LLMConfig } from './config';

export interface HermesRequestContext {
  /** Maps to X-Hermes-Session-Id on the gateway. */
  sessionId?: string;
  /** Maps to X-Hermes-Session-Key on the gateway. */
  sessionKey?: string;
}

export class HermesGatewayClient implements LLMClient {
  readonly id = 'hermes-gateway' as const;
  readonly displayName = 'Hermes gateway';

  constructor(private config: LLMConfig) {}

  /**
   * Reachability check. We DO NOT treat 401 as reachable — that just
   * means the server is up but we lack a valid key. The status bar
   * must stay honest, otherwise a broken setup looks healthy until
   * the user actually tries to chat.
   */
  async isReachable(): Promise<Reachability> {
    const url = this.healthUrl();
    if (!url) return NO_CONFIG;
    if (!this.config.endpoint) return NO_CONFIG;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(2500),
      } as RequestInit);
      if (res.ok) return REACHABLE;
      if (res.status === 401 || res.status === 403) return NO_AUTH;
      if (res.status >= 500) return DOWN;
      // 404/400 = /v1/health not supported, but server is up
      return REACHABLE;
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return TIMEOUT;
      return DOWN;
    }
  }

  async streamChat(req: LLMStreamRequest, h: LLMStreamHandlers, ctx: HermesRequestContext = {}): Promise<void> {
    // The Hermes gateway currently hangs on `stream: true` POSTs to
    // /v1/chat/completions: aiohttp never flushes the first SSE chunk
    // until the model is fully done, which on web means the browser's
    // ReadableStream sits idle and the connection eventually times
    // out. /v1/chat/completions with `stream: false` returns in ~5-15s
    // and works reliably. To keep the streaming UX (the chat looks
    // alive while the model thinks), we issue the request as non-
    // streaming and *emit the response character-by-character on a
    // timer*. The user sees the same animation; the wire format is
    // simpler. Switch back to true streaming once the gateway
    // implements chunked flush.
    const body = {
      model: req.model ?? this.config.defaultModel,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      ...(req.maxTokens != null ? { max_tokens: req.maxTokens } : {}),
    };

    let res: Response;
    try {
      res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { ...this.headers({ accept: 'application/json' }), ...this.sessionHeaders(ctx) },
        body: JSON.stringify(body),
        signal: req.signal,
      } as RequestInit);
    } catch (e: any) {
      // Network failure — the most common case on mobile
      h.onError(new Error(`Network error reaching ${this.config.endpoint}: ${e?.message ?? e}`));
      return;
    }

    if (!res.ok || !res.body) {
      const text = await safeReadText(res);
      h.onError(new Error(`Upstream ${res.status}: ${text || res.statusText}`));
      return;
    }

    // Read the full body as JSON, then drip the content out chunked.
    let full = '';
    try {
      const json: any = await res.json();
      full = json?.choices?.[0]?.message?.content ?? '';
    } catch (e: any) {
      h.onError(new Error(`Failed to parse upstream response: ${e?.message ?? e}`));
      return;
    }
    if (req.signal?.aborted) return;

    // Emit roughly 30 chars every 16ms (≈ 60Hz) so the UI animates
    // like a real stream. Stop early on abort.
    const CHUNK = 30;
    const TICK_MS = 16;
    let i = 0;
    const tick = () => {
      if (req.signal?.aborted) return;
      if (i >= full.length) {
        h.onDone(full);
        return;
      }
      const next = full.slice(i, i + CHUNK);
      i += CHUNK;
      h.onChunk(next);
      setTimeout(tick, TICK_MS);
    };
    // Kick off on next microtask so the caller can settle state first.
    setTimeout(tick, 0);
  }

  /** Optional — best-effort model list. Many local gateways don't expose /v1/models. */
  async listModels(): Promise<{ id: string; label: string }[]> {
    try {
      const url = this.modelsUrl();
      if (!url) return [];
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(2500),
      } as RequestInit);
      if (!res.ok) return [];
      const json: any = await res.json();
      const arr: { id: string }[] = json?.data ?? json?.models ?? [];
      return arr.map((m) => ({ id: m.id, label: m.id }));
    } catch {
      return [];
    }
  }

  private modelsUrl(): string {
    // /v1/models is fine to advertise but is slow on the Hermes gateway
    // (it walks the registered model providers). For the reachability
    // probe we use /v1/health, which is a 0-cost handler.
    if (!this.config.endpoint) return '';
    const base = this.config.endpoint.replace(/\/chat\/completions\/?$/, '');
    return `${base}/models`;
  }

  private healthUrl(): string {
    if (!this.config.endpoint) return '';
    const base = this.config.endpoint.replace(/\/chat\/completions\/?$/, '');
    return `${base}/health`;
  }

  private headers(opts: { accept?: string } = {}): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: opts.accept ?? 'text/event-stream',
    };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  /** Hermes-specific session headers. Sent on every request when the
   *  conversation has a stable id so the gateway can stitch a thread. */
  private sessionHeaders(ctx: HermesRequestContext): Record<string, string> {
    const h: Record<string, string> = {};
    if (ctx.sessionId) h['X-Hermes-Session-Id'] = ctx.sessionId;
    if (ctx.sessionKey) h['X-Hermes-Session-Key'] = ctx.sessionKey;
    return h;
  }
}

async function safeReadText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ''; }
}
