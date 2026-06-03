/**
 * Hermes /v1/capabilities — machine-readable API surface that the
 * gateway advertises. External UIs use this to discover what's
 * actually enabled on the server without scraping docs.
 *
 * See hermes-agent/gateway/platforms/api_server.py: `_handle_capabilities`.
 */

import type { LLMConfig } from './config';
import { gatewayV1Url } from './url';

export interface HermesCapabilities {
  platform: string;
  model: string;
  auth: { type: string; required: boolean };
  runtime: {
    mode: string;
    tool_execution: string;
    split_runtime: boolean;
    description: string;
  };
  features: Record<string, boolean | string>;
  endpoints: Record<string, { method: string; path: string }>;
  raw?: unknown;
}

const CACHE_MS = 60_000; // 1 min — capabilities rarely change

let cache: { url: string; at: number; data: HermesCapabilities | null } | null = null;

export async function fetchCapabilities(
  config: LLMConfig,
  signal?: AbortSignal,
): Promise<HermesCapabilities | null> {
  const url = `${gatewayV1Url(config.endpoint)}/capabilities`;

  if (cache && cache.url === url && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }

  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  try {
    const res = await fetch(url, { method: 'GET', headers, signal } as RequestInit);
    if (!res.ok) {
      cache = { url, at: Date.now(), data: null };
      return null;
    }
    const data: any = await res.json();
    const parsed: HermesCapabilities = {
      platform: data.platform ?? 'hermes-agent',
      model: data.model ?? 'default',
      auth: data.auth ?? { type: 'bearer', required: false },
      runtime: data.runtime ?? { mode: 'server_agent', tool_execution: 'server', split_runtime: false, description: '' },
      features: data.features ?? {},
      endpoints: data.endpoints ?? {},
      raw: data,
    };
    cache = { url, at: Date.now(), data: parsed };
    return parsed;
  } catch {
    cache = { url, at: Date.now(), data: null };
    return null;
  }
}

/** Friendly labels for the most interesting capabilities flags. */
export const CAPABILITY_LABELS: Record<string, { label: string; blurb: string; }> = {
  chat_completions:           { label: 'Chat completions',           blurb: 'Stateless /v1/chat/completions streaming' },
  chat_completions_streaming: { label: 'Token streaming',            blurb: 'Server-sent events (SSE) per token' },
  responses_api:              { label: 'Responses API',               blurb: 'Stateful OpenAI Responses format' },
  run_submission:             { label: 'Agent runs',                  blurb: 'POST /v1/runs — start a structured run' },
  run_events_sse:             { label: 'Run event stream',            blurb: 'GET /v1/runs/{run_id}/events — tool + approval + delta' },
  run_stop:                   { label: 'Run stop',                    blurb: 'POST /v1/runs/{run_id}/stop — interrupt mid-run' },
  run_approval_response:      { label: 'Run approval',               blurb: 'POST /v1/runs/{run_id}/approval — resolve a pending tool' },
  tool_progress_events:       { label: 'Tool events',                blurb: 'Real-time tool.started / tool.completed' },
  approval_events:            { label: 'Approval events',            blurb: 'Streamed approval.required events' },
  session_resources:          { label: 'Session resources',          blurb: 'GET/POST /api/sessions — Hermes SessionDB' },
  session_chat:               { label: 'Session chat',               blurb: 'POST /api/sessions/{id}/chat[/stream]' },
  session_chat_streaming:     { label: 'Session chat streaming',     blurb: 'SSE variants of session chat' },
  session_fork:               { label: 'Session fork',                blurb: 'Branch a session via SessionDB lineage' },
  skills_api:                 { label: 'Skills API',                  blurb: 'GET /v1/skills — list installed skills' },
  toolsets:                   { label: 'Toolsets',                    blurb: 'GET /v1/toolsets — list available tool groups' },
  session_continuity_header:  { label: 'Session continuity header',  blurb: 'X-Hermes-Session-Id — stitches turns' },
  session_key_header:         { label: 'Session key header',         blurb: 'X-Hermes-Session-Key — long-term memory scope' },
};
