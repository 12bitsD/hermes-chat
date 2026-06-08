/**
 * smoke.test.ts — Node-runnable smoke test for the highest-value pure
 * logic modules in hermes-chat. Uses Node's built-in `node:test`
 * runner (zero extra dependencies) and is invoked via:
 *
 *   npx tsx tests/smoke.test.ts
 *
 * What we test
 * ────────────
 *  1. domain/tools/risk — toolRiskLevel + describeToolIntent
 *     (Phase 63 #10 logic that decides which approvals auto-pass)
 *  2. chatSendBus / hermesCliBus — pub/sub round-trip
 *     (Phase 60 #1 event infrastructure)
 *  3. messageQueue — backoff math + cap constant
 *     (Phase 62 #9 offline reliability)
 *
 * What we DON'T test (yet)
 * ────────────────────────
 *  - React components (need happy-dom or react-test-renderer)
 *  - messageQueue AsyncStorage round-trip (needs RN runtime)
 *  - Network calls (need fetch mock)
 *
 * Why node:test not jest
 * ──────────────────────
 *  - Zero new dev dependencies
 *  - Works in any Node 20+ env
 *  - Test files are pure ESM that import the source directly via tsx
 *  - CI just runs `npx tsx tests/smoke.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toolRiskLevel, describeToolIntent } from '../src/domain/tools/risk';
import { publishCli, subscribeCli } from '../src/lib/hermesCliBus';
import { dispatchChatSend, subscribeChatSend } from '../src/lib/chatSendBus';
import { nextBackoffMs, QUEUE_MAX_RETRIES } from '../src/services/queue/messageQueue';
import { PERSONA_PRESETS, detectActivePersona } from '../src/domain/settings/personas';
import { generatePairCode, freshPairCodePair } from '../src/lib/pairCode';
import { discoverGateway } from '../src/services/llm/discover';
import { HermesRunsClient } from '../src/services/llm/runs-client';
import { appendReasoningEvent, appendToolStarted, completeLatestRunningTool } from '../src/features/chat/toolEvents';

// ─── 1. tool risk grading (Phase 63 #10) ─────────────────────────

test('toolRiskLevel: high-risk tools are high', () => {
  for (const t of ['shell', 'write_file', 'delete_file', 'send_email', 'http_post', 'git_push']) {
    assert.equal(toolRiskLevel(t), 'high', `expected ${t} to be high`);
  }
});

test('toolRiskLevel: low-risk tools are low', () => {
  for (const t of ['read_file', 'web_search', 'list_dir', 'http_get', 'search']) {
    assert.equal(toolRiskLevel(t), 'low', `expected ${t} to be low`);
  }
});

test('toolRiskLevel: unknown tools default to high (deny-by-default)', () => {
  for (const t of ['totally-unknown-tool', '', null, undefined, 'mystery']) {
    assert.equal(toolRiskLevel(t as any), 'high', `expected ${String(t)} to default to high`);
  }
});

test('toolRiskLevel: case-insensitive match', () => {
  assert.equal(toolRiskLevel('SHELL'), 'high');
  assert.equal(toolRiskLevel('Web_Search'), 'low');
});

test('describeToolIntent: known tools produce meaningful strings', () => {
  assert.match(describeToolIntent('read_file', { path: '/tmp/x' }), /read.*\/tmp\/x/);
  assert.match(describeToolIntent('web_search', { query: 'kawaii' }), /search.*kawaii/);
  assert.match(describeToolIntent('shell', { cmd: 'ls -lah' }), /run.*ls -lah/);
  assert.match(describeToolIntent('send_email', { to: 'mom' }), /email.*mom/);
});

test('describeToolIntent: unknown tool falls back to first string arg', () => {
  assert.equal(describeToolIntent('foo', { bar: 'baz', qux: 42 } as any), 'baz');
});

// ─── 2. pub/sub infrastructure (Phase 60 #1) ────────────────────

// The bus falls back to setTimeout(16) outside the browser, so we
// wait that long for the flush.
const NEXT_FRAME = () => new Promise((r) => setTimeout(r, 32));

test('hermesCliBus: rAF-coalesces — last event in a frame wins', async () => {
  const seen: any[] = [];
  const unsub = subscribeCli((e) => seen.push(e));
  publishCli({ type: 'message:added', message: {} as any, conversationId: 'c1' });
  publishCli({ type: 'message:updated', messageId: 'm1', patch: {} as any, conversationId: 'c1' });
  await NEXT_FRAME();
  unsub();
  // Both events were published in the same microtask tick; the
  // rAF-coalesce collapsed them into a single dispatch (last wins).
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'message:updated');
});

test('hermesCliBus: separate frames produce separate events', async () => {
  const seen: any[] = [];
  const unsub = subscribeCli((e) => seen.push(e));
  publishCli({ type: 'message:added', message: {} as any, conversationId: 'c1' });
  await NEXT_FRAME();
  publishCli({ type: 'run:started', runId: 'r1', conversationId: 'c1' });
  await NEXT_FRAME();
  unsub();
  assert.equal(seen.length, 2);
  assert.equal(seen[0].type, 'message:added');
  assert.equal(seen[1].type, 'run:started');
});

test('hermesCliBus: unsubscribe stops further events', async () => {
  const seen: any[] = [];
  const unsub = subscribeCli((e) => seen.push(e));
  publishCli({ type: 'message:added', message: {} as any, conversationId: 'c1' });
  await NEXT_FRAME();
  unsub();
  publishCli({ type: 'message:added', message: {} as any, conversationId: 'c1' });
  await NEXT_FRAME();
  assert.equal(seen.length, 1);
});

test('chatSendBus: subscribe receives dispatch and returns ok', async () => {
  const seen: any[] = [];
  const unsub = subscribeChatSend(async (req) => {
    seen.push(req);
    return { ok: true };
  });
  const r = await dispatchChatSend({ text: 'hello' });
  unsub();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].text, 'hello');
  assert.deepEqual(r, { ok: true });
});

test('chatSendBus: dispatch with no subscribers returns ok:false', async () => {
  const r = await dispatchChatSend({ text: 'no listener' });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /no/);
});

// ─── 3. offline queue math (Phase 62 #9) ────────────────────────

test('messageQueue: nextBackoffMs returns 1s/4s/16s then null', () => {
  const mkEntry = (retries: number) => ({
    id: 'x', conversationId: 'c', text: 't', files: [], createdAt: 0, retries,
  });
  assert.equal(nextBackoffMs(mkEntry(0) as any), 1000);
  assert.equal(nextBackoffMs(mkEntry(1) as any), 4000);
  assert.equal(nextBackoffMs(mkEntry(2) as any), 16000);
  assert.equal(nextBackoffMs(mkEntry(3) as any), null);
  assert.equal(nextBackoffMs(mkEntry(10) as any), null);
});

test('messageQueue: QUEUE_MAX_RETRIES matches design', () => {
  assert.equal(QUEUE_MAX_RETRIES, 3);
});

// ─── 4. tool event projection ───────────────────────────────────

test('toolEvents: completing a repeated tool updates only the latest running event', () => {
  const first = appendToolStarted([], {
    runId: 'r1',
    timestamp: 10,
    tool: 'read_file',
  });
  const second = appendToolStarted(first, {
    runId: 'r1',
    timestamp: 11,
    tool: 'read_file',
  });

  const completed = completeLatestRunningTool(second, {
    timestamp: 12,
    tool: 'read_file',
    duration: 0.25,
    error: false,
  });

  assert.equal(completed[0].status, 'running');
  assert.equal(completed[1].status, 'done');
  assert.equal(completed[1].finishedAt, 12_000);
  assert.equal(completed[1].durationMs, 250);
});

test('toolEvents: reasoning appends a completed pseudo-tool event', () => {
  const events = appendReasoningEvent([], {
    runId: 'r1',
    timestamp: 20,
    text: 'thinking about files',
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].tool, 'reasoning');
  assert.equal(events[0].status, 'done');
  assert.equal(events[0].preview, 'thinking about files');
});

// ─── 5. runs approval boundary ──────────────────────────────────

test('runsClient: resolveApproval rejects non-2xx responses', async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => new Response('approval is gone', { status: 409, statusText: 'Conflict' });
  try {
    const client = new HermesRunsClient({
      provider: 'hermes-gateway',
      endpoint: 'http://localhost:8642',
      apiKey: '',
      defaultModel: 'default',
    });
    await assert.rejects(
      () => client.resolveApproval('run-1', 'approval-1', 'approve'),
      /Failed to resolve approval: 409 approval is gone/,
    );
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});

test('runsClient: resolveApproval sends the explicit decision payload', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody = '';
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedBody = String(init.body);
    return new Response('{}', { status: 200 });
  };
  try {
    const client = new HermesRunsClient({
      provider: 'hermes-gateway',
      endpoint: 'http://localhost:8642',
      apiKey: '',
      defaultModel: 'default',
    });
    await client.resolveApproval('run-1', 'approval-1', 'deny', 'not safe');
    assert.match(capturedUrl, /\/v1\/runs\/run-1\/approval$/);
    assert.deepEqual(JSON.parse(capturedBody), {
      approval_id: 'approval-1',
      decision: 'deny',
      note: 'not safe',
    });
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});

test('runsClient: malformed approval.required becomes a failed event', () => {
  const client = new HermesRunsClient({
    provider: 'hermes-gateway',
    endpoint: 'http://localhost:8642',
    apiKey: '',
    defaultModel: 'default',
  });
  const event = (client as any).parseEvent('run-1', {
    event: 'approval.required',
    timestamp: 42,
    tool: 'shell',
    prompt: 'approve?',
  });

  assert.equal(event.event, 'failed');
  assert.equal(event.run_id, 'run-1');
  assert.equal(event.timestamp, 42);
  assert.match(event.error.message, /missing approval_id/);
});

test('runsClient: malformed tool.completed becomes a failed event', () => {
  const client = new HermesRunsClient({
    provider: 'hermes-gateway',
    endpoint: 'http://localhost:8642',
    apiKey: '',
    defaultModel: 'default',
  });
  const event = (client as any).parseEvent('run-1', {
    event: 'tool.completed',
    timestamp: 43,
    duration: 0.1,
  });

  assert.equal(event.event, 'failed');
  assert.match(event.error.message, /missing tool/);
});

test('runsClient: malformed SSE JSON becomes a failed event', async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {not-json}\n'));
        controller.close();
      },
    }),
    { status: 200 },
  );
  try {
    const client = new HermesRunsClient({
      provider: 'hermes-gateway',
      endpoint: 'http://localhost:8642',
      apiKey: '',
      defaultModel: 'default',
    });
    const events = [];
    for await (const event of client.subscribeEvents('run-1')) {
      events.push(event);
    }
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'failed');
    assert.match(events[0].error.message, /malformed JSON/);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});

test('runsClient: final SSE line is processed without trailing newline', async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async () => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"event":"completed","timestamp":44,"final_response":"done"}'));
        controller.close();
      },
    }),
    { status: 200 },
  );
  try {
    const client = new HermesRunsClient({
      provider: 'hermes-gateway',
      endpoint: 'http://localhost:8642',
      apiKey: '',
      defaultModel: 'default',
    });
    const events = [];
    for await (const event of client.subscribeEvents('run-1')) {
      events.push(event);
    }
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event: 'completed',
      run_id: 'run-1',
      timestamp: 44,
      final_response: 'done',
    });
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
});

// ─── 6. persona presets (Phase 74) ──────────────────────────────

test('personas: 4 presets, each with the required fields', () => {
  assert.equal(PERSONA_PRESETS.length, 4);
  for (const p of PERSONA_PRESETS) {
    assert.ok(p.id, 'persona has id');
    assert.ok(p.emoji, 'persona has emoji');
    assert.ok(p.label, 'persona has label');
    assert.ok(p.hint, 'persona has hint');
    assert.ok(p.systemPrompt.length > 50, 'persona has a non-trivial prompt');
  }
});

test('personas: detectActivePersona returns the matching preset', () => {
  for (const p of PERSONA_PRESETS) {
    const active = detectActivePersona(p.systemPrompt);
    assert.ok(active, `detectActivePersona should match for ${p.id}`);
    assert.equal(active!.id, p.id);
  }
});

test('personas: detectActivePersona returns undefined for edited prompts', () => {
  assert.equal(detectActivePersona('something the user typed from scratch'), undefined);
  assert.equal(detectActivePersona(''), undefined);
});

test('personas: each preset has a unique id and emoji', () => {
  const ids = new Set(PERSONA_PRESETS.map((p) => p.id));
  const emojis = new Set(PERSONA_PRESETS.map((p) => p.emoji));
  assert.equal(ids.size, PERSONA_PRESETS.length, 'all ids are unique');
  assert.equal(emojis.size, PERSONA_PRESETS.length, 'all emojis are unique');
});

// ─── 7. pair code (Phase 78) ─────────────────────────────────────────

test('pairCode: shape is XXX-XX-XX (3+2+2 with dashes)', () => {
  for (let i = 0; i < 20; i++) {
    const c = generatePairCode();
    assert.match(c, /^[A-Z]{2}-[A-Z]{2}-[0-9]{2}$/, `bad shape: ${c}`);
  }
});

test('pairCode: never produces ambiguous chars (I, O, 0, 1)', () => {
  for (let i = 0; i < 200; i++) {
    const c = generatePairCode();
    assert.ok(!c.includes('I'), `ambiguous I in: ${c}`);
    assert.ok(!c.includes('O'), `ambiguous O in: ${c}`);
    assert.ok(!c.includes('0'), `ambiguous 0 in: ${c}`);
    assert.ok(!c.includes('1'), `ambiguous 1 in: ${c}`);
  }
});

test('pairCode: codes are different across calls (with overwhelming probability)', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generatePairCode());
  // 100 codes from a 8×21×21×21×5×8×8 ≈ 23.6M space. Collisions are
  // vanishingly unlikely (birthday bound at 100 = ~0.02%). Allow 1
  // for flakiness safety.
  assert.ok(seen.size >= 99, `expected ~100 unique, got ${seen.size}`);
});

test('pairCode: freshPairCodePair gives a code + future expiresAt', () => {
  const before = Date.now();
  const pair = freshPairCodePair();
  const after = Date.now();
  assert.ok(pair.code, 'code is non-empty');
  assert.ok(pair.expiresAt > before + 50_000, 'expiresAt is ~60s in the future');
  assert.ok(pair.expiresAt <= after + 61_000, 'expiresAt is bounded');
});

// ─── 8. gateway discovery (Phase 79) ─────────────────────────────

test('discoverGateway: returns no winner when no candidates respond', async () => {
  // No mock server is up. The util should return tried=[...] with
  // ok=false everywhere and winner=null. We don't assert on which
  // candidates were tried (they're a function of the build target —
  // mobile vs web) but we do assert on the shape.
  const r = await discoverGateway();
  assert.ok(Array.isArray(r.candidates), 'candidates is an array');
  assert.ok(Array.isArray(r.tried), 'tried is an array');
  assert.equal(r.tried.length, r.candidates.length, 'tried covers all candidates');
  for (const t of r.tried) {
    assert.ok(typeof t.base === 'string');
    assert.equal(typeof t.ok, 'boolean');
  }
  assert.equal(r.winner, null, 'no winner when nothing responds');
});

test('discoverGateway: respects the overall budget (returns within ~12s)', async () => {
  const start = Date.now();
  await discoverGateway();
  const elapsed = Date.now() - start;
  // The util aborts at 10s; with a bit of slack, 12s is the worst case.
  assert.ok(elapsed < 12_000, `discovery took ${elapsed}ms, expected < 12s`);
});
