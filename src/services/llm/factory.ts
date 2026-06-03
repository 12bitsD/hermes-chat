import type { AppSettings } from '../../types';
import { DEFAULT_MODEL } from '../../config/app-constants';
import { defaultEndpoint, type LLMConfig } from './config';
import { HermesGatewayClient } from './hermes-client';
import { HermesJobsClient } from './jobs-client';
import { createHermesPort as createHermesPortFromClients } from './hermes-port';
import { HermesRunsClient } from './runs-client';
import { HermesSessionsClient } from './sessions-client';
import type { LLMClient } from './types';

export interface LLMConfigDraft {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

export function buildLLMConfig(settings: Pick<AppSettings, 'llmEndpoint' | 'llmApiKey' | 'llmModel'>): LLMConfig {
  return {
    provider: 'hermes-gateway',
    endpoint: settings.llmEndpoint || defaultEndpoint(),
    apiKey: settings.llmApiKey || undefined,
    defaultModel: settings.llmModel || DEFAULT_MODEL,
  };
}

export function buildLLMConfigFromDraft(draft: LLMConfigDraft): LLMConfig {
  return {
    provider: 'hermes-gateway',
    endpoint: draft.endpoint || defaultEndpoint(),
    apiKey: draft.apiKey || undefined,
    defaultModel: draft.model || DEFAULT_MODEL,
  };
}

export const createGatewayClient = (config: LLMConfig) => new HermesGatewayClient(config);
export const createRunsClient = (config: LLMConfig) => new HermesRunsClient(config);
export const createSessionsClient = (config: LLMConfig) => new HermesSessionsClient(config);
export const createJobsClient = (config: LLMConfig) => new HermesJobsClient(config);
export const createHermesPort = (config: LLMConfig, chatClient?: LLMClient) =>
  createHermesPortFromClients(chatClient ?? createGatewayClient(config), createRunsClient(config));
