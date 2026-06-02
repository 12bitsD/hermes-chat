/**
 * Background auto-detect for LLM providers.
 *
 * On first launch (or whenever the user is still on the default mock
 * provider), probe a small list of well-known LLM endpoints in parallel
 * and flip the active provider to the first one that responds. This
 * makes the app "just work" against a freshly-launched Hermes gateway
 * (port 8642) without the user having to open Settings.
 *
 * The probe respects the user's persisted choice — if they've already
 * picked a non-mock provider, we don't second-guess them.
 *
 * Each probe has a 1.5 s budget so the whole sweep finishes within ~2 s
 * on a typical machine; failures are silent.
 */

import { defaultEndpoint, PRESETS, ProviderId } from './config';

export interface AutoDetectResult {
  found: boolean;
  provider?: ProviderId;
  endpoint?: string;
  reason?: string;
}

const CANDIDATE_PORTS = [
  { id: 'hermes-gateway' as const, host: '127.0.0.1', port: 8642, path: '/v1/models' },
  { id: 'ollama' as const, host: '127.0.0.1', port: 11434, path: '/api/tags' },
  { id: 'hermes-gateway' as const, host: '10.0.2.2', port: 8642, path: '/v1/models' }, // Android emulator
];

const PROBE_TIMEOUT_MS = 1500;

export async function autoDetectLLM(): Promise<AutoDetectResult> {
  const checks = await Promise.all(
    CANDIDATE_PORTS.map(async (c) => {
      const url = `http://${c.host}:${c.port}${c.path}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        } as RequestInit);
        return { ok: res.ok || res.status < 500, url, port: c.port, id: c.id };
      } catch {
        return { ok: false, url, port: c.port, id: c.id };
      }
    }),
  );

  for (const r of checks) {
    if (r.ok) {
      // Reconstruct the chat-completions URL from the discovered port
      const preset = PRESETS[r.id as ProviderId];
      const baseUrl = r.url.replace(/\/(v1\/models|api\/tags)\/?$/, '');
      return {
        found: true,
        provider: r.id as ProviderId,
        endpoint: `${baseUrl}/chat/completions`,
      };
    }
  }

  return { found: false, reason: 'No LLM endpoint responded within the probe window.' };
}

/** Returns a sensible default endpoint for a given provider, on this device. */
export function bestEndpointFor(provider: ProviderId, host = '127.0.0.1'): string {
  if (provider === 'mock') return '';
  const preset = PRESETS[provider];
  // Strip the existing host/port so we can re-target the device.
  return preset.baseUrl.replace(/http:\/\/[^/]+/, `http://${host}`);
}

export const AUTO_DETECT_TIMEOUT_MS = PROBE_TIMEOUT_MS;
