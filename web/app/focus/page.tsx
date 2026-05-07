'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

type Phase = 'setup' | 'running' | 'paused' | 'done'

const DURATIONS = [15, 25, 45, 60]

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function FocusPage() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [task, setTask] = useState('')
  const [durationMin, setDurationMin] = useState(25)
  const [customMin, setCustomMin] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const effectiveDuration = (customMin ? parseInt(customMin) : durationMin) * 60

  const start = useCallback(() => {
    const secs = effectiveDuration
    setRemaining(secs)
    setTotal(secs)
    setPhase('running')
  }, [effectiveDuration])

  const pause = useCallback(() => {
    setPhase('paused')
  }, [])

  const resume = useCallback(() => {
    setPhase('running')
  }, [])

  const reset = useCallback(() => {
    setPhase('setup')
    setTask('')
    setRemaining(0)
  }, [])

  useEffect(() => {
    if (phase === 'running') {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setPhase('done')
            return 0
          }
          return r - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [phase])

  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0

  // ── Setup ────────────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Focus</h1>
          <p className="text-sm text-muted-foreground mt-1">Declare your task and start a session. Body double mode.</p>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-2">What are you working on?</p>
            <Input
              placeholder="e.g. Write the intro paragraph of the report"
              value={task}
              onChange={e => setTask(e.target.value)}
              className="text-base"
              onKeyDown={e => e.key === 'Enter' && task.trim() && start()}
            />
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-3">Duration</p>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDurationMin(d); setCustomMin('') }}
                  className={cn(
                    'px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                    durationMin === d && !customMin
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {d} min
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                type="number"
                placeholder="Custom"
                min="1"
                max="180"
                value={customMin}
                onChange={e => setCustomMin(e.target.value)}
                className="max-w-28"
              />
              {customMin && <span className="text-sm text-muted-foreground">min</span>}
            </div>
          </div>

          <Button
            onClick={start}
            disabled={!task.trim()}
            size="lg"
            className="mt-2"
          >
            Start session
          </Button>
        </div>
      </div>
    )
  }

  // ── Running / Paused / Done ───────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-lg mx-auto flex flex-col items-center text-center gap-8 pt-12">
      {phase === 'done' ? (
        <>
          <div className="w-20 h-20 rounded-full bg-[var(--chart-3)]/15 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-[var(--chart-3)]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Session complete</h2>
            <p className="text-muted-foreground text-sm">You worked on:</p>
            <p className="font-medium mt-1">{task}</p>
          </div>
          <div className="w-full bg-card rounded-xl border border-border p-5 text-left">
            <p className="text-sm font-medium mb-2">How did it go?</p>
            <p className="text-xs text-muted-foreground">
              Take a moment to reflect before moving on. Did you finish? What's the next step?
            </p>
          </div>
          <Button onClick={reset} variant="outline" className="gap-2">
            <RotateCcw className="w-4 h-4" /> New session
          </Button>
        </>
      ) : (
        <>
          <div>
            <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Working on</p>
            <p className="text-lg font-medium">{task}</p>
          </div>

          <div className="relative w-48 h-48 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
              <circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-primary transition-all duration-1000"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-4xl font-mono font-bold tabular-nums">{formatTime(remaining)}</span>
          </div>

          <Progress value={progress} className="w-full h-1.5" />

          <div className="flex gap-3">
            {phase === 'running' ? (
              <Button onClick={pause} variant="outline" size="lg" className="gap-2 w-32">
                <Pause className="w-4 h-4" /> Pause
              </Button>
            ) : (
              <Button onClick={resume} size="lg" className="gap-2 w-32">
                <Play className="w-4 h-4" /> Resume
              </Button>
            )}
            <Button onClick={reset} variant="ghost" size="lg">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
