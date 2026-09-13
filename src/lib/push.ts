import { saveDeviceToken } from './push.functions';

const appId = import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID'] as string | undefined;
const vapidKey = import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY'] as string | undefined;

const firebaseConfig = {
  apiKey: import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY'] as string | undefined,
  projectId: import.meta.env['VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID'] as string | undefined,
  appId,
  messagingSenderId: appId?.split(':')[1] ?? '',
};

export type PushResult =
  | { status: 'registered'; token: string }
  | { status: 'not-configured' | 'unsupported' | 'open-in-new-tab' | 'denied' };

/** Ask for notification permission and register this device for reminders. */
export async function enablePush(): Promise<PushResult> {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !appId || !vapidKey || !firebaseConfig.messagingSenderId) {
    return { status: 'not-configured' };
  }
  const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
  if (!('Notification' in window) || !(await isSupported())) return { status: 'unsupported' };
  if (window.top !== window.self) return { status: 'open-in-new-tab' };

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };

  const { initializeApp, getApps } = await import('firebase/app');
  const config = {
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    appId,
    messagingSenderId: firebaseConfig.messagingSenderId,
  };
  const query = new URLSearchParams(config).toString();
  const serviceWorkerRegistration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  const app = getApps()[0] ?? initializeApp(config);
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });
  if (!token) return { status: 'denied' };

  await saveDeviceToken({ data: { token, label: navigator.userAgent.slice(0, 120) } });
  return { status: 'registered', token };
}
