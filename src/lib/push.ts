import { supabase } from './supabase';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushConfigured = Boolean(VAPID);

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

/** Is this device currently subscribed? */
export async function isPushOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await registration();
  return Boolean(await reg.pushManager.getSubscription());
}

/** Asks permission, subscribes this device and stores the subscription. */
export async function enablePush(userId: string): Promise<'on' | 'blocked'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'blocked';
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID!) }));
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').insert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  // 23505 = this device is already registered.
  if (error && error.code !== '23505') throw error;
  return 'on';
}

/** Unsubscribes this device only (other devices keep their subscriptions). */
export async function disablePush() {
  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
