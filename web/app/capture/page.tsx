'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Brain, Check, ListTodo, Loader2, Send, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { addTodoistTasks, archiveCapture, extractTasks, getCaptures, getSurfacedInsight, postCapture } from '@/lib/api'
import type { Capture } from '@/lib/types'

type TaskDraft = { text: string; checked: boolean }

export default function CapturePage() {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [loadingCaptures, setLoadingCaptures] = useState(true)
  const [insight, setInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const [archiving, setArchiving] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState<Set<string>>(new Set())
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft[]>>({})
  const [addingTasks, setAddingTasks] = useState<Set<string>>(new Set())
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set())

  const loadCaptures = useCallback(() => {
    setLoadingCaptures(true)
    getCaptures(20)
      .then(setCaptures)
      .catch(() => {})
      .finally(() => setLoadingCaptures(false))
  }, [])

  useEffect(() => { loadCaptures() }, [loadCaptures])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    try {
      await postCapture(text.trim())
      setText('')
      loadCaptures()
    } catch {
      alert('Failed to save. Check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleArchive(id: string) {
    setArchiving(prev => new Set(prev).add(id))
    setCaptures(prev => prev.filter(c => c.id !== id))
    try {
      await archiveCapture(id)
    } catch {
      loadCaptures()
    } finally {
      setArchiving(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function handleExtract(id: string) {
    setExtracting(prev => new Set(prev).add(id))
    try {
      const { tasks } = await extractTasks(id)
      setTaskDrafts(prev => ({
        ...prev,
        [id]: tasks.map(t => ({ text: t, checked: true })),
      }))
    } catch {
      // fail silently — button just stops spinning
    } finally {
      setExtracting(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  function toggleTask(captureId: string, idx: number) {
    setTaskDrafts(prev => ({
      ...prev,
      [captureId]: prev[captureId].map((t, i) => i === idx ? { ...t, checked: !t.checked } : t),
    }))
  }

  async function handleAddTasks(captureId: string) {
    const selected = (taskDrafts[captureId] ?? []).filter(t => t.checked).map(t => t.text)
    if (!selected.length) return
    setAddingTasks(prev => new Set(prev).add(captureId))
    try {
      await addTodoistTasks(selected)
      setAddedTasks(prev => new Set(prev).add(captureId))
      setTaskDrafts(prev => { const n = { ...prev }; delete n[captureId]; return n })
    } catch {
      // fail silently
    } finally {
      setAddingTasks(prev => { const s = new Set(prev); s.delete(captureId); return s })
    }
  }

  async function handleSurface() {
    setLoadingInsight(true)
    try {
      const r = await getSurfacedInsight()
      setInsight(r.insight)
    } catch {
      setInsight('Could not load insight right now.')
    } finally {
      setLoadingInsight(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 border-b border-border/50">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Brain dump</h1>
        </div>
        <p className="text-muted-foreground mt-2 ml-12">Dump whatever&apos;s in your head. No structure needed.</p>
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Input */}
        <form onSubmit={handleSubmit}>
          <Textarea
            placeholder="What's on your mind? Worries, ideas, tasks, random thoughts — all welcome."
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            className="mb-3 resize-none text-base leading-relaxed"
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e as unknown as React.FormEvent)
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">⌘↵ to save</p>
            <Button type="submit" disabled={!text.trim() || submitting} className="gap-2 h-10 px-5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Save
            </Button>
          </div>
        </form>

        {/* AI surface */}
        {captures.length >= 3 && (
          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-full gap-2 h-11 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
              onClick={handleSurface}
              disabled={loadingInsight}
            >
              {loadingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
              Surface patterns from my captures
            </Button>
            {insight && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="py-5">
                  <p className="text-xs font-medium text-primary/70 uppercase tracking-wider mb-2">AI Insight</p>
                  <p className="leading-relaxed whitespace-pre-wrap">{insight}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Capture list */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Recent captures</p>
          {loadingCaptures ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : captures.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nothing captured yet. Your thoughts won&apos;t escape anymore.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {captures.map(c => {
                const drafts = taskDrafts[c.id]
                const hasAdded = addedTasks.has(c.id)
                return (
                  <Card key={c.id} className="hover:bg-secondary/30 transition-colors group">
                    <CardContent className="py-4">
                      {/* Capture text + action buttons */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="leading-relaxed">{c.text}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {format(parseISO(c.date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="shrink-0 flex gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Extract tasks */}
                          <button
                            onClick={() => drafts ? setTaskDrafts(prev => { const n = { ...prev }; delete n[c.id]; return n }) : handleExtract(c.id)}
                            disabled={extracting.has(c.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors"
                            aria-label="Extract tasks"
                          >
                            {extracting.has(c.id)
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : drafts
                                ? <X className="w-3.5 h-3.5" />
                                : <ListTodo className="w-3.5 h-3.5" />}
                          </button>
                          {/* Archive */}
                          <button
                            onClick={() => handleArchive(c.id)}
                            disabled={archiving.has(c.id)}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors"
                            aria-label="Archive"
                          >
                            {archiving.has(c.id)
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Check className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Extracted task review */}
                      {drafts && drafts.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Extracted tasks</p>
                          <div className="flex flex-col gap-1.5 mb-3">
                            {drafts.map((t, i) => (
                              <label key={i} className="flex items-start gap-2.5 cursor-pointer group/task">
                                <input
                                  type="checkbox"
                                  checked={t.checked}
                                  onChange={() => toggleTask(c.id, i)}
                                  className="mt-0.5 shrink-0 accent-primary"
                                />
                                <span className={`text-sm leading-relaxed ${t.checked ? '' : 'line-through text-muted-foreground'}`}>
                                  {t.text}
                                </span>
                              </label>
                            ))}
                          </div>
                          <Button
                            size="sm"
                            className="gap-1.5 h-8"
                            disabled={addingTasks.has(c.id) || !drafts.some(t => t.checked)}
                            onClick={() => handleAddTasks(c.id)}
                          >
                            {addingTasks.has(c.id)
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <ListTodo className="w-3 h-3" />}
                            Add to Todoist
                          </Button>
                        </div>
                      )}
                      {drafts && drafts.length === 0 && (
                        <p className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">No clear tasks found in this capture.</p>
                      )}
                      {hasAdded && !drafts && (
                        <p className="mt-3 pt-3 border-t border-border/50 text-xs text-green-600 dark:text-green-400">Tasks added to Todoist.</p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
