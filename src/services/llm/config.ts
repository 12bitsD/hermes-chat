/**
 * LLM endpoint configuration.
 *
 * Hermes gateway (api_server platform) is documented at
 *   /Users/bytedance/Desktop/hermes-agent/gateway/platforms/api_server.py
 *
 * It exposes an OpenAI-compatible HTTP API on port 8642 by default, with
 * additional Hermes-native endpoints for sessions, runs, approvals, and
 * streaming events. Any OpenAI-compatible frontend (Open WebUI, LobeChat,
 * NextChat, etc.) can talk to it.
 *
 * We surface three named presets so a user (or a programmer editing this
 * file) can flip between them quickly. The defaults below assume the user
 * is running the Hermes gateway on the same machine.
 */

import { Platform } from 'react-native';

export type ProviderId = 'mock' | 'hermes-gateway' | 'openai-compatible' | 'ollama';

export interface EndpointPreset {
  id: ProviderId;
  displayName: string;
  description: string;
  /** The default base URL for this preset (you can still override per-conversation). */
  baseUrl: string;
  /** A key the user can paste to authenticate. Most local gateways don't require one. */
  defaultApiKey: string;
  /** A model id to seed into settings when this preset is picked. */
  defaultModel: string;
  /** Show the "session id" toggle in the settings? Only meaningful for Hermes backend. */
  sessionAware: boolean;
  /** Show the "enable runs/approvals" toggle? Hermes-only advanced feature. */
  runsAware: boolean;
}

export const PRESETS: Record<ProviderId, EndpointPreset> = {
  mock: {
    id: 'mock',
    displayName: 'Mock (offline)',
    description: 'In-process fake responses. No network needed — great for design work.',
    baseUrl: '',
    defaultApiKey: '',
    defaultModel: 'default',
    sessionAware: false,
    runsAware: false,
  },
  'hermes-gateway': {
    id: 'hermes-gateway',
    displayName: 'Hermes gateway',
    description: 'Local Hermes agent (api_server platform on 8642). Streams SSE. OpenAI-compatible.',
    baseUrl: 'http://127.0.0.1:8642/v1/chat/completions',
    defaultApiKey: '',
    defaultModel: 'default',
    sessionAware: true,
    runsAware: true,
  },
  'openai-compatible': {
    id: 'openai-compatible',
    displayName: 'OpenAI-compatible',
    description: 'Any service speaking OpenAI Chat Completions: Open WebUI, LiteLLM, Together, etc.',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultApiKey: '',
    defaultModel: 'gpt-4o-mini',
    sessionAware: false,
    runsAware: false,
  },
  ollama: {
    id: 'ollama',
    displayName: 'Ollama (local)',
    description: 'Ollama running on localhost:11434. Model id matches a pulled model (llama3.1, qwen2.5, …).',
    baseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    defaultApiKey: '',
    defaultModel: 'llama3.1',
    sessionAware: false,
    runsAware: false,
  },
};

/**
 * Best-effort default endpoint for the current platform. Each preset's
 * baseUrl already encodes a sensible localhost — this just nudges Android
 * emulator users to 10.0.2.2 (host loopback) so the first connection
 * works without configuration.
 */
export function defaultEndpoint(preset: ProviderId = 'hermes-gateway'): string {
  if (preset === 'mock') return '';
  if (Platform.OS === 'android') {
    return PRESETS[preset].baseUrl
      .replace('127.0.0.1', '10.0.2.2')
      .replace('localhost', '10.0.2.2');
  }
  return PRESETS[preset].baseUrl;
}

export interface LLMConfig {
  /** "mock" or "hermes-gateway" */
  provider: 'mock' | 'hermes-gateway';
  /** Full URL to the chat completions endpoint, e.g. http://127.0.0.1:8642/v1/chat/completions */
  endpoint: string;
  /** Bearer token (optional, many local gateways skip auth) */
  apiKey?: string;
  /** Default model id to send; "default" usually maps to whatever the gateway has configured */
  defaultModel: string;
}

/**
 * @deprecated Use PRESETS[id] instead. Kept for back-compat with older
 * persisted settings and existing call-sites.
 */
export const DEFAULT_CONFIG: LLMConfig = {
  provider: 'mock',
  endpoint: defaultEndpoint('hermes-gateway'),
  apiKey: '',
  defaultModel: 'default',
};
