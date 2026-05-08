'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Brain, Loader2, Send, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { getCaptures, getSurfacedInsight, postCapture } from '@/lib/api'
import type { Capture } from '@/lib/types'

export default function CapturePage() {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [loadingCaptures, setLoadingCaptures] = useState(true)
  const [insight, setInsight] = useState<string | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)

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
              {captures.map(c => (
                <Card key={c.id} className="hover:bg-secondary/30 transition-colors">
                  <CardContent className="py-4">
                    <p className="leading-relaxed">{c.text}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {format(parseISO(c.date), 'MMM d, yyyy')}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
