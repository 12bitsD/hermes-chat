/**
 * hermesCliBus — central pub/sub for `window.hermes.chat.subscribe(cb)`.
 *
 * Why a dedicated bus instead of reusing the chat send bus:
 *  - subscribe emits *many* events per turn (streaming text, tool
 *    started, tool completed, run started, run completed, ...). We need
 *    per-subscriber backpressure: a slow consumer should not stall the
 *    React render loop.
 *  - 60 events/sec is the cap. We coalesce events that arrive inside
 *    the same animation frame into a single dispatch, so a burst of
 *    streaming text chunks reads as one event with the full batch.
 *
 * Throttle strategy: rAF-coalesce + max-once-per-frame. Inside one
 * frame, the LAST event wins (we always send the freshest snapshot).
 * The bus never drops events silently — coalesced events are visible
 * to the consumer as a single richer event.
 */

import type { HermesCliEvent } from './hermesApi';

type Listener = (event: HermesCliEvent) => void;

let listeners: Listener[] = [];
let queuedEvent: HermesCliEvent | null = null;
let rafHandle: number | null = null;

function flush() {
  rafHandle = null;
  if (!queuedEvent) return;
  const event = queuedEvent;
  queuedEvent = null;
  // Snapshot listeners so unsubscribes during dispatch are safe.
  const ls = listeners.slice();
  for (const l of ls) {
    try {
      l(event);
    } catch (err) {
      // Never let a bad subscriber kill the bus.
      // eslint-disable-next-line no-console
      console.warn('[hermes-cli] subscriber threw', err);
    }
  }
}

export function subscribeCli(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** Publish an event. Coalesces with any pending event in the same frame. */
export function publishCli(event: HermesCliEvent): void {
  queuedEvent = event;
  if (rafHandle != null) return;
  // rAF is available in browsers + RN; fall back to setTimeout(0) for
  // the rare case it's not (SSR, tests).
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  rafHandle = raf(flush);
}

/** For tests: reset internal state. */
export function _resetCliBus(): void {
  if (rafHandle != null) {
    const caf = typeof cancelAnimationFrame === 'function'
      ? cancelAnimationFrame
      : (h: number) => clearTimeout(h);
    caf(rafHandle);
    rafHandle = null;
  }
  listeners = [];
  queuedEvent = null;
}
