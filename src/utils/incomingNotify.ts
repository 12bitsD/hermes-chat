/**
 * incomingNotify — fire a lightweight "agent finished, you weren't
 * looking" indicator the moment a streaming turn completes.
 *
 * Layers (best-effort, all silently fall through on failure):
 *   1. Web tab title: flash a bell-prefixed title when the page is
 *      hidden, restore the original title on focus or when the bus is
 *      called again.
 *   2. Web Notification API: when permission has been granted, raise
 *      a real OS notification. Click focuses the tab.
 *
 * Native platforms: this util is a no-op (title flashing is a
 * browser concept; native push lives behind expo-notifications and
 * is out of scope for this util).
 */

declare const Notification: {
  new (title: string, options?: any): Notification;
  permission: 'default' | 'granted' | 'denied';
  requestPermission?: () => Promise<'default' | 'granted' | 'denied'>;
};

interface NotificationHandle {
  close(): void;
  onclick: ((e: Event) => void) | null;
}

let originalTitle = '';
let flashInterval: ReturnType<typeof setInterval> | null = null;

export function incomingNotify(opts: { conversationTitle?: string; preview?: string }): void {
  if (typeof document === 'undefined') return;
  const convo = (opts.conversationTitle || 'Hermes').trim().slice(0, 24) || 'Hermes';
  const preview = (opts.preview || 'New message').trim().slice(0, 80);

  // 1) Tab title flash — only when the page is hidden. Flashing while
  //    the user is already looking is just noise.
  if (document.hidden) {
    if (!originalTitle) originalTitle = document.title;
    let toggles = 0;
    if (flashInterval) clearInterval(flashInterval);
    flashInterval = setInterval(() => {
      document.title =
        toggles % 2 === 0 ? `🔔 ${convo} · ${preview}` : originalTitle || 'Hermes Chat';
      toggles += 1;
      if (toggles >= 6) {
        if (flashInterval) clearInterval(flashInterval);
        flashInterval = null;
      }
    }, 1100);
  }

  // 2) Web Notification API
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(`💬 ${convo}`, {
        body: preview,
        tag: `hermes-${convo}`,
        silent: false,
      }) as unknown as NotificationHandle;
      n.onclick = () => {
        try { window.focus(); } catch { /* ignore */ }
        try { n.close(); } catch { /* ignore */ }
      };
      setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 8000);
    }
  } catch {
    // ignore
  }
}

/** Restore the original tab title. Call from the page's visibilitychange handler. */
export function clearIncomingFlash(): void {
  if (typeof document === 'undefined') return;
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  if (originalTitle) {
    document.title = originalTitle;
    originalTitle = '';
  }
}

export async function requestIncomingPermission(): Promise<'granted' | 'denied' | 'default' | 'unavailable'> {
  if (typeof Notification === 'undefined') return 'unavailable';
  if (!Notification.requestPermission) return Notification.permission as any;
  try {
    return (await Notification.requestPermission()) as any;
  } catch {
    return 'denied';
  }
}
