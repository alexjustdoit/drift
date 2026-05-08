const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const API_URL = process.env.NEXT_PUBLIC_API_URL!

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i)
  return buf
}

export async function ensurePushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined') return null
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return null
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  } catch {
    return null
  }
}

export async function schedulePush(endTimeMs: number, task: string): Promise<void> {
  const sub = await ensurePushSubscription()
  if (!sub) return
  fetch(`${API_URL}/push/timer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ end_time_ms: endTimeMs, task, subscription: sub.toJSON() }),
  }).catch(() => {})
}

export async function cancelPush(): Promise<void> {
  fetch(`${API_URL}/push/cancel`, { method: 'POST' }).catch(() => {})
}
