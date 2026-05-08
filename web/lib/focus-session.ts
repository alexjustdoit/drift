const API_URL = process.env.NEXT_PUBLIC_API_URL!

export interface ActiveSession {
  task: string
  phase: 'running' | 'paused'
  end_time_ms?: number
  total_seconds: number
  remaining_seconds?: number
}

export async function postSession(session: ActiveSession): Promise<void> {
  fetch(`${API_URL}/focus/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  }).catch(() => {})
}

export async function clearSession(): Promise<void> {
  fetch(`${API_URL}/focus/session`, { method: 'DELETE' }).catch(() => {})
}

export async function fetchSession(): Promise<ActiveSession | null> {
  try {
    const res = await fetch(`${API_URL}/focus/session`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data.task ? (data as ActiveSession) : null
  } catch {
    return null
  }
}
