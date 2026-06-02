/**
 * LLM endpoint configuration.
 *
 * This client is built specifically for the **Hermes agent gateway**
 * (the `api_server` platform on port 8642, see hermes-agent/gateway/
 * platforms/api_server.py). The default endpoint, session-id forwarding,
 * and capability discovery all assume that gateway.
 *
 * "OpenAI-compatible" / "Ollama" presets are kept as opt-in dev
 * fallbacks so a developer can point the app at a generic endpoint
 * while building — but they're not the intended use. The product
 * positioning is: this is Hermes's mobile/desktop chat client, not a
 * generic chatbot.
 */

import { Platform } from 'react-native';

export type ProviderId = 'hermes-gateway' | 'openai-compatible' | 'ollama' | 'mock';

export interface EndpointPreset {
  id: ProviderId;
  displayName: string;
  description: string;
  baseUrl: string;
  defaultApiKey: string;
  defaultModel: string;
  sessionAware: boolean;
  runsAware: boolean;
}

export const PRESETS: Record<ProviderId, EndpointPreset> = {
  'hermes-gateway': {
    id: 'hermes-gateway',
    displayName: 'Hermes gateway',
    description: 'The local Hermes agent (api_server on 8642). Streams SSE. Session-aware. Agent runs + approvals.',
    baseUrl: 'http://127.0.0.1:8642/v1/chat/completions',
    defaultApiKey: '',
    defaultModel: 'default',
    sessionAware: true,
    runsAware: true,
  },
  'openai-compatible': {
    id: 'openai-compatible',
    displayName: 'OpenAI-compatible (dev fallback)',
    description: 'Any service speaking OpenAI Chat Completions. Generic — picks up no Hermes features (no sessions, no runs).',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultApiKey: '',
    defaultModel: 'gpt-4o-mini',
    sessionAware: false,
    runsAware: false,
  },
  ollama: {
    id: 'ollama',
    displayName: 'Ollama (dev fallback)',
    description: 'Ollama running on localhost:11434. No Hermes features.',
    baseUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    defaultApiKey: '',
    defaultModel: 'llama3.1',
    sessionAware: false,
    runsAware: false,
  },
  mock: {
    id: 'mock',
    displayName: 'Mock (offline)',
    description: 'In-process fake responses. No network needed.',
    baseUrl: '',
    defaultApiKey: '',
    defaultModel: 'default',
    sessionAware: false,
    runsAware: false,
  },
};

/** Best-effort default endpoint for the current platform. */
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
  /** "hermes-gateway" (default) or one of the dev fallbacks. */
  provider: ProviderId;
  /** Full URL to the chat completions endpoint. */
  endpoint: string;
  /** Bearer token (optional, local Hermes gateway typically has none). */
  apiKey?: string;
  /** Default model id; "default" lets the gateway route. */
  defaultModel: string;
}

/**
 * Default app config used by the LLM client. The default endpoint is the
 * Hermes gateway on 8642, which is also what the auto-detector probes
 * first on first launch.
 */
export const DEFAULT_CONFIG: LLMConfig = {
  provider: 'hermes-gateway',
  endpoint: defaultEndpoint('hermes-gateway'),
  apiKey: '',
  defaultModel: 'default',
};
