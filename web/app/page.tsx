'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowRight, Flame, PenLine } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getLogs, getYesterday } from '@/lib/api'
import type { DayLog } from '@/lib/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function StatusPill({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
      done
        ? 'border-[var(--chart-3)]/30 bg-[var(--chart-3)]/10 text-[var(--chart-3)]'
        : 'border-border text-muted-foreground'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-[var(--chart-3)]' : 'bg-muted-foreground/30'}`} />
      {label}
    </div>
  )
}

export default function TodayPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [log, setLog] = useState<DayLog | null>(null)
  const [streak, setStreak] = useState(0)
  const [leftOff, setLeftOff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getLogs(7), getYesterday()])
      .then(([logs, yesterday]) => {
        const todayLog = logs.find(l => l.date === today) ?? null
        setLog(todayLog)
        const dateSet = new Set(logs.map(l => l.date))
        let s = 0
        const d = new Date()
        while (dateSet.has(format(d, 'yyyy-MM-dd'))) {
          s++
          d.setDate(d.getDate() - 1)
        }
        setStreak(s)
        setLeftOff(yesterday.text)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [today])

  const morningDone = log?.morning_energy != null
  const eveningDone = log?.mood_eod != null

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-bold mt-1">Good {greeting()}</h1>
      </div>

      {streak > 0 && (
        <Card className="mb-4 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-4">
            <Flame className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">{streak} day streak — keep going</span>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="py-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium">Today&apos;s log</span>
            <Link href="/log">
              <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary hover:bg-primary/10">
                <PenLine className="w-3.5 h-3.5" />
                {morningDone || eveningDone ? 'Update' : 'Start'}
              </Button>
            </Link>
          </div>
          <div className="flex gap-3">
            <StatusPill done={morningDone} label="Morning" />
            <StatusPill done={eveningDone} label="Evening" />
          </div>
        </CardContent>
      </Card>

      {leftOff && (
        <Card className="mb-4">
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground mb-1.5">Yesterday you left off</p>
            <p className="text-sm leading-relaxed">{leftOff}</p>
          </CardContent>
        </Card>
      )}

      {log?.win_of_day && (
        <Card className="mb-4">
          <CardContent className="py-5">
            <p className="text-xs text-muted-foreground mb-1.5">Today&apos;s win</p>
            <p className="text-sm leading-relaxed">{log.win_of_day}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !morningDone && !eveningDone && (
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/log?tab=morning">
            <Button variant="outline" className="w-full justify-between">
              Log morning check-in <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/capture">
            <Button variant="outline" className="w-full justify-between">
              Brain dump <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
