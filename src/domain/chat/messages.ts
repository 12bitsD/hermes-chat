import type { Message } from '../../types';
import { createId, now } from '../ids';

export function makeUserMessage(content: string): Message {
  return { id: createId(), role: 'user', status: 'done', content, createdAt: now() };
}

export function makeAssistantMessage(content = ''): Message {
  return { id: createId(), role: 'assistant', status: 'streaming', content, createdAt: now() };
}
