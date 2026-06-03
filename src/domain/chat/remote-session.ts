import type { Conversation, Message, Role } from '../../types';
import { DEFAULT_SESSION_TITLE } from '../../config/app-constants';
import { createId, now } from '../ids';

type RemoteMessage = Record<string, unknown>;

function asRecord(value: unknown): RemoteMessage {
  return value && typeof value === 'object' ? value as RemoteMessage : {};
}

function normalizeRole(role: unknown): Role {
  return role === 'assistant' || role === 'system' || role === 'user' ? role : 'user';
}

function normalizeContent(message: RemoteMessage): string {
  const content = message.content;
  const text = message.text;
  if (typeof content === 'string') return content;
  if (typeof text === 'string') return text;
  return '';
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return now();
}

export function normalizeRemoteMessage(value: unknown, index = 0, prefix = 'remote'): Message {
  const message = asRecord(value);
  const id = typeof message.id === 'string' && message.id.trim()
    ? message.id
    : createId(`${prefix}-${index}`);

  return {
    id,
    role: normalizeRole(message.role),
    content: normalizeContent(message),
    status: 'done',
    createdAt: normalizeTimestamp(message.created_at ?? message.createdAt),
  };
}

export function normalizeRemoteMessages(messages: unknown[] | null | undefined, prefix = 'remote'): Message[] {
  return (messages ?? [])
    .map((message, index) => normalizeRemoteMessage(message, index, prefix))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function mergeRemoteMessages(existing: Message[], remoteMessages: unknown[] | null | undefined) {
  const byId = new Map<string, Message>();
  for (const message of existing) byId.set(message.id, message);

  let added = 0;
  for (const message of normalizeRemoteMessages(remoteMessages, 'pull')) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
      added += 1;
    }
  }

  return {
    added,
    messages: Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt),
  };
}

export function createConversationFromRemoteSession(
  sessionId: string,
  title: string | null | undefined,
  messages: unknown[] | null | undefined,
): Conversation {
  const timestamp = now();
  return {
    id: sessionId,
    title: title || sessionId || DEFAULT_SESSION_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: normalizeRemoteMessages(messages, 'imported'),
  };
}
