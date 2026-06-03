/**
 * useNetworkStatus — reports `online: boolean` with live updates.
 *
 * Web: `navigator.onLine` + 'online'/'offline' window events.
 * Native: best-effort — we can't read `navigator.onLine` reliably on
 * React Native (it's polyfilled to `true` even when there's no
 * connection), so on native we trust whatever the controller's send
 * reports. This util is a no-op there.
 *
 * Why this is a hook instead of a context value: any component that
 * cares about connectivity re-renders on change. There are only a
 * few such components (the composer, the error bar), so the cost is
 * negligible.
 */
import { useEffect, useState } from 'react';

export function useNetworkStatus(): { online: boolean; lastChange: number } {
  const [state, setState] = useState<{ online: boolean; lastChange: number }>(() => ({
    online: typeof navigator === 'undefined' ? true : !!navigator.onLine,
    lastChange: Date.now(),
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = (online: boolean) => setState({ online, lastChange: Date.now() });
    const onOnline = () => update(true);
    const onOffline = () => update(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return state;
}
