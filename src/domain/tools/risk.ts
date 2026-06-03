/**
 * tool-risk — classify tools as low-risk (auto-approve-able) vs
 * high-risk (always require explicit user confirmation).
 *
 * The list is intentionally conservative: anything we *might* be
 * missing — including custom toolsets we don't recognise — falls
 * into HIGH risk. The user can opt out of a confirmation if they
 * trust the tool, but the default leans safe.
 *
 * Source-of-truth: Phase 63 #10 review R10.1 (tool risk grading).
 * Sibling gateway may add new tools in the future; this list is a
 * deny-by-default gate, not a permit-list.
 */
export const HIGH_RISK_TOOLS: ReadonlySet<string> = new Set([
  // Shell / process execution
  'shell', 'exec', 'run_command', 'bash', 'sh', 'zsh', 'command', 'cli',
  // File mutations
  'write_file', 'edit_file', 'delete_file', 'create_file', 'move_file', 'copy_file', 'rm', 'mv', 'cp',
  // External side effects
  'send_email', 'send_message', 'send_sms', 'http_post', 'http_put', 'http_delete', 'fetch', 'api_call',
  'git_push', 'git_commit', 'deploy', 'publish', 'release',
  // Anything that could exfiltrate data
  'upload', 'sync', 'export',
]);

/** Tool names that we trust implicitly — read-only and reversible. */
export const LOW_RISK_TOOLS: ReadonlySet<string> = new Set([
  'read_file', 'cat', 'list_dir', 'ls', 'find', 'grep', 'glob', 'tree',
  'web_search', 'web_fetch', 'http_get', 'search',
  'read', 'view', 'inspect', 'describe', 'show', 'get',
]);

export type RiskLevel = 'low' | 'high';

/** Resolve a tool name to its risk level. Defaults to 'high' so we
 *  never auto-approve something we don't recognise. */
export function toolRiskLevel(tool: string | null | undefined): RiskLevel {
  if (!tool) return 'high';
  const t = tool.toLowerCase().trim();
  if (LOW_RISK_TOOLS.has(t)) return 'low';
  if (HIGH_RISK_TOOLS.has(t)) return 'high';
  return 'high';
}

/** A short human description of what the tool is about to do, for
 *  the toast/modal body. We try to extract a meaningful arg
 *  (path, query, command) so the user knows what's at stake. */
export function describeToolIntent(tool: string, args: unknown): string {
  if (!args || typeof args !== 'object') return 'on unspecified arguments';
  const a = args as Record<string, unknown>;
  switch (tool.toLowerCase()) {
    case 'read_file':
    case 'cat':
      return `read ${a.path ?? a.file ?? a.filename ?? '?'}`;
    case 'list_dir':
    case 'ls':
      return `list ${a.path ?? a.dir ?? '.'}`;
    case 'web_search':
    case 'search':
      return `search for ${a.query ?? a.q ?? '?'}`;
    case 'web_fetch':
    case 'http_get':
    case 'fetch':
      return `fetch ${a.url ?? '?'}`;
    case 'shell':
    case 'exec':
    case 'run_command':
    case 'bash':
      return `run \`${a.cmd ?? a.command ?? '?'}\``;
    case 'write_file':
    case 'edit_file':
    case 'create_file':
      return `write ${a.path ?? '?'}`;
    case 'delete_file':
    case 'rm':
      return `delete ${a.path ?? a.file ?? '?'}`;
    case 'send_email':
      return `email ${a.to ?? '?'}`;
    default:
      // Best-effort: pick the first string value
      const first = Object.values(a).find((v) => typeof v === 'string');
      return first ? String(first) : 'on unspecified arguments';
  }
}
