'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { getLogs, getYesterday, postLog } from '@/lib/api'
import { getCachedLogs, setCachedLogs, getTodayFromCache } from '@/lib/cache'
import type { DayLog, LogEntry } from '@/lib/types'

type Tab = 'morning' | 'evening'

// ── Step dots ─────────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-full transition-all duration-300',
            i < current
              ? 'w-2 h-2 bg-primary'
              : i === current
              ? 'w-3 h-3 bg-primary ring-2 ring-primary/30'
              : 'w-2 h-2 bg-border'
          )}
        />
      ))}
    </div>
  )
}

// ── Rating buttons ─────────────────────────────────────────────────────────────

const RATING_LABELS: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' }

function Rating({
  value,
  onChange,
  label,
  low = 'low',
  high = 'high',
  emoji = false,
  anchors,
}: {
  value: number | null
  onChange: (v: number) => void
  label: string
  low?: string
  high?: string
  emoji?: boolean
  anchors?: [string, string, string, string, string]
}) {
  return (
    <div>
      <p className="text-base font-medium mb-4">{label}</p>
      <div className="flex gap-3">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'flex-1 h-14 rounded-xl border-2 text-sm font-bold transition-all duration-150 flex flex-col items-center justify-center gap-0.5',
              value === n
                ? 'bg-primary border-primary text-primary-foreground scale-105 shadow-lg shadow-primary/25'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-secondary/50'
            )}
          >
            {emoji && <span className="text-base">{RATING_LABELS[n]}</span>}
            <span>{n}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-2 px-1 min-h-[1rem]">
        {anchors && value !== null
          ? <span className="w-full text-center text-xs font-medium text-primary">{anchors[value - 1]}</span>
          : <>
              <span className="text-xs text-muted-foreground/60">{low}</span>
              <span className="text-xs text-muted-foreground/60">{high}</span>
            </>
        }
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-4 rounded-xl border-2 text-base font-medium transition-all',
        checked ? 'bg-primary/10 border-primary/50 text-primary' : 'border-border text-foreground hover:border-primary/30 hover:bg-secondary/30'
      )}
    >
      <span className={cn(
        'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors',
        checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'
      )}>
        {checked && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
      </span>
      {label}
    </button>
  )
}

// ── Morning steps ─────────────────────────────────────────────────────────────

interface MorningData {
  sleep_hours: string
  sleep_quality: number | null
  alcohol_last_night: number
  morning_energy: number | null
  meds_taken: boolean
  stress_level: number | null
  stress_note: string
}

function MorningFlow({ onSubmit, initialData }: { onSubmit: (data: Partial<LogEntry>) => void; initialData?: DayLog | null }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<MorningData>({
    sleep_hours: initialData?.sleep_hours != null ? String(initialData.sleep_hours) : '',
    sleep_quality: initialData?.sleep_quality ?? null,
    alcohol_last_night: initialData?.alcohol_last_night ?? 0,
    morning_energy: initialData?.morning_energy ?? null,
    meds_taken: initialData?.meds_taken ?? false,
    stress_level: initialData?.stress_level ?? null,
    stress_note: initialData?.stress_note ?? '',
  })

  const steps = [
    {
      title: 'How was your sleep?',
      content: (
        <div className="flex flex-col gap-7">
          <div>
            <p className="text-base font-medium mb-3">Hours slept</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                placeholder="e.g. 7.5"
                value={data.sleep_hours}
                onChange={e => setData(d => ({ ...d, sleep_hours: e.target.value }))}
                className="w-32 text-center text-xl h-14 font-semibold"
              />
              <span className="text-muted-foreground">hours</span>
            </div>
          </div>
          <Rating
            label="Sleep quality"
            value={data.sleep_quality}
            onChange={v => setData(d => ({ ...d, sleep_quality: v }))}
            low="poor"
            high="great"
            emoji
            anchors={['Terrible', 'Poor', 'Fair', 'Good', 'Great']}
          />
          <div>
            <p className="text-base font-medium mb-3">Alcohol last night</p>
            <div className="flex gap-2">
              {(['None', 'Light', 'Moderate', 'Heavy'] as const).map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setData(d => ({ ...d, alcohol_last_night: i }))}
                  className={cn(
                    'flex-1 h-12 rounded-xl border-2 text-xs font-semibold transition-all',
                    data.alcohol_last_night === i
                      ? 'bg-primary border-primary text-primary-foreground scale-105'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Morning vitals',
      content: (
        <div className="flex flex-col gap-7">
          <Rating
            label="Morning energy"
            value={data.morning_energy}
            onChange={v => setData(d => ({ ...d, morning_energy: v }))}
            low="drained"
            high="charged"
            emoji
            anchors={['Exhausted', 'Low', 'Okay', 'Good', 'Wired']}
          />
          <Toggle
            checked={data.meds_taken}
            onChange={v => setData(d => ({ ...d, meds_taken: v }))}
            label="Meds taken today"
          />
        </div>
      ),
    },
    {
      title: 'Stress check',
      content: (
        <div className="flex flex-col gap-6">
          <Rating
            label="Anxiety / stress level"
            value={data.stress_level}
            onChange={v => setData(d => ({ ...d, stress_level: v }))}
            low="calm"
            high="maxed"
            emoji
            anchors={['Calm', 'Mild', 'Tense', 'High', 'Maxed']}
          />
          <div>
            <p className="text-base font-medium mb-1">What&apos;s on your mind? <span className="text-muted-foreground font-normal">(optional)</span></p>
            <Textarea
              placeholder="Anything specific driving it..."
              value={data.stress_note}
              onChange={e => setData(d => ({ ...d, stress_note: e.target.value }))}
              rows={3}
              className="text-base resize-none"
            />
          </div>
        </div>
      ),
    },
  ]

  const isLast = step === steps.length - 1

  function handleNext() {
    if (isLast) {
      onSubmit({
        sleep_hours: data.sleep_hours ? parseFloat(data.sleep_hours) : undefined,
        sleep_quality: data.sleep_quality ?? undefined,
        alcohol_last_night: data.alcohol_last_night ?? 0,
        morning_energy: data.morning_energy ?? undefined,
        meds_taken: data.meds_taken,
        stress_level: data.stress_level ?? undefined,
        stress_note: data.stress_note || undefined,
      })
    } else {
      setStep(s => s + 1)
    }
  }

  return <StepShell steps={steps} step={step} setStep={setStep} onNext={handleNext} isLast={isLast} />
}

// ── Evening steps ─────────────────────────────────────────────────────────────

interface EveningData {
  afternoon_energy: number | null
  mood_eod: number | null
  focus_quality: number | null
  exercise: boolean
  exercise_minutes: string
  caffeine_cups: string
  win_of_day: string
  where_left_off: string
  notes: string
}

function EveningFlow({ onSubmit, initialData }: { onSubmit: (data: Partial<LogEntry>) => void; initialData?: DayLog | null }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<EveningData>({
    afternoon_energy: initialData?.afternoon_energy ?? null,
    mood_eod: initialData?.mood_eod ?? null,
    focus_quality: initialData?.focus_quality ?? null,
    exercise: initialData?.exercise ?? false,
    exercise_minutes: initialData?.exercise_minutes != null ? String(initialData.exercise_minutes) : '',
    caffeine_cups: initialData?.caffeine_cups != null ? String(initialData.caffeine_cups) : '',
    win_of_day: initialData?.win_of_day ?? '',
    where_left_off: initialData?.where_left_off ?? '',
    notes: initialData?.notes ?? '',
  })

  const steps = [
    {
      title: 'End of day energy',
      content: (
        <div className="flex flex-col gap-7">
          <Rating
            label="Afternoon energy"
            value={data.afternoon_energy}
            onChange={v => setData(d => ({ ...d, afternoon_energy: v }))}
            low="drained"
            high="charged"
            emoji
            anchors={['Exhausted', 'Low', 'Okay', 'Good', 'Wired']}
          />
          <Rating
            label="Overall mood"
            value={data.mood_eod}
            onChange={v => setData(d => ({ ...d, mood_eod: v }))}
            low="rough"
            high="great"
            emoji
            anchors={['Awful', 'Low', 'Neutral', 'Good', 'Great']}
          />
        </div>
      ),
    },
    {
      title: 'How was your focus?',
      content: (
        <Rating
          label="Focus quality today"
          value={data.focus_quality}
          onChange={v => setData(d => ({ ...d, focus_quality: v }))}
          low="scattered"
          high="locked in"
          emoji
          anchors={['Scattered', 'Off', 'Okay', 'Sharp', 'Flow']}
        />
      ),
    },
    {
      title: 'Movement & caffeine',
      content: (
        <div className="flex flex-col gap-5">
          <Toggle
            checked={data.exercise}
            onChange={v => setData(d => ({ ...d, exercise: v }))}
            label="I exercised today"
          />
          {data.exercise && (
            <div>
              <p className="text-base font-medium mb-3">Minutes</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 30"
                  value={data.exercise_minutes}
                  onChange={e => setData(d => ({ ...d, exercise_minutes: e.target.value }))}
                  className="w-28 text-center text-xl h-14 font-semibold"
                />
                <span className="text-muted-foreground">min</span>
              </div>
            </div>
          )}
          <div>
            <p className="text-base font-medium mb-3">Caffeine</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setData(d => ({ ...d, caffeine_cups: String(n) }))}
                  className={cn(
                    'flex-1 h-14 rounded-xl border-2 text-sm font-bold transition-all',
                    String(n) === data.caffeine_cups
                      ? 'bg-primary border-primary text-primary-foreground scale-105'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {n} ☕
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Win of the day',
      content: (
        <div>
          <p className="text-base font-medium mb-2">What&apos;s one thing you did today?</p>
          <p className="text-sm text-muted-foreground mb-4">No matter how small it counts.</p>
          <Textarea
            placeholder="I finished the report, sent that email, went for a walk..."
            value={data.win_of_day}
            onChange={e => setData(d => ({ ...d, win_of_day: e.target.value }))}
            rows={4}
            className="text-base resize-none"
          />
        </div>
      ),
    },
    {
      title: 'Set yourself up for tomorrow',
      content: (
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-base font-medium mb-2">Where did you leave off?</p>
            <Textarea
              placeholder="Working on the Q2 deck, left off at slide 8..."
              value={data.where_left_off}
              onChange={e => setData(d => ({ ...d, where_left_off: e.target.value }))}
              rows={3}
              className="text-base resize-none"
            />
          </div>
          <div>
            <p className="text-base font-medium mb-2">Notes <span className="text-muted-foreground font-normal">(optional)</span></p>
            <Textarea
              placeholder="Anything else worth noting..."
              value={data.notes}
              onChange={e => setData(d => ({ ...d, notes: e.target.value }))}
              rows={2}
              className="text-base resize-none"
            />
          </div>
        </div>
      ),
    },
  ]

  const isLast = step === steps.length - 1

  function handleNext() {
    if (isLast) {
      onSubmit({
        afternoon_energy: data.afternoon_energy ?? undefined,
        mood_eod: data.mood_eod ?? undefined,
        focus_quality: data.focus_quality ?? undefined,
        exercise: data.exercise,
        exercise_minutes: data.exercise && data.exercise_minutes ? parseInt(data.exercise_minutes) : undefined,
        caffeine_cups: data.caffeine_cups ? parseFloat(data.caffeine_cups) : undefined,
        win_of_day: data.win_of_day || undefined,
        where_left_off: data.where_left_off || undefined,
        notes: data.notes || undefined,
      })
    } else {
      setStep(s => s + 1)
    }
  }

  return <StepShell steps={steps} step={step} setStep={setStep} onNext={handleNext} isLast={isLast} />
}

// ── Step shell ────────────────────────────────────────────────────────────────

function StepShell({
  steps,
  step,
  setStep,
  onNext,
  isLast,
}: {
  steps: { title: string; content: React.ReactNode }[]
  step: number
  setStep: (s: number) => void
  onNext: () => void
  isLast: boolean
}) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between">
        <StepDots total={steps.length} current={step} />
        <span className="text-sm text-muted-foreground">{step + 1} of {steps.length}</span>
      </div>

      <h2 className="text-2xl font-bold">{steps[step].title}</h2>

      <div className="min-h-52">{steps[step].content}</div>

      <div className="flex gap-3 pt-2">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-12 text-base">
            Back
          </Button>
        )}
        <Button onClick={onNext} className="flex-1 h-12 text-base font-semibold">
          {isLast ? 'Submit' : 'Continue →'}
        </Button>
      </div>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ streak, leftOff, onReset }: { streak: number; leftOff: string | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center py-8">
      <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center">
        <Check className="w-9 h-9 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-1">Logged ✓</h2>
        {streak > 0 && (
          <p className="text-muted-foreground">{streak} day streak 🔥</p>
        )}
      </div>
      {leftOff && (
        <div className="w-full text-left bg-card rounded-xl p-5 border border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Yesterday you left off</p>
          <p className="text-base leading-relaxed">{leftOff}</p>
        </div>
      )}
      <Button variant="outline" onClick={onReset} size="lg" className="mt-2">
        Log another
      </Button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function LogPageContent() {
  const searchParams = useSearchParams()
  const defaultTab = (searchParams.get('tab') as Tab) ?? 'morning'

  const [tab, setTab] = useState<Tab>(defaultTab)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [streak, setStreak] = useState(0)
  const [leftOff, setLeftOff] = useState<string | null>(null)
  const [todayLog, setTodayLog] = useState<DayLog | null | undefined>(undefined)

  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd')

    // Try cache first for instant load
    const cachedToday = getTodayFromCache(today)
    if (cachedToday) {
      setTodayLog(cachedToday)
    }

    // Fetch fresh data in background
    Promise.all([
      getLogs(2).then(logs => {
        const todayLog = logs.find(l => l.date === today) ?? null
        setTodayLog(todayLog)
        setCachedLogs(logs)
        return todayLog
      }),
      getYesterday(),
    ])
      .then(([_, yesterday]) => {
        setLeftOff(yesterday.text)
      })
      .catch(() => {
        if (!cachedToday) setTodayLog(null)
      })
  }, [])

  const handleSubmit = useCallback(async (data: Partial<LogEntry>) => {
    setStatus('submitting')
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const result = await postLog({ date: today, ...data })
      setStreak(result.streak)
      setStatus('done')
    } catch {
      setStatus('idle')
      alert('Failed to save. Check your connection.')
    }
  }, [])

  if (status === 'done') {
    return <SuccessScreen streak={streak} leftOff={leftOff} onReset={() => setStatus('idle')} />
  }

  if (todayLog === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      {/* Tab picker */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl w-fit">
        {(['morning', 'evening'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all capitalize',
              tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'morning' ? '☀️ Morning' : '🌙 Evening'}
          </button>
        ))}
      </div>

      {todayLog && (
        <p className="text-xs text-muted-foreground -mt-3">
          Editing today&apos;s existing log — changes will overwrite.
        </p>
      )}

      <div className={cn('transition-opacity', status === 'submitting' ? 'opacity-50 pointer-events-none' : '')}>
        {tab === 'morning'
          ? <MorningFlow key="morning" onSubmit={handleSubmit} initialData={todayLog} />
          : <EveningFlow key="evening" onSubmit={handleSubmit} initialData={todayLog} />
        }
      </div>
    </div>
  )
}

export default function LogPage() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="px-6 pt-8 pb-6 border-b border-border/50">
        <h1 className="text-3xl font-bold">Log</h1>
        <p className="text-muted-foreground mt-1">Track your day, one step at a time.</p>
      </div>
      <div className="p-6">
        <Suspense>
          <LogPageContent />
        </Suspense>
      </div>
    </div>
  )
}
