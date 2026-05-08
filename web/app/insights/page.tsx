'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { BarChart2, Loader2, Sparkles } from 'lucide-react'
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
import { getAIReport, getLogs, getTimeAudit, postTimeAudit } from '@/lib/api'
import { Input } from '@/components/ui/input'
import type { DayLog, TimeAuditEntry } from '@/lib/types'

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
      <CardContent className="py-5 px-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
        <p className="text-3xl font-bold leading-none">
          {value != null ? value : '—'}
          {value != null && unit && <span className="text-base font-normal text-muted-foreground ml-1.5">{unit}</span>}
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
      <CardContent className="pt-5 pb-3 px-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">{label} · last 30 days</p>
        <ResponsiveContainer width="100%" height={90}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[1, 5]}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={18}
            />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13 }}
              labelStyle={{ color: 'var(--muted-foreground)' }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
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
        <StatCard label="Avg focus" value={avg(recent.map(d => d.focus_quality))?.toFixed(1) ?? null} unit="/ 5" />
        <StatCard label="Avg mood" value={avg(recent.map(d => d.mood_eod))?.toFixed(1) ?? null} unit="/ 5" />
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
  if (wins.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No wins logged yet. Capture your first win in the evening check-in.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {wins.map(d => (
        <Card key={d.date}>
          <CardContent className="py-5">
            <p className="leading-relaxed">{d.win_of_day}</p>
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
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">Log at least 5 days before running the AI report.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        onClick={fetchReport}
        disabled={loading}
        variant="outline"
        className="gap-2 h-11 border-primary/30 hover:border-primary/60 hover:bg-primary/5"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
        Generate report (last 30 days)
      </Button>
      {report && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-5">
            <p className="text-xs font-medium text-primary/70 uppercase tracking-wider mb-3">AI Pattern Report</p>
            <p className="leading-relaxed whitespace-pre-wrap">{report}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TaskRow({ entry: e }: { entry: TimeAuditEntry }) {
  const diff = e.actual_minutes - e.planned_minutes
  return (
    <Card>
      <CardContent className="py-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm leading-snug">{e.task}</p>
          {e.productivity != null && (
            <Badge variant="secondary" className="text-xs shrink-0">{e.productivity}/5</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>{e.planned_minutes}m planned</span>
          <span>·</span>
          <span>{e.actual_minutes}m actual</span>
          {diff !== 0 && (
            <span className={`font-medium ${diff > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {diff > 0 ? '+' : ''}{diff}m
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function HistoryTab({ logs }: { logs: DayLog[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date))

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No logs yet. Start your first check-in.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(d => (
        <Card
          key={d.date}
          className="cursor-pointer"
          onClick={() => setExpanded(expanded === d.date ? null : d.date)}
        >
          <CardContent className="py-4 px-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{format(parseISO(d.date), 'EEE, MMM d')}</p>
              <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                {d.sleep_hours != null && <span>😴 {d.sleep_hours}h</span>}
                {d.focus_quality != null && <span>🎯 {d.focus_quality}/5</span>}
                {d.mood_eod != null && <span>😊 {d.mood_eod}/5</span>}
              </div>
            </div>
            {expanded === d.date && (
              <div className="mt-3 pt-3 border-t border-border flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {d.sleep_quality != null && <span className="text-muted-foreground">Sleep quality: <span className="text-foreground">{d.sleep_quality}/5</span></span>}
                  {d.morning_energy != null && <span className="text-muted-foreground">Morning energy: <span className="text-foreground">{d.morning_energy}/5</span></span>}
                  {d.afternoon_energy != null && <span className="text-muted-foreground">Afternoon energy: <span className="text-foreground">{d.afternoon_energy}/5</span></span>}
                  {d.caffeine_cups != null && <span className="text-muted-foreground">Caffeine: <span className="text-foreground">{d.caffeine_cups} cups</span></span>}
                  {d.meds_taken != null && <span className="text-muted-foreground">Meds: <span className="text-foreground">{d.meds_taken ? 'Yes' : 'No'}</span></span>}
                  {d.exercise != null && <span className="text-muted-foreground">Exercise: <span className="text-foreground">{d.exercise ? `${d.exercise_minutes ?? '?'} min` : 'No'}</span></span>}
                </div>
                {d.win_of_day && <p className="text-xs mt-1"><span className="text-muted-foreground">Win: </span>{d.win_of_day}</p>}
                {d.where_left_off && <p className="text-xs"><span className="text-muted-foreground">Left off: </span>{d.where_left_off}</p>}
                {d.notes && <p className="text-xs"><span className="text-muted-foreground">Notes: </span>{d.notes}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TimeAuditTab() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [entries, setEntries] = useState<TimeAuditEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [task, setTask] = useState('')
  const [planned, setPlanned] = useState('')
  const [actual, setActual] = useState('')
  const [productivity, setProductivity] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  function loadEntries() {
    return getTimeAudit(30).then(setEntries).catch(() => {})
  }

  useEffect(() => {
    loadEntries().finally(() => setLoadingEntries(false))
  }, [])

  async function submit() {
    if (!task.trim() || !planned || !actual) return
    setSaving(true)
    try {
      await postTimeAudit({
        task: task.trim(),
        date: today,
        planned_minutes: Number(planned),
        actual_minutes: Number(actual),
        productivity: productivity ?? undefined,
      })
      await loadEntries()
      setTask('')
      setPlanned('')
      setActual('')
      setProductivity(null)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  const todayEntries = entries.filter(e => (e.date ?? today) === today)
  const pastEntries = entries.filter(e => (e.date ?? today) !== today)
  const byDate = pastEntries.reduce((acc, e) => {
    const d = e.date!
    if (!acc[d]) acc[d] = []
    acc[d].push(e)
    return acc
  }, {} as Record<string, TimeAuditEntry[]>)
  const pastDates = Object.keys(byDate).sort().reverse().slice(0, 7)

  return (
    <div className="flex flex-col gap-5">
      {/* Log form */}
      <Card>
        <CardContent className="py-5 flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Log a task</p>
          <Input placeholder="Task name" value={task} onChange={e => setTask(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Planned (min)</p>
              <Input type="number" placeholder="30" value={planned} onChange={e => setPlanned(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Actual (min)</p>
              <Input type="number" placeholder="45" value={actual} onChange={e => setActual(e.target.value)} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Productivity (optional)</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setProductivity(productivity === n ? null : n)}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${
                    productivity === n
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={submit}
            disabled={saving || !task.trim() || !planned || !actual}
            className="h-11 mt-1"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log task'}
          </Button>
        </CardContent>
      </Card>

      {/* Entry list */}
      {loadingEntries ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">No entries yet. Log your first task above.</p>
        </div>
      ) : (
        <>
          {todayEntries.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Today</p>
              <div className="flex flex-col gap-2">
                {todayEntries.map((e, i) => <TaskRow key={i} entry={e} />)}
              </div>
            </div>
          )}
          {pastDates.map(date => (
            <div key={date}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {format(parseISO(date), 'EEEE, MMM d')}
              </p>
              <div className="flex flex-col gap-2">
                {byDate[date].map((e, i) => <TaskRow key={i} entry={e} />)}
              </div>
            </div>
          ))}
        </>
      )}
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
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-6 border-b border-border/50">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        </div>
        <p className="text-muted-foreground mt-2 ml-12">Patterns from your daily log.</p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="overview">
            <TabsList className="w-full grid grid-cols-6 mb-6 h-10">
              <TabsTrigger value="overview" className="text-[10px]">Stats</TabsTrigger>
              <TabsTrigger value="patterns" className="text-[10px]">Trends</TabsTrigger>
              <TabsTrigger value="history" className="text-[10px]">History</TabsTrigger>
              <TabsTrigger value="wins" className="text-[10px]">Wins</TabsTrigger>
              <TabsTrigger value="ai" className="text-[10px]">AI</TabsTrigger>
              <TabsTrigger value="time" className="text-[10px]">Time</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><OverviewTab logs={logs} /></TabsContent>
            <TabsContent value="patterns"><PatternsTab logs={logs} /></TabsContent>
            <TabsContent value="history"><HistoryTab logs={logs} /></TabsContent>
            <TabsContent value="wins"><WinLogTab logs={logs} /></TabsContent>
            <TabsContent value="ai"><AIReportTab logs={logs} /></TabsContent>
            <TabsContent value="time"><TimeAuditTab /></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
