/**
 * Provider configuration. Resolved at runtime so the same bundle works on:
 *   - Web (localhost)
 *   - iOS Simulator (localhost)
 *   - Android Emulator (10.0.2.2 is the host loopback)
 *   - Physical Android device on the same LAN (gateway IP)
 *
 * The user can override the endpoint from the in-app Settings panel; that
 * value is persisted via the existing persistence layer.
 */

import { Platform } from 'react-native';

export interface LLMConfig {
  /** "mock" or "hermes-gateway" */
  provider: 'mock' | 'hermes-gateway';
  /** Full URL to the chat completions endpoint, e.g. http://192.168.1.10:8080/v1/chat/completions */
  endpoint: string;
  /** Bearer token (optional, many local gateways skip auth) */
  apiKey?: string;
  /** Default model id to send; "default" usually maps to whatever the gateway has configured */
  defaultModel: string;
}

/** Best-effort default endpoint for the current platform. */
export function defaultEndpoint(): string {
  if (Platform.OS === 'android') {
    // Android emulator special host loopback. Physical devices need an override.
    return 'http://10.0.2.2:8080/v1/chat/completions';
  }
  // Web, iOS simulator, anything else — localhost
  return 'http://127.0.0.1:8080/v1/chat/completions';
}

export const DEFAULT_CONFIG: LLMConfig = {
  provider: 'mock',
  endpoint: defaultEndpoint(),
  apiKey: '',
  defaultModel: 'default',
};
