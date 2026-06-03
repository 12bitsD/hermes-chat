/**
 * LLM client registry. The app calls `getLLMClient()` and gets back the
 * Hermes client. There is no other provider — Hermes Chat is the client
 * for the Hermes agent, period.
 */

import type { LLMClient } from './types';
import type { LLMConfig } from './config';
import { HermesGatewayClient } from './hermes-client';

let cachedConfig: LLMConfig | null = null;
let cachedClient: LLMClient | null = null;

function emptyConfig(): LLMConfig {
  return {
    provider: 'hermes-gateway',
    endpoint: '',
    apiKey: '',
    defaultModel: 'default',
  };
}

export function configureLLM(cfg: LLMConfig) {
  cachedConfig = cfg;
  cachedClient = null; // invalidate so next getLLMClient() rebuilds
}

export function getLLMClient(): LLMClient {
  if (cachedClient) return cachedClient;
  if (!cachedConfig) cachedConfig = emptyConfig();
  cachedClient = new HermesGatewayClient(cachedConfig);
  return cachedClient;
}

export function getLLMConfig(): LLMConfig {
  if (!cachedConfig) cachedConfig = emptyConfig();
  return cachedConfig;
}

/** Cast helper for the Hermes session-context header forwarding. */
export function getHermesClient(): HermesGatewayClient | null {
  const c = getLLMClient();
  return c instanceof HermesGatewayClient ? c : null;
}

export type { LLMClient, LLMStreamRequest, LLMStreamHandlers, ChatMessageInput, LLMStreamContext } from './types';
export type { LLMConfig } from './config';
export { HermesRunsClient, type RunEvent, type RunRequest, type RunStreamCallbacks } from './runs-client';
export { HermesGatewayClient, type HermesRequestContext } from './hermes-client';
export { HermesSessionsClient, type HermesSession } from './sessions-client';
export { HermesJobsClient, type HermesJob, type JobState } from './jobs-client';
export { fetchSkills, fetchToolsets, type HermesSkill, type HermesToolset } from './discovery';
