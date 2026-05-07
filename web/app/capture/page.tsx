'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2, Send, Sparkles } from 'lucide-react'
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
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Capture</h1>
        <p className="text-sm text-muted-foreground mt-1">Dump whatever's in your head. No structure needed.</p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mb-8">
        <Textarea
          placeholder="What's on your mind?"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          className="mb-3 resize-none text-base"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit(e as unknown as React.FormEvent)
            }
          }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">⌘↵ to save</p>
          <Button type="submit" disabled={!text.trim() || submitting} className="gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Save
          </Button>
        </div>
      </form>

      {/* AI surface */}
      {captures.length >= 3 && (
        <div className="mb-8">
          <Button
            variant="outline"
            className="w-full gap-2 border-primary/30 hover:border-primary/60"
            onClick={handleSurface}
            disabled={loadingInsight}
          >
            {loadingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
            Surface patterns from my captures
          </Button>
          {insight && (
            <Card className="mt-3 border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{insight}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Capture list */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Recent captures</h2>
        {loadingCaptures ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : captures.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No captures yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {captures.map(c => (
              <Card key={c.id} className="hover:bg-secondary/30 transition-colors">
                <CardContent className="py-4">
                  <p className="text-sm leading-relaxed">{c.text}</p>
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
  )
}
