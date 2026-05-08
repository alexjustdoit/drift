'use client'

import { useEffect, useState } from 'react'
import { Check, ListChecks, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { postBreakdown } from '@/lib/api'

const STORAGE_KEY = 'drift:breakdown'

export default function BreakdownPage() {
  const [task, setTask] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [done, setDone] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { task: t, steps: s } = JSON.parse(saved)
        if (t) setTask(t)
        if (s?.length) setSteps(s)
      }
    } catch {}
  }, [])

  // Persist to localStorage when steps change
  useEffect(() => {
    if (steps.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ task, steps }))
      } catch {}
    }
  }, [task, steps])

  async function handleBreakdown(e: React.FormEvent) {
    e.preventDefault()
    if (!task.trim()) return
    setLoading(true)
    setSteps([])
    setDone(new Set())
    try {
      const r = await postBreakdown(task.trim())
      setSteps(r.steps)
    } catch {
      alert('Could not break down the task. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleDone(i: number) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const allDone = steps.length > 0 && done.size === steps.length
  const doneCount = done.size

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 border-b border-border/50">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ListChecks className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Breakdown</h1>
        </div>
        <p className="text-muted-foreground mt-2 ml-12">
          Paste a daunting task. Get micro-steps so small you can&apos;t not start.
        </p>
      </div>

      <div className="p-6 flex flex-col gap-6">
        <form onSubmit={handleBreakdown}>
          <Textarea
            placeholder="What's the thing you've been avoiding?"
            value={task}
            onChange={e => setTask(e.target.value)}
            rows={4}
            className="mb-3 resize-none text-base leading-relaxed"
          />
          <Button type="submit" disabled={!task.trim() || loading} className="w-full gap-2 h-12 text-base">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Breaking it down...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Break it down</>
            )}
          </Button>
        </form>

        {steps.length > 0 && (
          <div>
            {/* Progress header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {allDone ? 'All done!' : `${doneCount} of ${steps.length} steps`}
              </p>
              {allDone && (
                <div className="flex items-center gap-1.5 text-[var(--chart-3)] text-sm font-medium">
                  <Check className="w-4 h-4" />
                  Great work
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-secondary rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-[var(--chart-3)] rounded-full transition-all duration-300"
                style={{ width: `${steps.length > 0 ? (doneCount / steps.length) * 100 : 0}%` }}
              />
            </div>

            <div className="flex flex-col gap-2">
              {steps.map((step, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDone(i)}
                  className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                    done.has(i)
                      ? 'border-[var(--chart-3)]/30 bg-[var(--chart-3)]/5 opacity-60'
                      : 'border-border hover:border-primary/30 bg-card hover:bg-secondary/20'
                  }`}
                >
                  <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                    done.has(i)
                      ? 'bg-[var(--chart-3)] border-[var(--chart-3)]'
                      : 'border-muted-foreground/30'
                  }`}>
                    {done.has(i) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Step {i + 1}</p>
                    <p className={`leading-relaxed ${done.has(i) ? 'line-through text-muted-foreground' : ''}`}>
                      {step}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              className="mt-5 w-full text-muted-foreground"
              onClick={() => {
                setTask(''); setSteps([]); setDone(new Set())
                try { localStorage.removeItem(STORAGE_KEY) } catch {}
              }}
            >
              Clear and start over
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
