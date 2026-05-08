import type { DayLog } from './types'

const LOGS_CACHE_KEY = 'drift_logs_cache'
const CACHE_EXPIRY_MS = 12 * 60 * 60 * 1000 // 12 hours

export interface LogsCache {
  logs: DayLog[]
  timestamp: number
}

export function getCachedLogs(): DayLog[] | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(LOGS_CACHE_KEY)
    if (!cached) return null
    const data: LogsCache = JSON.parse(cached)
    if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) return null
    return data.logs
  } catch {
    return null
  }
}

export function setCachedLogs(logs: DayLog[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOGS_CACHE_KEY, JSON.stringify({ logs, timestamp: Date.now() }))
  } catch {
    // quota exceeded or other error, silently fail
  }
}

export function getTodayFromCache(today: string): DayLog | null {
  const cached = getCachedLogs()
  if (!cached) return null
  return cached.find(l => l.date === today) ?? null
}
