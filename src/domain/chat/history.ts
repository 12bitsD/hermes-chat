import type { Message } from '../../types';

export type ChatHistoryMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export function buildChatHistory(
  messages: Message[],
  options: { systemPrompt?: string; skipMessageId?: string } = {},
): ChatHistoryMessage[] {
  const history: ChatHistoryMessage[] = [];
  const systemPrompt = options.systemPrompt?.trim();
  if (systemPrompt) history.push({ role: 'system', content: systemPrompt });

  for (const message of messages) {
    if (message.id === options.skipMessageId) continue;
    if (message.role === 'user' || message.role === 'assistant') {
      history.push({ role: message.role, content: message.content });
    }
  }

  return history;
}
