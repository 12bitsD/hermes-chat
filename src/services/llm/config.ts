/**
 * Hermes endpoint configuration.
 *
 * Hermes Chat is the mobile/desktop client for the **Hermes agent** — the
 * only supported LLM backend. All code paths assume the gateway is
 * running on the same machine (or reachable via LAN / tunnel) and
 * speaking the Hermes-native API on `/v1/chat/completions` and friends.
 *
 * No fallbacks. If the gateway is offline, the app surfaces that
 * honestly in the status bar — it does not pretend to work by
 * talking to a different backend.
 */

import { Platform } from 'react-native';
import { DEFAULT_MODEL, HERMES_CHAT_ENDPOINT_PATH, HERMES_GATEWAY_PORT } from '../../config/app-constants';

/** Single supported provider. The type is left narrow on purpose. */
export type ProviderId = 'hermes-gateway';

export interface LLMConfig {
  provider: ProviderId;
  /** Full URL to the chat completions endpoint, e.g. http://127.0.0.1:8642/v1/chat/completions */
  endpoint: string;
  /** Bearer token (optional, the local Hermes gateway typically has none). */
  apiKey?: string;
  /** Default model id; "default" lets the gateway route. */
  defaultModel: string;
}

export const DEFAULT_GATEWAY_PORT = HERMES_GATEWAY_PORT;

export function defaultEndpoint(): string {
  // Android emulator's host loopback is 10.0.2.2; everywhere else is 127.0.0.1.
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  return `http://${host}:${DEFAULT_GATEWAY_PORT}${HERMES_CHAT_ENDPOINT_PATH}`;
}

/**
 * The default config. The endpoint is the local Hermes gateway, the
 * model is whatever the gateway is configured to serve (so we don't
 * hard-code an id the user might not have installed).
 */
export const DEFAULT_CONFIG: LLMConfig = {
  provider: 'hermes-gateway',
  endpoint: defaultEndpoint(),
  apiKey: '',
  defaultModel: DEFAULT_MODEL,
};
