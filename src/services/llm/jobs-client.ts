/**
 * Hermes jobs client — talks to /api/jobs/* on the local gateway.
 *
 * Jobs are the "long-running background work" surface of Hermes.
 * The mobile use case this client is designed around:
 *
 *   "I asked my agent to do something long on my computer. I closed
 *    the chat app. When I open the phone again I want to see the job
 *    status and pause / resume / run it."
 *
 * Endpoints (per api_server.py):
 *   GET    /api/jobs                  list
 *   POST   /api/jobs                  create
 *   GET    /api/jobs/{id}             read
 *   PATCH  /api/jobs/{id}             update
 *   DELETE /api/jobs/{id}             delete
 *   POST   /api/jobs/{id}/pause       pause
 *   POST   /api/jobs/{id}/resume      resume
 *   POST   /api/jobs/{id}/run         trigger
 *
 * The mobile client is the read-mostly shell — we list, and we expose
 * pause/resume/run buttons next to each job.
 */

import type { LLMConfig } from './config';
import { gatewayApiUrl } from './url';

export type JobState = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled' | string;

export interface HermesJob {
  id: string;
  title?: string;
  state?: JobState;
  schedule?: string;
  next_run_at?: number;
  last_run_at?: number;
  last_error?: string;
  raw?: unknown;
}

export class HermesJobsClient {
  constructor(private config: LLMConfig) {}

  private base(): string {
    return gatewayApiUrl(this.config.endpoint);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async list(signal?: AbortSignal): Promise<HermesJob[] | null> {
    try {
      const res = await fetch(`${this.base()}/jobs`, {
        method: 'GET', headers: this.headers(), signal,
      } as RequestInit);
      if (!res.ok) return null;
      const json: any = await res.json();
      const arr: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      return arr.map((j) => this.parse(j));
    } catch { return null; }
  }

  async get(id: string, signal?: AbortSignal): Promise<HermesJob | null> {
    try {
      const res = await fetch(`${this.base()}/jobs/${encodeURIComponent(id)}`, {
        method: 'GET', headers: this.headers(), signal,
      } as RequestInit);
      if (!res.ok) return null;
      return this.parse(await res.json());
    } catch { return null; }
  }

  async pause(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.base()}/jobs/${encodeURIComponent(id)}/pause`, {
        method: 'POST', headers: this.headers(),
      } as RequestInit);
      return res.ok;
    } catch { return false; }
  }

  async resume(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.base()}/jobs/${encodeURIComponent(id)}/resume`, {
        method: 'POST', headers: this.headers(),
      } as RequestInit);
      return res.ok;
    } catch { return false; }
  }

  async run(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.base()}/jobs/${encodeURIComponent(id)}/run`, {
        method: 'POST', headers: this.headers(),
      } as RequestInit);
      return res.ok;
    } catch { return false; }
  }

  private parse(j: any): HermesJob {
    return {
      id: j.id ?? '',
      title: j.title ?? j.name,
      state: j.state ?? j.status,
      schedule: j.schedule ?? j.cron,
      next_run_at: j.next_run_at ?? j.nextRunAt,
      last_run_at: j.last_run_at ?? j.lastRunAt,
      last_error: j.last_error ?? j.error,
      raw: j,
    };
  }
}
