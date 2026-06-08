/**
 * messageQueue — local outbox for user messages that failed to send
 * because the network (or the gateway) was unreachable.
 *
 * Why this exists
 * ───────────────
 * The chat turn service classifies network failures explicitly. When the
 * active endpoint is unreachable (no wifi, server down, tunnel closed), the
 * chat feature persists the turn here instead of dropping the message.
 *
 * This module persists the message text + attachments + conversation
 * id so the next time the browser fires an `online` event, we can
 * replay the message through the same pipeline. The user sees a
 * small "⏳ queued" badge on the message bubble until the replay
 * succeeds.
 *
 * Storage
 * ───────
 * AsyncStorage key: `hermes-chat:pending-queue`
 * Schema: { version: 1, items: QueuedMessage[] }
 *
 * Capacity
 * ───────
 * Hard cap at 100 messages. The 101st enqueue drops the oldest (FIFO)
 * so the queue never grows unbounded in long offline sessions.
 *
 * Flush strategy
 * ──────────────
 * - Triggers: app start (if queue non-empty), window 'online' event,
 *   manual `flushAll()` from the error bar.
 * - Order: FIFO (oldest first).
 * - Per-item: wait for retry backoff, replay through the chat send bus,
 *   then dequeue accepted sends or bump retry count. Exhausted entries
 *   are marked 'failed-queued'.
 *
 * Failure mode distinction (Phase 62 R3)
 * ───────────────────────────────────────
 * We only enqueue on `TypeError: Failed to fetch` (browser network
 * failure). Other errors (4xx, 5xx from the server, JSON parse, …)
 * are NOT queued — those indicate the user typed something the
 * server rejected and the user should see the error immediately.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'hermes-chat:pending-queue';
const MAX_QUEUE_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 4000, 16000]; // 1s, 4s, 16s

export interface QueuedMessage {
  /** Local message id (matches Message.id in the store). */
  id: string;
  /** Assistant bubble reserved for the retried response, if one was already rendered. */
  assistantMessageId?: string;
  /** Conversation id (activeConversationId at the time of enqueue). */
  conversationId: string;
  /** Text body. */
  text: string;
  /** File URIs/attachments (PickedFile snapshot). */
  files: Array<Record<string, unknown>>;
  /** When the user first hit send. */
  createdAt: number;
  /** Number of times we've tried to flush this entry. */
  retries: number;
}

interface QueueState {
  version: 1;
  items: QueuedMessage[];
}

let memoryCache: QueuedMessage[] | null = null;
let lastSnapshot: string = '';

async function loadFromDisk(): Promise<QueuedMessage[]> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryCache = [];
      return memoryCache;
    }
    const parsed = JSON.parse(raw) as QueueState;
    memoryCache = Array.isArray(parsed?.items) ? parsed.items : [];
    return memoryCache;
  } catch {
    memoryCache = [];
    return memoryCache;
  }
}

async function saveToDisk(items: QueuedMessage[]): Promise<void> {
  memoryCache = items;
  const snapshot = JSON.stringify({ version: 1, items });
  if (snapshot === lastSnapshot) return;
  lastSnapshot = snapshot;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, snapshot);
  } catch {
    // best effort
  }
}

/** Enqueue a message. Drops the oldest entry if the queue is full. */
export async function enqueue(msg: Omit<QueuedMessage, 'createdAt' | 'retries'>): Promise<QueuedMessage> {
  const items = await loadFromDisk();
  const entry: QueuedMessage = {
    ...msg,
    createdAt: Date.now(),
    retries: 0,
  };
  items.push(entry);
  if (items.length > MAX_QUEUE_SIZE) {
    items.splice(0, items.length - MAX_QUEUE_SIZE);
  }
  await saveToDisk(items);
  return entry;
}

/** Remove an entry by id. No-op if it doesn't exist. */
export async function dequeue(messageId: string): Promise<void> {
  const items = await loadFromDisk();
  const next = items.filter((m) => m.id !== messageId);
  if (next.length !== items.length) await saveToDisk(next);
}

/** Increment the retry counter for a message. */
export async function bumpRetry(messageId: string): Promise<void> {
  const items = await loadFromDisk();
  const next = items.map((m) => (m.id === messageId ? { ...m, retries: m.retries + 1 } : m));
  await saveToDisk(next);
}

/** List all queued messages (newest last). */
export async function list(): Promise<QueuedMessage[]> {
  return loadFromDisk();
}

/** Wipe the queue (used by Settings → Clear queue, future feature). */
export async function clearAll(): Promise<void> {
  await saveToDisk([]);
}

/** Compute the next backoff for a queued message, or null if it has
 *  exceeded MAX_RETRIES. */
export function nextBackoffMs(entry: QueuedMessage): number | null {
  if (entry.retries >= MAX_RETRIES) return null;
  return RETRY_BACKOFF_MS[entry.retries] ?? 60000;
}

export const QUEUE_MAX_SIZE = MAX_QUEUE_SIZE;
export const QUEUE_MAX_RETRIES = MAX_RETRIES;
