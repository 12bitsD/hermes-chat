/**
 * Mock LLM client — same surface as the real one, used when no real backend
 * is reachable (or the user has explicitly chosen "mock" in settings).
 *
 * Streams a char-by-char reply with a small per-char delay so the UI can
 * exercise its streaming code paths.
 */

import type { LLMClient, LLMStreamRequest, LLMStreamHandlers } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockLLMClient implements LLMClient {
  readonly id = 'mock' as const;
  readonly displayName = 'Mock (offline)';

  async isReachable(): Promise<boolean> {
    return true; // always reachable — it's an in-process generator
  }

  async streamChat(req: LLMStreamRequest, h: LLMStreamHandlers): Promise<void> {
    const userText = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const reply = craftMock(userText);

    // Per-char streaming, ~12ms between chunks; abortable.
    let acc = '';
    const step = 2; // emit 2 chars at a time so long replies don't take forever
    for (let i = 0; i < reply.length; i += step) {
      if (req.signal?.aborted) {
        return; // silent cancel — UI will see partial content already rendered
      }
      const slice = reply.slice(i, i + step);
      acc += slice;
      h.onChunk(slice);
      await sleep(12);
    }
    h.onDone(acc);
  }
}

function craftMock(input: string): string {
  const lower = input.toLowerCase();
  if (!input.trim()) {
    return `Hi! I'm Hermes (mock). Try asking me to:
- *explain* a concept
- *write code* in Python / TS
- *summarize* a paragraph
- *translate* something`;
  }
  if (lower.includes('code') || lower.includes('python') || lower.includes('javascript') || lower.includes('typescript')) {
    return `Sure — here's a tiny example:

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

You can run it with:
\`\`\`bash
npx ts-node greet.ts
\`\`\`
`;
  }
  if (lower.includes('hello') || lower.includes('hi ') || lower.startsWith('hi')) {
    return `Hey! What's on your mind?`;
  }
  if (lower.includes('explain') || lower.includes('what is') || lower.includes('how does')) {
    return `Here's the gist:

1. The thing exists in two states: **off** and **on**.
2. To move between them, you need *energy* and a *trigger*.
3. The trigger has to be **specific** to the state you want.

That's it — the rest is details. Want me to go deeper?`;
  }
  if (lower.includes('markdown')) {
    return `Markdown I render:

| Feature | Status |
|---|---|
| Headings | ✅ |
| Lists | ✅ |
| Code blocks | ✅ |
| Tables | ✅ |
| HTML | ⏳ |
| Math | ⏳ |
`;
  }
  if (lower.includes('hermes')) {
    return `Hermes is a Hermes-style chatbot runtime — think *OpenAI-compatible API surface* but with personality.

Try me again with "code" or "explain" and I'll switch gears.`;
  }
  return `Echo: **${input}**

_(This is a mock response. Configure a real Hermes gateway in Settings → Provider.)_`;
}
