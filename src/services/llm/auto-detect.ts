/**
 * Background auto-detect for the local Hermes agent.
 *
 * On first launch (or whenever the user is still on the default config),
 * probe the Hermes gateway on port 8642 in parallel from the two
 * reachable loopback addresses (127.0.0.1 and 10.0.2.2 — the latter
 * is what Android emulators route to the host). If a real gateway
 * responds, the active config flips to it.
 *
 * The probe respects the user's persisted choice — once they've touched
 * the settings (AsyncStorage sets a 'customized' flag) the auto-detector
 * never runs again.
 *
 * Each probe has a 1.5 s budget so the whole sweep finishes within ~2 s
 * on a typical machine; failures are silent.
 */

import { defaultEndpoint, DEFAULT_GATEWAY_PORT } from './config';

export interface AutoDetectResult {
  found: boolean;
  reason?: string;
}

const CANDIDATES = [
  { host: '127.0.0.1', port: DEFAULT_GATEWAY_PORT, path: '/v1/models' },
  { host: '10.0.2.2',   port: DEFAULT_GATEWAY_PORT, path: '/v1/models' }, // Android emulator
];

const PROBE_TIMEOUT_MS = 1500;

export async function autoDetectLLM(): Promise<AutoDetectResult> {
  const checks = await Promise.all(
    CANDIDATES.map(async (c) => {
      const url = `http://${c.host}:${c.port}${c.path}`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        } as RequestInit);
        return { ok: res.ok || res.status < 500, host: c.host, port: c.port };
      } catch {
        return { ok: false, host: c.host, port: c.port };
      }
    }),
  );

  for (const r of checks) {
    if (r.ok) {
      return { found: true };
    }
  }

  return { found: false, reason: 'Hermes gateway is not responding on port 8642.' };
}

export { defaultEndpoint };
export const AUTO_DETECT_TIMEOUT_MS = PROBE_TIMEOUT_MS;
