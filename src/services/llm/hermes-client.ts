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

import type { LLMClient, LLMStreamRequest, LLMStreamHandlers } from './types';
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

  /** Quick reachability check — short GET to /v1/models. Treats any HTTP response as "reachable". */
  async isReachable(): Promise<boolean> {
    try {
      const url = this.modelsUrl();
      if (!url) return false;
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers(),
        // Short timeout via AbortSignal — RN fetch doesn't honor `timeout` option on all platforms
        signal: AbortSignal.timeout(2500),
      } as RequestInit);
      return res.ok || res.status < 500; // 401/403 means it's up, we just lack auth
    } catch {
      return false;
    }
  }

  async streamChat(req: LLMStreamRequest, h: LLMStreamHandlers, ctx: HermesRequestContext = {}): Promise<void> {
    const body = {
      model: req.model ?? this.config.defaultModel,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      ...(req.maxTokens != null ? { max_tokens: req.maxTokens } : {}),
    };

    let res: Response;
    try {
      res = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: { ...this.headers(), ...this.sessionHeaders(ctx) },
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

    let acc = '';
    try {
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder('utf-8');
      let sseBuf = '';
      while (true) {
        if (req.signal?.aborted) {
          try { await reader.cancel(); } catch { /* ignore */ }
          return;
        }
        const { value, done } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = sseBuf.indexOf('\n')) >= 0) {
          const line = sseBuf.slice(0, nl).trim();
          sseBuf = sseBuf.slice(nl + 1);
          if (!line) continue;
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            h.onDone(acc);
            return;
          }
          try {
            const json = JSON.parse(data);
            const delta: string | undefined = json?.choices?.[0]?.delta?.content;
            if (delta) {
              acc += delta;
              h.onChunk(delta);
            }
          } catch {
            // Some providers prepend keepalives or comments — ignore parse errors
          }
        }
      }
      h.onDone(acc);
    } catch (e: any) {
      if (req.signal?.aborted) return; // cancel, don't surface
      h.onError(new Error(`Stream read failed: ${e?.message ?? e}`));
    }
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
    // Strip trailing /chat/completions and append /models. If endpoint is weird, fall back.
    if (!this.config.endpoint) return '';
    const base = this.config.endpoint.replace(/\/chat\/completions\/?$/, '');
    return `${base}/models`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
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
