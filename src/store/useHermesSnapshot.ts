/**
 * useHermesSnapshot — background-poll the Hermes gateway and keep a
 * "snapshot" of its state in the store. This is the mobile view of
 * "what's my computer's Hermes doing right now?"
 *
 * On mount (and every 30 s), we fan out to:
 *   - GET /v1/capabilities
 *   - GET /v1/skills
 *   - GET /v1/toolsets
 *   - GET /api/sessions
 *   - GET /api/jobs
 * and store the parsed results. The drawer + status bar read
 * `hermesSnapshot` from the store. Each call has a 2 s budget; failures
 * mark the relevant field as null without breaking the others.
 */

import { useEffect } from 'react';
import { useAppStore, HermesSnapshot } from './app';
import { fetchCapabilities } from '../services/llm/capabilities';
import { fetchSkills, fetchToolsets } from '../services/llm/discovery';
import { HermesSessionsClient } from '../services/llm/sessions-client';
import { HermesJobsClient } from '../services/llm/jobs-client';
import { defaultEndpoint, LLMConfig } from '../services/llm/config';

const POLL_MS = 30_000;
const PER_REQUEST_TIMEOUT_MS = 2_000;

async function withTimeout<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function pollOnce(cfg: LLMConfig): Promise<HermesSnapshot | null> {
  const sig = AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS);
  const [caps, skills, toolsets, sessions, jobs] = await Promise.all([
    withTimeout(fetchCapabilities(cfg, sig), PER_REQUEST_TIMEOUT_MS),
    withTimeout(fetchSkills(cfg, sig), PER_REQUEST_TIMEOUT_MS),
    withTimeout(fetchToolsets(cfg, sig), PER_REQUEST_TIMEOUT_MS),
    withTimeout(new HermesSessionsClient(cfg).list(sig), PER_REQUEST_TIMEOUT_MS),
    withTimeout(new HermesJobsClient(cfg).list(sig), PER_REQUEST_TIMEOUT_MS),
  ]);
  // If literally nothing responded, treat as gateway-offline.
  if (!caps && !skills && !toolsets && !sessions && !jobs) return null;

  return {
    skills:    skills    ?? [],
    toolsets:  toolsets  ?? [],
    sessions:  (sessions ?? []).map((s) => ({
      id: s.id, title: s.title,
      messageCount: s.message_count,
      updatedAt: s.updated_at,
    })),
    jobs:      (jobs     ?? []).map((j) => ({
      id: j.id, title: j.title, state: j.state, nextRunAt: j.next_run_at,
    })),
    updatedAt: Date.now(),
  };
}

export function useHermesSnapshot() {
  const settings = useAppStore((s) => s.settings);
  const setSnapshot = useAppStore((s) => s.setHermesSnapshot);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const cfg: LLMConfig = {
        provider: 'hermes-gateway',
        endpoint: settings.llmEndpoint || defaultEndpoint(),
        apiKey: settings.llmApiKey || undefined,
        defaultModel: settings.llmModel || 'default',
      };
      const snap = await pollOnce(cfg);
      if (!cancelled) setSnapshot(snap);
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [settings.llmEndpoint, settings.llmApiKey, settings.llmModel, setSnapshot]);
}
