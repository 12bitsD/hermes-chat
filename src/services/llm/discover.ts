/**
 * discoverGateway — scan a small set of likely URLs for a Hermes
 * gateway and return the first one that responds 2xx on /v1/health.
 *
 * Why this exists
 * ───────────────
 * Phase 79: the most common blocker for a normal user trying
 * hermes-chat is "I don't know what to put in the Endpoint field".
 * The default placeholder is http://127.0.0.1:8642 which only
 * works when the user is literally on the same machine. On a phone
 * or another laptop they need http://<mac-lan-ip>:8642,
 * http://hermes.local:8642 (mDNS), or a Tailscale/Cloudflare-tunnel
 * URL.
 *
 * This util probes a small candidate set in parallel with a tight
 * overall budget and returns the first hit. It does not modify
 * the user's saved settings — the caller decides what to do with
 * the hit (typically: write it to the endpoint field, then run
 * a real Probe to confirm).
 *
 * Candidate set (kept short on purpose; the user has a manual
 * override for anything we miss):
 *   - http://127.0.0.1:8642       (same machine; the classic case)
 *   - http://localhost:8642        (alias)
 *   - http://hermes.local:8642     (mDNS / Bonjour — works on most macOS+iOS
 *                                    networks out of the box)
 *   - http://<lan-prefix>.1:8642   (common router IPs — 192.168.1.1,
 *                                    192.168.0.1, 10.0.0.1)
 *
 * 10s overall budget so the UI never feels hung.
 *
 * Why no react-native import: this module is also exercised from
 * the Node smoke test suite (tests/smoke.test.ts). Importing
 * react-native at module load pulls in the full RN runtime and
 * crashes tsx's esbuild. We use a defensive web/native detection
 * here (typeof document / window / navigator) instead.
 */

const OVERALL_BUDGET_MS = 10_000;

const COMMON_ROUTER_IPS = [
  '192.168.1.1',
  '192.168.0.1',
  '192.168.1.100',
  '10.0.0.1',
  '10.0.1.1',
  '172.16.0.1',
];

function isNarrowScreen(): boolean {
  // Web: read window.innerWidth. Native: assume mobile (the
  // phone client is the primary mobile surface anyway).
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number') {
    return window.innerWidth < 768;
  }
  return true;
}

function supportsMDNS(): boolean {
  // mDNS works on macOS + iOS Safari (both speak Bonjour). On
  // Android Chrome it often hangs. In Node tests it's always
  // unavailable, so we just skip the candidate in that case.
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Quick-and-dirty: iOS/macOS Safari yes, Android no, others
  // yes (web desktop). If the user has a custom UA, no harm
  // trying.
  if (/Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg/i.test(ua)) {
    return false;
  }
  return true;
}

function getBaseCandidates(): string[] {
  const set: string[] = [
    'http://127.0.0.1:8642',
    'http://localhost:8642',
  ];
  if (supportsMDNS()) {
    set.push('http://hermes.local:8642');
  }
  // On narrow (mobile) screens the same-machine IP is not useful
  // — we MUST find a LAN address. Add the common router IPs as
  // fallback candidates.
  if (isNarrowScreen()) {
    for (const ip of COMMON_ROUTER_IPS) {
      set.push(`http://${ip}:8642`);
    }
  }
  return set;
}

async function probeOne(base: string, signal: AbortSignal): Promise<{ base: string; ok: boolean; status?: number }> {
  try {
    const res = await fetch(`${base}/v1/health`, { signal, cache: 'no-store' });
    return { base, ok: res.ok, status: res.status };
  } catch {
    return { base, ok: false };
  }
}

export interface DiscoveryResult {
  candidates: string[];
  tried: { base: string; ok: boolean; status?: number }[];
  winner: string | null;
}

/**
 * Probe all candidate endpoints in parallel and return the first
 * 2xx hit. Tries all of them within the overall budget — we don't
 * short-circuit on the first success because the user might want
 * to see "what's around" in the UI to pick manually.
 */
export async function discoverGateway(): Promise<DiscoveryResult> {
  const candidates = getBaseCandidates();
  const ac = new AbortController();
  const overallTimer = setTimeout(() => ac.abort(), OVERALL_BUDGET_MS);
  try {
    const results = await Promise.all(
      candidates.map((base) => probeOne(base, ac.signal)),
    );
    const winner = results.find((r) => r.ok)?.base ?? null;
    return { candidates, tried: results, winner };
  } finally {
    clearTimeout(overallTimer);
  }
}
