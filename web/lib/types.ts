export interface LogEntry {
  date: string
  sleep_hours?: number
  sleep_quality?: number
  alcohol_last_night?: number
  morning_energy?: number
  meds_taken?: boolean
  stress_level?: number
  stress_note?: string
  exercise?: boolean
  exercise_minutes?: number
  caffeine_cups?: number
  midday_energy?: number
  midday_mood?: number
  working_on?: string
  afternoon_energy?: number
  mood_eod?: number
  focus_quality?: number
  win_of_day?: string
  where_left_off?: string
  notes?: string
}

export interface DayLog extends LogEntry {
  date: string
}

export interface Capture {
  id: string
  text: string
  date: string
  surfaced: boolean
  archived: boolean
}

export interface TimeAuditEntry {
  task: string
  date?: string
  planned_minutes: number
  actual_minutes: number
  productivity?: number
}
