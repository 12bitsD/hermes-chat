/**
 * Hermes discovery endpoints — /v1/skills and /v1/toolsets.
 *
 * Skills: Hermes-installed skill packs. A skill is a named bundle of
 * instructions the agent can opt into. The list comes from
 * `api_server.py::_handle_skills`.
 *
 * Toolsets: groups of tools the agent can use. The list comes from
 * `api_server.py::_handle_toolsets`.
 *
 * These two endpoints are unique to Hermes — generic OpenAI-compatible
 * servers don't have them, which is why we expose them directly here
 * rather than tucking them behind a generic "models" abstraction.
 */

import type { LLMConfig } from './config';
import { gatewayV1Url } from './url';

export interface HermesSkill {
  id: string;
  name: string;
  description?: string;
  raw?: unknown;
}

export interface HermesToolset {
  id: string;
  name: string;
  description?: string;
  raw?: unknown;
}

function base(config: LLMConfig): string {
  return gatewayV1Url(config.endpoint);
}

function headers(config: LLMConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) h.Authorization = `Bearer ${config.apiKey}`;
  return h;
}

export async function fetchSkills(config: LLMConfig, signal?: AbortSignal): Promise<HermesSkill[] | null> {
  try {
    const res = await fetch(`${base(config)}/skills`, {
      method: 'GET', headers: headers(config), signal,
    } as RequestInit);
    if (!res.ok) return null;
    const json: any = await res.json();
    const arr: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    return arr.map((s) => ({
      id: s.id ?? s.name ?? '',
      name: s.name ?? s.id ?? '',
      description: s.description ?? s.summary,
      raw: s,
    }));
  } catch { return null; }
}

export async function fetchToolsets(config: LLMConfig, signal?: AbortSignal): Promise<HermesToolset[] | null> {
  try {
    const res = await fetch(`${base(config)}/toolsets`, {
      method: 'GET', headers: headers(config), signal,
    } as RequestInit);
    if (!res.ok) return null;
    const json: any = await res.json();
    const arr: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    return arr.map((t) => ({
      id: t.id ?? t.name ?? '',
      name: t.name ?? t.id ?? '',
      description: t.description ?? t.summary,
      raw: t,
    }));
  } catch { return null; }
}
