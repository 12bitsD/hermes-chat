import type { PromptTemplate } from '../../types';
import { createId, now } from '../ids';

export function createSeedPrompts(): PromptTemplate[] {
  const createdAt = now();
  return [
    {
      id: createId(),
      title: 'Explain like I\'m 5',
      body: 'Explain the following concept as if I were 5 years old, with one concrete example:\n\n{{topic}}',
      category: 'Learning',
      pinned: true,
      usageCount: 0,
      createdAt,
    },
    {
      id: createId(),
      title: 'Code review',
      body: 'Review this code for bugs, performance, and readability. Be specific — quote line numbers and propose exact edits:\n\n```\n{{code}}\n```',
      category: 'Coding',
      usageCount: 0,
      createdAt,
    },
    {
      id: createId(),
      title: 'Summarize article',
      body: 'Summarize the following article in 5 bullet points and one closing one-sentence takeaway:\n\n{{article}}',
      category: 'Reading',
      usageCount: 0,
      createdAt,
    },
    {
      id: createId(),
      title: 'Brainstorm names',
      body: 'Brainstorm 10 product name ideas for: {{product}}. Each should be 1-2 syllables, easy to spell, no trademark conflicts in tech.',
      category: 'Product',
      usageCount: 0,
      createdAt,
    },
    {
      id: createId(),
      title: 'Translate CN→EN',
      body: 'Translate the following Chinese text into natural, idiomatic English (not literal):\n\n{{text}}',
      category: 'Language',
      usageCount: 0,
      createdAt,
    },
  ];
}
