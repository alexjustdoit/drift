import type { Capture, DayLog, LogEntry, TimeAuditEntry } from './types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

// ── Log ───────────────────────────────────────────────────────────────────────

export const postLog = (entry: LogEntry) =>
  req<{ ok: boolean; streak: number }>('/log', {
    method: 'POST',
    body: JSON.stringify(entry),
  })

export const getYesterday = () =>
  req<{ text: string | null }>('/yesterday')

export const getLogs = (days = 90) =>
  req<DayLog[]>(`/logs?days=${days}`)

// ── Capture ───────────────────────────────────────────────────────────────────

export const postCapture = (text: string, date?: string) =>
  req<{ ok: boolean }>('/capture', {
    method: 'POST',
    body: JSON.stringify({ text, date }),
  })

export const getCaptures = (limit = 20) =>
  req<Capture[]>(`/captures?limit=${limit}`)

export const getSurfacedInsight = () =>
  req<{ insight: string }>('/captures/surface')

export const archiveCapture = (id: string) =>
  req<{ ok: boolean }>(`/capture/${id}/archive`, { method: 'PATCH' })

export const extractTasks = (id: string) =>
  req<{ tasks: string[] }>(`/capture/${id}/extract-tasks`, { method: 'POST' })

export const addTodoistTasks = (tasks: string[]) =>
  req<{ ok: boolean; added: number }>('/todoist/tasks', {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  })

// ── AI ────────────────────────────────────────────────────────────────────────

export const postBreakdown = (task: string) =>
  req<{ steps: string[] }>('/breakdown', {
    method: 'POST',
    body: JSON.stringify({ task }),
  })

export const getAIReport = (days = 30) =>
  req<{ report: string }>(`/ai-report?days=${days}`)

// ── Time audit ────────────────────────────────────────────────────────────────

export const postTimeAudit = (entry: TimeAuditEntry) =>
  req<{ ok: boolean }>('/time-audit', {
    method: 'POST',
    body: JSON.stringify(entry),
  })

export const getTimeAudit = (days = 90) =>
  req<TimeAuditEntry[]>(`/time-audit?days=${days}`)
