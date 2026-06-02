/**
 * Tiny perf helpers — anything that needs to be measured, throttled, or
 * memoisable across re-renders lives here.
 */

/**
 * Trailing-edge throttle. Calls `fn` at most once per `ms` window, with the
 * last args seen during the cooldown. Returns a stable function suitable
 * for use as an event handler.
 *
 * Used in the streaming path so markdown re-parses at most every 50ms even
 * if upstream chunks arrive every 10ms.
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let pending: any[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
      return;
    }
    pending = args;
    if (!timer) {
      const wait = ms - (now - lastCall);
      timer = setTimeout(() => {
        timer = null;
        lastCall = Date.now();
        if (pending) {
          const a = pending; pending = null;
          fn(...a);
        }
      }, wait);
    }
  }) as T;
}

/**
 * Cache the last argument reference and skip if the next call passes the
 * same value. Useful for memoizing component re-renders keyed on
 * `message.content` while streaming.
 */
export function shallowEq<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  const ka = Object.keys(a as any), kb = Object.keys(b as any);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if ((a as any)[k] !== (b as any)[k]) return false;
  return true;
}
