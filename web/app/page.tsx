'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format, subDays } from 'date-fns'
import { ArrowRight, Brain, Flame, PenLine, Timer } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
      done
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
        : 'border-border text-muted-foreground bg-secondary/30'
    }`}>
      <span className={`w-2 h-2 rounded-full ${done ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
      {label} {done ? '✓' : ''}
    </div>
  )
}

function QuickAction({ href, icon: Icon, label, sub }: { href: string; icon: React.ElementType; label: string; sub: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-secondary/30 transition-all group cursor-pointer">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>
    </Link>
  )
}

function StreakCalendar({ logs, streak }: { logs: DayLog[]; streak: number }) {
  const dateSet = new Set(logs.map(l => l.date))
  const today = new Date()
  const days = Array.from({ length: 21 }, (_, i) => {
    const d = subDays(today, 20 - i)
    return format(d, 'yyyy-MM-dd')
  })

  return (
    <div className="mt-4">
      {streak > 0 && (
        <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium w-fit mb-3">
          <Flame className="w-4 h-4" />
          {streak} day streak
        </div>
      )}
      <div className="flex gap-1.5 items-center">
        {days.map(date => (
          <div
            key={date}
            title={format(new Date(date + 'T12:00:00'), 'MMM d')}
            className={`w-3 h-3 rounded-sm transition-colors ${
              dateSet.has(date)
                ? 'bg-primary'
                : date === format(today, 'yyyy-MM-dd')
                ? 'bg-primary/20 ring-1 ring-primary/40'
                : 'bg-secondary'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground/50 mt-1.5">last 3 weeks</p>
    </div>
  )
}

function TodaySkeleton() {
  return (
    <div className="p-6 flex flex-col gap-5">
      <div className="rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
      <div className="rounded-xl border border-border p-5">
        <Skeleton className="h-3 w-36 mb-3" />
        <Skeleton className="h-5 w-full mb-2" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    </div>
  )
}

export default function TodayPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [log, setLog] = useState<DayLog | null>(null)
  const [logs, setLogs] = useState<DayLog[]>([])
  const [streak, setStreak] = useState(0)
  const [leftOff, setLeftOff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [intention, setIntention] = useState('')

  useEffect(() => {
    setIntention(localStorage.getItem(`drift:intention:${today}`) ?? '')
  }, [today])

  useEffect(() => {
    Promise.all([getLogs(21), getYesterday()])
      .then(([allLogs, yesterday]) => {
        setLogs(allLogs)
        const todayLog = allLogs.find(l => l.date === today) ?? null
        setLog(todayLog)
        const dateSet = new Set(allLogs.map(l => l.date))
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

  function saveIntention(val: string) {
    setIntention(val)
    const trimmed = val.trim()
    if (trimmed) localStorage.setItem(`drift:intention:${today}`, trimmed)
    else localStorage.removeItem(`drift:intention:${today}`)
  }

  const morningDone = log?.morning_energy != null
  const eveningDone = log?.mood_eod != null
  const bothDone = morningDone && eveningDone

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 border-b border-border/50">
        <p className="text-sm text-muted-foreground mb-1">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-3xl font-bold tracking-tight">Good {greeting()}</h1>
        {!loading && <StreakCalendar logs={logs} streak={streak} />}
        {loading && <Skeleton className="h-8 w-32 mt-4 rounded-full" />}
      </div>

      {/* Today's priority */}
      <div className="px-6 py-4 border-b border-border/50">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Today&apos;s priority</p>
        <input
          type="text"
          placeholder="What's the one thing that matters today?"
          value={intention}
          onChange={e => setIntention(e.target.value)}
          onBlur={e => saveIntention(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-full bg-transparent text-lg font-medium placeholder:text-muted-foreground/40 placeholder:font-normal outline-none"
        />
      </div>

      {loading ? (
        <TodaySkeleton />
      ) : (
        <div className="p-6 flex flex-col gap-5">
          {/* Log status */}
          <Card className={`border ${bothDone ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border'}`}>
            <CardContent className="py-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold">Today&apos;s log</p>
                <Link href="/log">
                  <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary hover:bg-primary/10 font-medium">
                    <PenLine className="w-3.5 h-3.5" />
                    {morningDone || eveningDone ? 'Update' : 'Start'}
                  </Button>
                </Link>
              </div>
              <div className="flex gap-2">
                <StatusPill done={morningDone} label="Morning" />
                <StatusPill done={eveningDone} label="Evening" />
              </div>
            </CardContent>
          </Card>

          {/* Yesterday context */}
          {leftOff && (
            <Card>
              <CardContent className="py-5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Yesterday you left off</p>
                <p className="text-base leading-relaxed">{leftOff}</p>
              </CardContent>
            </Card>
          )}

          {/* Win of the day */}
          {log?.win_of_day && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="py-5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Today&apos;s win</p>
                <p className="text-base leading-relaxed">{log.win_of_day}</p>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick actions</p>
            <div className="flex flex-col gap-2">
              {!morningDone && (
                <QuickAction href="/log?tab=morning" icon={PenLine} label="Morning check-in" sub="Sleep, energy, meds, exercise" />
              )}
              {morningDone && !eveningDone && (
                <QuickAction href="/log?tab=evening" icon={PenLine} label="Evening check-in" sub="Mood, focus, win of the day" />
              )}
              <QuickAction href="/capture" icon={Brain} label="Brain dump" sub="Get it out of your head" />
              <QuickAction href="/focus" icon={Timer} label="Focus session" sub="Body double mode" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
