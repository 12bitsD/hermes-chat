/**
 * Hermes sessions client — talks to /api/sessions/* on the local gateway.
 *
 * The session resource API is documented at
 * /Users/bytedance/Desktop/hermes-agent/gateway/platforms/api_server.py
 * (`_handle_api_sessions` and friends). Endpoints we use:
 *   - GET  /api/sessions                        -> list
 *   - POST /api/sessions                        -> create empty
 *   - GET  /api/sessions/{id}                   -> read one
 *   - PATCH /api/sessions/{id}                  -> rename / metadata
 *   - DELETE /api/sessions/{id}                 -> delete
 *   - GET  /api/sessions/{id}/messages          -> history
 *   - POST /api/sessions/{id}/fork             -> branch session
 *   - POST /api/sessions/{id}/chat[/stream]   -> persisted chat
 *
 * The mobile use case this client is designed around:
 * "I'm on my phone; I want to see the conversations my desktop
 *  Hermes session has been having and pick up where it left off."
 *
 * Right now the client is the wire layer; UI integration is in a
 * follow-up. The shape of HermesSession is what the SessionDrawer
 * will render.
 */

import type { LLMConfig } from './config';

export interface HermesSession {
  id: string;
  title?: string;
  created_at?: number;
  updated_at?: number;
  message_count?: number;
  preview?: string;
  client_meta?: Record<string, unknown>;
  raw?: unknown;
}

export class HermesSessionsClient {
  constructor(private config: LLMConfig) {}

  private base(): string {
    return this.config.endpoint.replace(/\/chat\/completions\/?$/, '') + '/api';
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  isAvailable(signal?: AbortSignal): Promise<boolean> {
    return this.list(signal).then((s) => s !== null).catch(() => false);
  }

  async list(signal?: AbortSignal): Promise<HermesSession[] | null> {
    try {
      const res = await fetch(`${this.base()}/sessions`, {
        method: 'GET', headers: this.headers(), signal,
      } as RequestInit);
      if (!res.ok) return null;
      const json: any = await res.json();
      const arr: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
      return arr.map((s) => this.parse(s));
    } catch {
      return null;
    }
  }

  async get(id: string, signal?: AbortSignal): Promise<HermesSession | null> {
    try {
      const res = await fetch(`${this.base()}/sessions/${encodeURIComponent(id)}`, {
        method: 'GET', headers: this.headers(), signal,
      } as RequestInit);
      if (!res.ok) return null;
      return this.parse(await res.json());
    } catch { return null; }
  }

  async create(title?: string): Promise<HermesSession | null> {
    try {
      const res = await fetch(`${this.base()}/sessions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(title ? { title } : {}),
      } as RequestInit);
      if (!res.ok) return null;
      return this.parse(await res.json());
    } catch { return null; }
  }

  async rename(id: string, title: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.base()}/sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ title }),
      } as RequestInit);
      return res.ok;
    } catch { return false; }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.base()}/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: this.headers(),
      } as RequestInit);
      return res.ok;
    } catch { return false; }
  }

  async fork(id: string, signal?: AbortSignal): Promise<HermesSession | null> {
    try {
      const res = await fetch(`${this.base()}/sessions/${encodeURIComponent(id)}/fork`, {
        method: 'POST', headers: this.headers(), signal,
      } as RequestInit);
      if (!res.ok) return null;
      return this.parse(await res.json());
    } catch { return null; }
  }

  async messages(id: string, signal?: AbortSignal): Promise<unknown[] | null> {
    try {
      const res = await fetch(`${this.base()}/sessions/${encodeURIComponent(id)}/messages`, {
        method: 'GET', headers: this.headers(), signal,
      } as RequestInit);
      if (!res.ok) return null;
      const json: any = await res.json();
      return Array.isArray(json) ? json : Array.isArray(json?.messages) ? json.messages : [];
    } catch { return null; }
  }

  private parse(s: any): HermesSession {
    return {
      id: s.id ?? s.session_id ?? '',
      title: s.title ?? s.name,
      created_at: s.created_at ?? s.createdAt,
      updated_at: s.updated_at ?? s.updatedAt,
      message_count: s.message_count ?? s.messageCount,
      preview: s.preview,
      client_meta: s.client_meta,
      raw: s,
    };
  }
}
