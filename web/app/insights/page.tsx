'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2, Sparkles } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getAIReport, getLogs } from '@/lib/api'
import type { DayLog } from '@/lib/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function avg(vals: (number | null | undefined)[]) {
  const v = vals.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function pct(vals: (boolean | null | undefined)[]) {
  const v = vals.filter(x => x != null)
  return v.length ? Math.round((v.filter(Boolean).length / v.length) * 100) : null
}

function StatCard({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold">
          {value != null ? value : '—'}
          {value != null && unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </p>
      </CardContent>
    </Card>
  )
}

// ── Mini chart ─────────────────────────────────────────────────────────────────

function TrendChart({
  data,
  dataKey,
  color,
  label,
}: {
  data: DayLog[]
  dataKey: keyof DayLog
  color: string
  label: string
}) {
  const chartData = data
    .filter(d => d[dataKey] != null)
    .slice(-30)
    .map(d => ({
      date: format(parseISO(d.date), 'MMM d'),
      value: d[dataKey] as number,
    }))

  if (chartData.length < 2) return null

  return (
    <Card>
      <CardContent className="pt-4 pb-2">
        <p className="text-xs text-muted-foreground mb-3">{label} (last 30 days)</p>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[1, 5]} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} width={16} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)' }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function OverviewTab({ logs }: { logs: DayLog[] }) {
  const recent = logs.slice(-30)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Avg sleep" value={avg(recent.map(d => d.sleep_hours))?.toFixed(1) ?? null} unit="hrs" />
        <StatCard label="Avg focus" value={avg(recent.map(d => d.focus_quality))?.toFixed(1) ?? null} unit="/5" />
        <StatCard label="Avg mood" value={avg(recent.map(d => d.mood_eod))?.toFixed(1) ?? null} unit="/5" />
        <StatCard label="Meds adherence" value={pct(recent.map(d => d.meds_taken))} unit="%" />
        <StatCard label="Exercise rate" value={pct(recent.map(d => d.exercise))} unit="%" />
        <StatCard label="Days logged" value={recent.length} />
      </div>
    </div>
  )
}

function PatternsTab({ logs }: { logs: DayLog[] }) {
  return (
    <div className="flex flex-col gap-4">
      <TrendChart data={logs} dataKey="focus_quality" color="var(--chart-1)" label="Focus quality" />
      <TrendChart data={logs} dataKey="mood_eod" color="var(--chart-2)" label="Mood" />
      <TrendChart data={logs} dataKey="morning_energy" color="var(--chart-3)" label="Morning energy" />
      <TrendChart data={logs} dataKey="sleep_hours" color="var(--chart-4)" label="Sleep hours" />
    </div>
  )
}

function WinLogTab({ logs }: { logs: DayLog[] }) {
  const wins = logs.filter(d => d.win_of_day).slice().reverse()
  if (wins.length === 0) return <p className="text-sm text-muted-foreground py-4">No wins logged yet.</p>

  return (
    <div className="flex flex-col gap-3">
      {wins.map(d => (
        <Card key={d.date}>
          <CardContent className="py-4">
            <p className="text-sm leading-relaxed">{d.win_of_day}</p>
            <p className="text-xs text-muted-foreground mt-2">{format(parseISO(d.date), 'EEEE, MMM d')}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AIReportTab({ logs }: { logs: DayLog[] }) {
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchReport() {
    setLoading(true)
    try {
      const r = await getAIReport(30)
      setReport(r.report)
    } catch {
      setReport('Could not generate report right now.')
    } finally {
      setLoading(false)
    }
  }

  if (logs.length < 5) {
    return <p className="text-sm text-muted-foreground py-4">Log at least 5 days before running the AI report.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={fetchReport} disabled={loading} variant="outline" className="gap-2 border-primary/30 hover:border-primary/60">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
        Generate report (last 30 days)
      </Button>
      {report && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-5">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{report}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TimeAuditTab() {
  return (
    <div>
      <p className="text-sm text-muted-foreground py-4">
        Time audit data from Telegram <Badge variant="secondary">/time</Badge> command.
        Detailed breakdown coming soon.
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [logs, setLogs] = useState<DayLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getLogs(90)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Patterns from your daily log.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-5 mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
            <TabsTrigger value="wins">Wins</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab logs={logs} /></TabsContent>
          <TabsContent value="patterns"><PatternsTab logs={logs} /></TabsContent>
          <TabsContent value="wins"><WinLogTab logs={logs} /></TabsContent>
          <TabsContent value="ai"><AIReportTab logs={logs} /></TabsContent>
          <TabsContent value="time"><TimeAuditTab /></TabsContent>
        </Tabs>
      )}
    </div>
  )
}
