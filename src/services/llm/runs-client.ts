/**
 * Hermes /v1/runs client — agent-friendly asynchronous protocol.
 *
 * Unlike the OpenAI Chat Completions client (which is one big streaming
 * response), `/v1/runs` is a structured lifecycle protocol:
 *
 *   1. POST /v1/runs → returns 202 with { run_id, status: "queued" }
 *   2. GET  /v1/runs/{run_id}/events → SSE stream of structured events:
 *        - "message.delta"      { delta: "..." }
 *        - "tool.started"       { tool: "...", preview: "..." }
 *        - "tool.completed"     { tool: "...", duration: 0.4, error: false }
 *        - "reasoning.available" { text: "..." }
 *        - "approval.required"  { approval_id, prompt, tool, args }
 *        - "completed"          { final_response: "..." }
 *        - "failed"             { error: { message } }
 *        - "stopped"            { reason: "user-requested" }
 *   3. POST /v1/runs/{run_id}/approval — user resolves approval
 *   4. POST /v1/runs/{run_id}/stop     — user interrupts
 *
 * For protocol details, see /Users/bytedance/Desktop/hermes-agent/gateway/
 * platforms/api_server.py (`_handle_runs` and related event callbacks).
 *
 * We don't re-implement the whole SSE spec here — instead, HermesRunsClient
 * is a thin wrapper that exposes `startRun()` + an EventSource-style
 * subscription via `subscribeEvents()` that ChatView can drive.
 */

import type { LLMConfig } from './config';
import type { LLMStreamHandlers, Reachability } from './types';
import { REACHABLE, NO_AUTH, DOWN, TIMEOUT, NO_CONFIG } from './types';
export type RunEvent =
  | { event: 'message.delta'; run_id: string; timestamp: number; delta: string }
  | { event: 'tool.started'; run_id: string; timestamp: number; tool: string; preview?: string }
  | { event: 'tool.completed'; run_id: string; timestamp: number; tool: string; duration: number; error: boolean }
  | { event: 'reasoning.available'; run_id: string; timestamp: number; text: string }
  | { event: 'approval.required'; run_id: string; timestamp: number; approval_id: string; prompt: string; tool: string; args: unknown }
  | { event: 'completed'; run_id: string; timestamp: number; final_response: string }
  | { event: 'failed'; run_id: string; timestamp: number; error: { message: string } }
  | { event: 'stopped'; run_id: string; timestamp: number; reason: string }
  | { event: 'raw'; run_id?: string; timestamp?: number; data: unknown };

export interface RunRequest {
  input: string;
  /** System prompt override */
  instructions?: string;
  /** Either inline history or a previous run id */
  conversationHistory?: { role: 'user' | 'assistant' | 'system'; content: string }[];
  previousResponseId?: string;
  model?: string;
  sessionId?: string;
  sessionKey?: string;
  signal?: AbortSignal;
}

export class HermesRunsClient {
  constructor(private config: LLMConfig) {}

  isReachable(): Promise<Reachability> {
    // /v1/runs is POST only. Use /v1/health (0-cost handler) as a probe.
    if (!this.config.endpoint) return Promise.resolve(NO_CONFIG);
    const base = this.config.endpoint.replace(/\/chat\/completions\/?$/, '');
    return fetch(`${base}/health`, {
      method: 'GET',
      headers: this.headers({}),
      signal: AbortSignal.timeout(2500),
    } as RequestInit)
      .then((r) => {
        if (r.ok) return REACHABLE;
        if (r.status === 401 || r.status === 403) return NO_AUTH;
        if (r.status >= 500) return DOWN;
        return REACHABLE; // 404 = /v1/models not supported, but server is up
      })
      .catch((e: any) => {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return TIMEOUT;
        return DOWN;
      });
  }

  /**
   * Start a run. Returns the run_id (gateway responds 202 Accepted).
   * The caller should then subscribe to events via `subscribeEvents()`.
   */
  async startRun(req: RunRequest): Promise<string> {
    const url = this.runsUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(req),
      body: JSON.stringify({
        input: req.input,
        instructions: req.instructions,
        conversation_history: req.conversationHistory,
        previous_response_id: req.previousResponseId,
        session_id: req.sessionId,
        model: req.model ?? this.config.defaultModel,
      }),
      signal: req.signal,
    } as RequestInit);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Failed to start run: ${res.status} ${txt || res.statusText}`);
    }
    const json: any = await res.json();
    return json.run_id;
  }

  /**
   * Subscribe to a run's event stream. Returns an async generator that
   * yields parsed RunEvent objects. Throws on network failure; if `req.signal`
   * aborts, the generator ends cleanly.
   */
  async *subscribeEvents(runId: string, signal?: AbortSignal): AsyncGenerator<RunEvent, void, void> {
    const url = this.eventsUrl(runId);
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...this.headers({}), Accept: 'text/event-stream' },
      signal,
    } as RequestInit);
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Event stream failed: ${res.status} ${txt || res.statusText}`);
    }
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    while (true) {
      if (signal?.aborted) {
        try { await reader.cancel(); } catch { /* */ }
        return;
      }
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          yield this.parseEvent(runId, json);
        } catch {
          yield { event: 'raw', data: payload };
        }
      }
    }
  }

  /** Stop a running agent. */
  async stopRun(runId: string): Promise<void> {
    const url = `${this.runsUrl()}/${encodeURIComponent(runId)}/stop`;
    await fetch(url, {
      method: 'POST',
      headers: this.headers({}),
    } as RequestInit).catch(() => undefined);
  }

  /** Resolve a pending approval. The agent will continue. */
  async resolveApproval(runId: string, approvalId: string, decision: 'approve' | 'deny', note?: string): Promise<void> {
    const url = `${this.runsUrl()}/${encodeURIComponent(runId)}/approval`;
    await fetch(url, {
      method: 'POST',
      headers: this.headers({}),
      body: JSON.stringify({
        approval_id: approvalId,
        decision,
        note,
      }),
    } as RequestInit).catch(() => undefined);
  }

  /** Poll the current run status (idempotent, non-streaming). */
  async getRun(runId: string): Promise<any> {
    const url = `${this.runsUrl()}/${encodeURIComponent(runId)}`;
    const res = await fetch(url, { method: 'GET', headers: this.headers({}) } as RequestInit);
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }

  private parseEvent(runId: string, json: any): RunEvent {
    const ev = json?.event ?? json?.type ?? 'raw';
    const ts = json?.timestamp ?? Date.now() / 1000;
    switch (ev) {
      case 'message.delta':
        return { event: 'message.delta', run_id: runId, timestamp: ts, delta: json.delta ?? '' };
      case 'tool.started':
        return { event: 'tool.started', run_id: runId, timestamp: ts, tool: json.tool ?? '?', preview: json.preview };
      case 'tool.completed':
        return { event: 'tool.completed', run_id: runId, timestamp: ts, tool: json.tool ?? '?', duration: json.duration ?? 0, error: !!json.error };
      case 'reasoning.available':
        return { event: 'reasoning.available', run_id: runId, timestamp: ts, text: json.text ?? '' };
      case 'approval.required':
        return {
          event: 'approval.required',
          run_id: runId,
          timestamp: ts,
          approval_id: json.approval_id,
          prompt: json.prompt ?? '',
          tool: json.tool ?? '',
          args: json.args,
        };
      case 'completed':
        return { event: 'completed', run_id: runId, timestamp: ts, final_response: json.final_response ?? '' };
      case 'failed':
        return { event: 'failed', run_id: runId, timestamp: ts, error: json.error ?? { message: 'unknown' } };
      case 'stopped':
        return { event: 'stopped', run_id: runId, timestamp: ts, reason: json.reason ?? '' };
      default:
        return { event: 'raw', run_id: runId, timestamp: ts, data: json };
    }
  }

  private runsUrl(): string {
    return this.config.endpoint.replace(/\/chat\/completions\/?$/, '') + '/runs';
  }
  private eventsUrl(runId: string): string {
    return `${this.runsUrl()}/${encodeURIComponent(runId)}/events`;
  }

  private headers(req: Pick<RunRequest, 'sessionId' | 'sessionKey'>): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    if (req.sessionId) h['X-Hermes-Session-Id'] = req.sessionId;
    if (req.sessionKey) h['X-Hermes-Session-Key'] = req.sessionKey;
    return h;
  }
}

export type RunStreamCallbacks = {
  onDelta: (delta: string) => void;
  onToolStart: (tool: string, preview?: string) => void;
  onToolEnd: (tool: string, duration: number, error: boolean) => void;
  onReasoning: (text: string) => void;
  onApproval: (req: { approvalId: string; prompt: string; tool: string; args: unknown }) => void;
  onCompleted: (finalText: string) => void;
  onFailed: (message: string) => void;
  onStopped: (reason: string) => void;
};