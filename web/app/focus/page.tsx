'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  // Wall-clock end time — used so the timer recovers correctly if backgrounded
  const endTimeRef = useRef<number | null>(null)
  // AudioContext created during user gesture to satisfy iOS audio unlock requirement
  const audioCtxRef = useRef<AudioContext | null>(null)

  const effectiveDuration = (customMin ? parseInt(customMin) : durationMin) * 60

  function playChime() {
    try {
      const ctx = audioCtxRef.current ?? new AudioContext()
      if (!audioCtxRef.current) audioCtxRef.current = ctx
      ctx.resume().then(() => {
        const times = [0, 0.35, 0.7]
        const freqs = [880, 1100, 1320]
        times.forEach((t, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.setValueAtTime(freqs[i], ctx.currentTime + t)
          gain.gain.setValueAtTime(0.25, ctx.currentTime + t)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.5)
          osc.start(ctx.currentTime + t)
          osc.stop(ctx.currentTime + t + 0.5)
        })
      }).catch(() => {})
    } catch {}
  }

  function notifyDone(taskName: string) {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      new Notification('Session complete 🎉', {
        body: taskName,
        icon: '/icon-192.png',
        requireInteraction: true,
      })
    }
  }

  const start = useCallback(() => {
    const secs = effectiveDuration
    endTimeRef.current = Date.now() + secs * 1000
    setRemaining(secs)
    setTotal(secs)
    setPhase('running')

    // Create and unlock AudioContext during user gesture (required for iOS)
    if (!audioCtxRef.current) {
      try {
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        ctx.resume().then(() => {
          // Play a 1-frame silent buffer to fully unlock the iOS audio session
          const buf = ctx.createBuffer(1, 1, 22050)
          const src = ctx.createBufferSource()
          src.buffer = buf
          src.connect(ctx.destination)
          src.start()
        }).catch(() => {})
      } catch {}
    } else {
      audioCtxRef.current.resume().catch(() => {})
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [effectiveDuration])

  const pause = useCallback(() => {
    endTimeRef.current = null
    setPhase('paused')
  }, [])

  const resume = useCallback(() => {
    endTimeRef.current = Date.now() + remaining * 1000
    setPhase('running')
  }, [remaining])

  const reset = useCallback(() => {
    endTimeRef.current = null
    setPhase('setup')
    setTask('')
    setRemaining(0)
  }, [])

  // Interval uses wall-clock time so it self-corrects after backgrounding
  useEffect(() => {
    if (phase === 'running') {
      intervalRef.current = setInterval(() => {
        if (!endTimeRef.current) return
        const rem = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        if (rem <= 0) {
          setPhase('done')
          setRemaining(0)
        } else {
          setRemaining(rem)
        }
      }, 500)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phase])

  // Catch up when user returns from backgrounded state
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && phase === 'running' && endTimeRef.current) {
        const rem = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        if (rem <= 0) {
          setPhase('done')
          setRemaining(0)
        } else {
          setRemaining(rem)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [phase])

  // Fire chime + notification when session completes
  useEffect(() => {
    if (phase === 'done') {
      playChime()
      notifyDone(task)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0

  // ── Setup ─────────────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="px-6 pt-8 pb-6 border-b border-border/50">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Timer className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Focus</h1>
          </div>
          <p className="text-muted-foreground mt-2 ml-12">Declare your task and start a session. Body double mode.</p>
        </div>

        <div className="p-6 flex flex-col gap-7">
          {/* Task input */}
          <div>
            <p className="text-sm font-medium mb-2">What are you working on?</p>
            <Input
              placeholder="e.g. Write the intro paragraph of the report"
              value={task}
              onChange={e => setTask(e.target.value)}
              className="text-base h-12"
              onKeyDown={e => e.key === 'Enter' && task.trim() && start()}
            />
          </div>

          {/* Duration */}
          <div>
            <p className="text-sm font-medium mb-3">Duration</p>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDurationMin(d); setCustomMin('') }}
                  className={cn(
                    'px-5 py-2.5 rounded-xl border text-sm font-medium transition-all',
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
                className="max-w-28 h-10"
              />
              {customMin && <span className="text-sm text-muted-foreground">min</span>}
            </div>
          </div>

          <Button
            onClick={start}
            disabled={!task.trim()}
            size="lg"
            className="h-12 text-base"
          >
            Start session
          </Button>
        </div>
      </div>
    )
  }

  // ── Running / Paused / Done ───────────────────────────────────────────────────

  return (
    <div className="max-w-lg mx-auto flex flex-col items-center text-center gap-8 pt-12 px-6">
      {phase === 'done' ? (
        <>
          <div className="w-24 h-24 rounded-full bg-[var(--chart-3)]/15 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-[var(--chart-3)]" />
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-2">Session complete</h2>
            <p className="text-muted-foreground">You worked on:</p>
            <p className="text-lg font-medium mt-1">{task}</p>
          </div>
          <div className="w-full bg-card rounded-2xl border border-border p-6 text-left">
            <p className="font-semibold mb-2">How did it go?</p>
            <p className="text-muted-foreground">
              Take a moment to reflect before moving on. Did you finish? What&apos;s the next step?
            </p>
          </div>
          <Button onClick={reset} variant="outline" className="gap-2 h-11 px-6">
            <RotateCcw className="w-4 h-4" /> New session
          </Button>
        </>
      ) : (
        <>
          {/* Working on card */}
          <div className="w-full bg-card rounded-2xl border border-border px-6 py-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Working on</p>
            <p className="text-lg font-medium leading-snug">{task}</p>
          </div>

          {/* Circle timer */}
          <div className="relative w-56 h-56 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border" />
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
            <div className="flex flex-col items-center">
              <span className="text-5xl font-mono font-bold tabular-nums">{formatTime(remaining)}</span>
              <span className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                {phase === 'paused' ? 'paused' : 'remaining'}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3">
            {phase === 'running' ? (
              <Button onClick={pause} variant="outline" size="lg" className="gap-2 w-36 h-12">
                <Pause className="w-4 h-4" /> Pause
              </Button>
            ) : (
              <Button onClick={resume} size="lg" className="gap-2 w-36 h-12">
                <Play className="w-4 h-4" /> Resume
              </Button>
            )}
            <Button onClick={reset} variant="ghost" size="lg" className="h-12 w-12">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
