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
import { LLMConfig } from '../services/llm/config';
import { createJobsClient, createSessionsClient, buildLLMConfig } from '../services/llm/factory';
import { SNAPSHOT_POLL_MS, SNAPSHOT_REQUEST_TIMEOUT_MS } from '../config/app-constants';

const POLL_MS = SNAPSHOT_POLL_MS;
const PER_REQUEST_TIMEOUT_MS = SNAPSHOT_REQUEST_TIMEOUT_MS;

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
    withTimeout(createSessionsClient(cfg).list(sig), PER_REQUEST_TIMEOUT_MS),
    withTimeout(createJobsClient(cfg).list(sig), PER_REQUEST_TIMEOUT_MS),
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
    // Phase 76: adaptive backoff. The default 30s poll is fine while
    // the gateway is healthy. Once it goes offline we don't want to
    // burn 5 requests/min for 20 minutes — we back off exponentially
    // up to a 5-min cap, then reset to 30s the moment it comes back.
    // Same pattern as messageQueue (Phase 62) but on a 30s base.
    let consecutiveFailures = 0;
    const tick = async () => {
      const cfg: LLMConfig = buildLLMConfig(settings);
      const snap = await pollOnce(cfg);
      if (cancelled) return;
      setSnapshot(snap);
      if (snap === null) {
        consecutiveFailures++;
        const backoff = Math.min(POLL_MS * 2 ** consecutiveFailures, 5 * 60 * 1000);
        timer = setTimeout(tick, backoff);
      } else {
        consecutiveFailures = 0;
        timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [settings.llmEndpoint, settings.llmApiKey, settings.llmModel, setSnapshot]);
}
