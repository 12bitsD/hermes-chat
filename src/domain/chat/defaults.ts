import type { Conversation } from '../../types';
import { WELCOME_SESSION_TITLE } from '../../config/app-constants';
import { createId, now } from '../ids';

export function createSeedConversation(): Conversation {
  const createdAt = now();
  return {
    id: createId(),
    title: WELCOME_SESSION_TITLE,
    createdAt,
    updatedAt: createdAt,
    messages: [
      {
        id: createId(),
        role: 'system',
        status: 'done',
        createdAt: createdAt - 6000,
        content: `# Welcome to Hermes Chat ✦

A clean little chatbot client for talking to **Hermes** — built with Expo + React Native.

## What works in this build

- Flat kawaii aesthetic 🌸
- Mock streaming LLM responses
- Markdown rendering (headings / lists / code / tables / blockquote)
- Right-side prompt template navigator
- Voice + image attachments (mocked in web)
- Multiple conversations

## What doesn't yet

- Real Hermes backend (still mock)
- PDF / PPT in-line preview
- Real illustrations on every screen
`,
      },
    ],
  };
}
