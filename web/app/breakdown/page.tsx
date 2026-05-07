'use client'

import { useState } from 'react'
import { Check, Loader2, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { postBreakdown } from '@/lib/api'

export default function BreakdownPage() {
  const [task, setTask] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [done, setDone] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Breakdown</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste a daunting task. Get micro-steps so small you can&apos;t not start.
        </p>
      </div>

      <form onSubmit={handleBreakdown} className="mb-8">
        <Textarea
          placeholder="What's the thing you've been avoiding?"
          value={task}
          onChange={e => setTask(e.target.value)}
          rows={3}
          className="mb-3 resize-none text-base"
        />
        <Button type="submit" disabled={!task.trim() || loading} className="w-full gap-2">
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Breaking it down...</>
          ) : (
            <><ListChecks className="w-4 h-4" /> Break it down</>
          )}
        </Button>
      </form>

      {steps.length > 0 && (
        <div>
          {allDone && (
            <div className="mb-4 flex items-center gap-2 text-[var(--chart-3)] text-sm font-medium">
              <Check className="w-4 h-4" />
              All steps done — great work
            </div>
          )}
          <div className="flex flex-col gap-2">
            {steps.map((step, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDone(i)}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  done.has(i)
                    ? 'border-[var(--chart-3)]/30 bg-[var(--chart-3)]/5 opacity-60'
                    : 'border-border hover:border-primary/30 bg-card'
                }`}
              >
                <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                  done.has(i)
                    ? 'bg-[var(--chart-3)] border-[var(--chart-3)]'
                    : 'border-border'
                }`}>
                  {done.has(i) && <Check className="w-3 h-3 text-white" />}
                </span>
                <div>
                  <span className="text-xs text-muted-foreground">Step {i + 1}</span>
                  <p className={`text-sm mt-0.5 leading-relaxed ${done.has(i) ? 'line-through' : ''}`}>
                    {step}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            className="mt-4 w-full text-muted-foreground"
            onClick={() => { setTask(''); setSteps([]); setDone(new Set()) }}
          >
            Clear and start over
          </Button>
        </div>
      )}
    </div>
  )
}
