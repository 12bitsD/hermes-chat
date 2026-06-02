/**
 * LLM client registry. The app calls `getLLMClient()` and gets back whatever
 * client matches the current config. Settings can be flipped at runtime and
 * the next request will pick up the new provider.
 */

import type { LLMClient } from './types';
import type { LLMConfig } from './config';
import { MockLLMClient } from './mock-client';
import { HermesGatewayClient } from './hermes-client';

let cachedConfig: LLMConfig | null = null;
let cachedClient: LLMClient | null = null;

export function configureLLM(cfg: LLMConfig) {
  cachedConfig = cfg;
  cachedClient = null; // invalidate so next getLLMClient() rebuilds
}

export function getLLMClient(): LLMClient {
  if (cachedClient) return cachedClient;
  if (!cachedConfig) {
    cachedConfig = { provider: 'mock', endpoint: '', apiKey: '', defaultModel: 'default' };
  }
  cachedClient = cachedConfig.provider === 'mock'
    ? new MockLLMClient()
    : new HermesGatewayClient(cachedConfig);
  return cachedClient;
}

export function getLLMConfig(): LLMConfig {
  if (!cachedConfig) {
    cachedConfig = { provider: 'mock', endpoint: '', apiKey: '', defaultModel: 'default' };
  }
  return cachedConfig;
}

/** Cast helper for the Hermes session-context header forwarding. */
export function getHermesClient(): HermesGatewayClient | null {
  const c = getLLMClient();
  return c instanceof HermesGatewayClient ? c : null;
}

export type { LLMClient, LLMStreamRequest, LLMStreamHandlers, ChatMessageInput, LLMStreamContext } from './types';
export type { LLMConfig } from './config';
export { HermesRunsClient, type RunEvent, type RunRequest, type RunStreamCallbacks, callbacksFromStreamHandlers } from './runs-client';
export { HermesGatewayClient, type HermesRequestContext } from './hermes-client';
