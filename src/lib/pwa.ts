const SW_URL = '/sw.js';

function isRefusedContext(): boolean {
  if (typeof window === 'undefined') return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  const blockedHost =
    host.startsWith('id-preview--') ||
    host.startsWith('preview--') ||
    host === 'lovableproject.com' ||
    host.endsWith('.lovableproject.com') ||
    host === 'lovableproject-dev.com' ||
    host.endsWith('.lovableproject-dev.com') ||
    host === 'beta.lovable.dev' ||
    host.endsWith('.beta.lovable.dev');
  if (blockedHost) return true;
  return new URLSearchParams(window.location.search).get('sw') === 'off';
}

async function unregisterAppWorker() {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((registration) => {
        const url =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL ??
          '';
        return url.endsWith(SW_URL);
      })
      .map((registration) => registration.unregister()),
  );
}

/** Registers the offline service worker, but never in dev or Lovable preview. */
export async function setupServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (isRefusedContext()) {
    await unregisterAppWorker().catch(() => undefined);
    return;
  }
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch {
    /* offline support is optional */
  }
}
