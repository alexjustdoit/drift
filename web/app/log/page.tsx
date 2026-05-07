'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { getYesterday, postLog } from '@/lib/api'
import type { LogEntry } from '@/lib/types'

type Tab = 'morning' | 'evening'

// ── Rating buttons ─────────────────────────────────────────────────────────────

function Rating({
  value,
  onChange,
  label,
  low = 'low',
  high = 'high',
}: {
  value: number | null
  onChange: (v: number) => void
  label: string
  low?: string
  high?: string
}) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">{label}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'w-12 h-12 rounded-xl border text-sm font-semibold transition-all',
              value === n
                ? 'bg-primary border-primary text-primary-foreground scale-105'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[11px] text-muted-foreground/60">{low}</span>
        <span className="text-[11px] text-muted-foreground/60">{high}</span>
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
        'flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-sm font-medium transition-all',
        checked ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
      )}
    >
      <span className={cn('w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
        checked ? 'bg-primary border-primary' : 'border-border'
      )}>
        {checked && <Check className="w-3 h-3 text-primary-foreground" />}
      </span>
      {label}
    </button>
  )
}

// ── Morning steps ─────────────────────────────────────────────────────────────

interface MorningData {
  sleep_hours: string
  sleep_quality: number | null
  morning_energy: number | null
  meds_taken: boolean
  exercise: boolean
  exercise_minutes: string
  caffeine_cups: string
}

function MorningFlow({ onSubmit }: { onSubmit: (data: Partial<LogEntry>) => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<MorningData>({
    sleep_hours: '',
    sleep_quality: null,
    morning_energy: null,
    meds_taken: false,
    exercise: false,
    exercise_minutes: '',
    caffeine_cups: '',
  })

  const steps = [
    {
      title: 'How was your sleep?',
      content: (
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Hours slept</p>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="24"
              placeholder="e.g. 7.5"
              value={data.sleep_hours}
              onChange={e => setData(d => ({ ...d, sleep_hours: e.target.value }))}
              className="max-w-32 text-center text-lg"
            />
          </div>
          <Rating
            label="Sleep quality"
            value={data.sleep_quality}
            onChange={v => setData(d => ({ ...d, sleep_quality: v }))}
            low="poor"
            high="great"
          />
        </div>
      ),
    },
    {
      title: 'Morning vitals',
      content: (
        <div className="flex flex-col gap-6">
          <Rating
            label="Morning energy"
            value={data.morning_energy}
            onChange={v => setData(d => ({ ...d, morning_energy: v }))}
            low="drained"
            high="charged"
          />
          <Toggle
            checked={data.meds_taken}
            onChange={v => setData(d => ({ ...d, meds_taken: v }))}
            label="Meds taken"
          />
        </div>
      ),
    },
    {
      title: 'Movement & caffeine',
      content: (
        <div className="flex flex-col gap-4">
          <Toggle
            checked={data.exercise}
            onChange={v => setData(d => ({ ...d, exercise: v }))}
            label="I exercised today"
          />
          {data.exercise && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Minutes</p>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 30"
                value={data.exercise_minutes}
                onChange={e => setData(d => ({ ...d, exercise_minutes: e.target.value }))}
                className="max-w-32 text-center"
              />
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground mb-2">Caffeine cups</p>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="0"
              value={data.caffeine_cups}
              onChange={e => setData(d => ({ ...d, caffeine_cups: e.target.value }))}
              className="max-w-32 text-center"
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
        morning_energy: data.morning_energy ?? undefined,
        meds_taken: data.meds_taken,
        exercise: data.exercise,
        exercise_minutes: data.exercise && data.exercise_minutes ? parseInt(data.exercise_minutes) : undefined,
        caffeine_cups: data.caffeine_cups ? parseFloat(data.caffeine_cups) : undefined,
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
  win_of_day: string
  where_left_off: string
  notes: string
}

function EveningFlow({ onSubmit }: { onSubmit: (data: Partial<LogEntry>) => void }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<EveningData>({
    afternoon_energy: null,
    mood_eod: null,
    focus_quality: null,
    win_of_day: '',
    where_left_off: '',
    notes: '',
  })

  const steps = [
    {
      title: 'End of day energy',
      content: (
        <div className="flex flex-col gap-6">
          <Rating
            label="Afternoon energy"
            value={data.afternoon_energy}
            onChange={v => setData(d => ({ ...d, afternoon_energy: v }))}
            low="drained"
            high="charged"
          />
          <Rating
            label="Overall mood"
            value={data.mood_eod}
            onChange={v => setData(d => ({ ...d, mood_eod: v }))}
            low="rough"
            high="great"
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
        />
      ),
    },
    {
      title: 'Win of the day',
      content: (
        <div>
          <p className="text-sm text-muted-foreground mb-3">What's one thing you did today, no matter how small?</p>
          <Textarea
            placeholder="I finished the report, sent that email, went for a walk..."
            value={data.win_of_day}
            onChange={e => setData(d => ({ ...d, win_of_day: e.target.value }))}
            rows={4}
          />
        </div>
      ),
    },
    {
      title: 'Set yourself up for tomorrow',
      content: (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Where did you leave off?</p>
            <Textarea
              placeholder="Working on the Q2 deck, left off at slide 8..."
              value={data.where_left_off}
              onChange={e => setData(d => ({ ...d, where_left_off: e.target.value }))}
              rows={3}
            />
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-2">Notes (optional)</p>
            <Textarea
              placeholder="Anything else worth noting..."
              value={data.notes}
              onChange={e => setData(d => ({ ...d, notes: e.target.value }))}
              rows={2}
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
    <div className="flex flex-col gap-6">
      <Progress value={((step + 1) / steps.length) * 100} className="h-1" />

      <div>
        <p className="text-xs text-muted-foreground mb-1">Step {step + 1} of {steps.length}</p>
        <h2 className="text-xl font-semibold">{steps[step].title}</h2>
      </div>

      <div className="min-h-48">{steps[step].content}</div>

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
            Back
          </Button>
        )}
        <Button onClick={onNext} className="flex-1">
          {isLast ? 'Submit' : 'Next'}
        </Button>
      </div>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ streak, leftOff, onReset }: { streak: number; leftOff: string | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center py-8">
      <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
        <Check className="w-8 h-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-1">Logged</h2>
        {streak > 0 && (
          <p className="text-sm text-muted-foreground">{streak} day streak 🔥</p>
        )}
      </div>
      {leftOff && (
        <div className="w-full text-left bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Yesterday you left off</p>
          <p className="text-sm">{leftOff}</p>
        </div>
      )}
      <Button variant="outline" onClick={onReset} className="mt-2">
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

  useEffect(() => {
    getYesterday().then(r => setLeftOff(r.text)).catch(() => {})
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

  return (
    <div className="flex flex-col gap-6">
      {/* Tab picker */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {(['morning', 'evening'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
              tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className={cn('transition-opacity', status === 'submitting' ? 'opacity-50 pointer-events-none' : '')}>
        {tab === 'morning'
          ? <MorningFlow key="morning" onSubmit={handleSubmit} />
          : <EveningFlow key="evening" onSubmit={handleSubmit} />
        }
      </div>
    </div>
  )
}

export default function LogPage() {
  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Log</h1>
      <Suspense>
        <LogPageContent />
      </Suspense>
    </div>
  )
}
