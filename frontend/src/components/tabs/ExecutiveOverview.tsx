import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Minus,
  Building2, Activity, BarChart2,
  ChevronUp, ChevronDown,
} from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthTier = 'Healthy' | 'Recovering' | 'Declining' | 'Dormant' | 'Underperforming'
type SortKey = 'name' | 'state' | 'category' | 'revenue' | 'growth'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899',
  '#14b8a6', '#a855f7', '#f43f5e', '#22d3ee',
]

const HEALTH_ORDER: HealthTier[] = [
  'Healthy', 'Recovering', 'Declining', 'Dormant', 'Underperforming',
]

const HEALTH_HEX: Record<HealthTier, string> = {
  Healthy: '#10b981',
  Recovering: '#3b82f6',
  Declining: '#f59e0b',
  Dormant: '#f97316',
  Underperforming: '#ef4444',
}

const HEALTH_BADGE: Record<HealthTier, string> = {
  Healthy: 'bg-emerald-500/15 text-emerald-400',
  Recovering: 'bg-blue-500/15 text-blue-400',
  Declining: 'bg-amber-500/15 text-amber-400',
  Dormant: 'bg-orange-500/15 text-orange-400',
  Underperforming: 'bg-red-500/15 text-red-400',
}

const PLOTLY_AXES = {
  gridcolor: '#1f2937',
  linecolor: '#374151',
  tickcolor: '#374151',
  automargin: true,
} as const

// ── Pure helpers ──────────────────────────────────────────────────────────────

function halve(months: string[]): { early: string[]; recent: string[] } {
  const n = months.length
  if (n === 0) return { early: [], recent: [] }
  if (n === 1) return { early: [], recent: months }
  const half = Math.floor(n / 2)
  return {
    early: months.slice(0, half),
    recent: n % 2 === 0 ? months.slice(half) : months.slice(half + 1),
  }
}

function fmtInr(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function winRev(store: StoreRecord, months: string[]): number {
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function mAvg(store: StoreRecord, months: string[]): number {
  return months.length ? winRev(store, months) / months.length : 0
}

function growthPct(store: StoreRecord, early: string[], recent: string[]): number | null {
  if (!early.length || !recent.length) return null
  const e = mAvg(store, early)
  return e === 0 ? null : (mAvg(store, recent) - e) / e * 100
}

function scoreStore(store: StoreRecord, wm: string[], early: string[], recent: string[]): number {
  const revs = wm.map(m => store.monthly_sales[m] ?? 0)
  const total = revs.reduce((s, r) => s + r, 0)
  if (total === 0) return 0

  // Trend: 0–50 pts
  const e = mAvg(store, early)
  const r = mAvg(store, recent)
  const ratio = e === 0 ? 1 : r / e
  const trend = Math.min(50, Math.max(0, 25 + (ratio - 1) * 50))

  // Consistency: 0–30 pts
  const mean = total / revs.length
  const coV = mean === 0 ? 1 : Math.sqrt(revs.reduce((s, v) => s + (v - mean) ** 2, 0) / revs.length) / mean
  const consistency = Math.max(0, 30 * (1 - Math.min(coV, 1)))

  // Activity: 0–20 pts
  const check = recent.length ? recent : wm
  const activity = (check.filter(m => (store.monthly_sales[m] ?? 0) > 0).length / check.length) * 20

  return trend + consistency + activity
}

function tier(score: number): HealthTier {
  if (score >= 70) return 'Healthy'
  if (score >= 50) return 'Recovering'
  if (score >= 30) return 'Declining'
  if (score >= 15) return 'Dormant'
  return 'Underperforming'
}

function trendTag(g: number | null): { label: string; cls: string; icon: 'up' | 'flat' | 'down' } {
  if (g === null) return { label: 'N/A', cls: 'text-gray-500', icon: 'flat' }
  if (g > 10) return { label: fmtPct(g), cls: 'text-emerald-400', icon: 'up' }
  if (g >= -5) return { label: fmtPct(g), cls: 'text-blue-400', icon: 'flat' }
  return { label: fmtPct(g), cls: 'text-red-400', icon: 'down' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon: React.ReactNode
  delay?: number
}

function KPICard({ label, value, sub, valueClass, icon, delay = 0 }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-1 min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500 truncate">
          {label}
        </p>
        <span className="shrink-0 text-gray-600">{icon}</span>
      </div>
      <p className={cn('text-2xl font-bold text-white tabular-nums truncate', valueClass)}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
    </motion.div>
  )
}

function InsightCard({
  tag, tagCls, title, body, delay,
}: {
  tag: string; tagCls: string; title: string; body: string; delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl border border-gray-800 bg-gray-900 p-5 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', tagCls)}>
          {tag}
        </span>
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </div>
      <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function ExecutiveOverview({ filters }: Props) {
  const { stores, months } = useDataContext()
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Filter + split ─────────────────────────────────────────────────────────
  const { fs, fm, early, recent } = useMemo(() => {
    let fs = stores
    if (filters.state) fs = fs.filter(s => s.state === filters.state)
    if (filters.category) fs = fs.filter(s => s.category === filters.category)

    let fm = months
    if (filters.fromMonth) {
      const i = months.indexOf(filters.fromMonth)
      if (i >= 0) fm = fm.slice(i)
    }
    if (filters.toMonth) {
      const i = months.indexOf(filters.toMonth)
      if (i >= 0) fm = fm.slice(0, i + 1)
    }

    const { early, recent } = halve(fm)
    return { fs, fm, early, recent }
  }, [stores, months, filters])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const n = fs.length
    const active = fs.filter(s => winRev(s, fm) > 0).length
    const totalRev = fs.reduce((s, st) => s + winRev(st, fm), 0)
    const avgRev = n > 0 ? totalRev / n : 0

    const earlySum = fs.reduce((s, st) => s + mAvg(st, early), 0)
    const recentSum = fs.reduce((s, st) => s + mAvg(st, recent), 0)
    const revGrowth = early.length && earlySum > 0 ? (recentSum - earlySum) / earlySum * 100 : null

    let growing = 0
    let declining = 0
    for (const st of fs) {
      const g = growthPct(st, early, recent)
      if (g === null) continue
      if (g > 0) growing++
      else if (g < 0) declining++
    }

    return { n, active, totalRev, avgRev, revGrowth, growing, declining }
  }, [fs, fm, early, recent])

  // ── State revenue trend lines ──────────────────────────────────────────────
  const trendTraces = useMemo(() => {
    const byState: Record<string, Record<string, number>> = {}
    for (const store of fs) {
      const state = store.state ?? 'Unknown'
      if (!byState[state]) byState[state] = {}
      for (const m of fm) {
        byState[state][m] = (byState[state][m] ?? 0) + (store.monthly_sales[m] ?? 0)
      }
    }
    return Object.entries(byState).map(([state, revByM], i) => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: state,
      x: fm,
      y: fm.map(m => revByM[m] ?? 0),
      line: {
        shape: 'spline' as const,
        smoothing: 1.2,
        width: 2.5,
        color: STATE_PALETTE[i % STATE_PALETTE.length],
      },
      hovertemplate: `<b>${state}</b><br>%{x}<br>₹%{y:,.0f}<extra></extra>`,
    }))
  }, [fs, fm])

  // ── Health counts ──────────────────────────────────────────────────────────
  const healthCounts = useMemo(() => {
    const c: Record<HealthTier, number> = {
      Healthy: 0, Recovering: 0, Declining: 0, Dormant: 0, Underperforming: 0,
    }
    for (const store of fs) c[tier(scoreStore(store, fm, early, recent))]++
    return c
  }, [fs, fm, early, recent])

  // ── Top 10 stores ──────────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    const rows = fs.map(store => ({
      store,
      rev: winRev(store, fm),
      growth: growthPct(store, early, recent),
      score: scoreStore(store, fm, early, recent),
    }))

    rows.sort((a, b) => {
      let d = 0
      if (sortKey === 'revenue') d = a.rev - b.rev
      else if (sortKey === 'growth') d = (a.growth ?? -1e9) - (b.growth ?? -1e9)
      else if (sortKey === 'name') d = (a.store.store_name ?? '').localeCompare(b.store.store_name ?? '')
      else if (sortKey === 'state') d = (a.store.state ?? '').localeCompare(b.store.state ?? '')
      else if (sortKey === 'category') d = (a.store.category ?? '').localeCompare(b.store.category ?? '')
      return sortDir === 'asc' ? d : -d
    })

    return rows.slice(0, 10)
  }, [fs, fm, early, recent, sortKey, sortDir])

  // ── AI Insights ────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (fs.length === 0) return {
      what: 'No stores match the current filters.',
      why: 'Try adjusting the state, category, or date range filters to broaden the selection.',
      action: 'Reset all filters to restore the full portfolio overview.',
    }

    const stateRevs: Record<string, number> = {}
    const stateGrowths: Record<string, number[]> = {}
    for (const store of fs) {
      const state = store.state ?? 'Other'
      stateRevs[state] = (stateRevs[state] ?? 0) + winRev(store, fm)
      const g = growthPct(store, early, recent)
      if (g !== null) (stateGrowths[state] ??= []).push(g)
    }

    const topRevState = Object.entries(stateRevs).sort((a, b) => b[1] - a[1])[0]
    const growthAvgs = Object.entries(stateGrowths).map(([s, gs]) => ({
      state: s,
      avg: gs.reduce((a, b) => a + b, 0) / gs.length,
    })).sort((a, b) => b.avg - a.avg)

    const best = growthAvgs[0]
    const worst = growthAvgs[growthAvgs.length - 1]
    const atRisk = healthCounts.Declining + healthCounts.Dormant + healthCounts.Underperforming
    const g = kpis.revGrowth

    const growthStr = g === null ? 'remained stable'
      : g >= 0 ? `grew by ${fmtPct(g)}`
        : `declined by ${(-g).toFixed(1)}%`

    const what = `${fs.length} store${fs.length !== 1 ? 's' : ''} generated ${fmtInr(kpis.totalRev)} over ${fm.length} month${fm.length !== 1 ? 's' : ''}. Portfolio revenue ${growthStr} vs. the prior period. ${healthCounts.Healthy} store${healthCounts.Healthy !== 1 ? 's are' : ' is'} performing at a healthy level.`

    const why = best
      ? `${best.state} led portfolio growth (avg ${fmtPct(best.avg)}/store)${topRevState ? `, while ${topRevState[0]} contributed the highest absolute revenue at ${fmtInr(topRevState[1])}` : ''}. ${worst && worst.state !== best.state ? `${worst.state} showed the weakest momentum at avg ${fmtPct(worst.avg)}/store.` : ''}`
      : `Revenue is distributed across ${Object.keys(stateRevs).length} state${Object.keys(stateRevs).length !== 1 ? 's' : ''}${topRevState ? `. ${topRevState[0]} leads with ${fmtInr(topRevState[1])} in total revenue` : ''}.`

    const action = atRisk > fs.length * 0.33
      ? `${atRisk} stores (${Math.round(atRisk / fs.length * 100)}% of portfolio) are at risk. Prioritise recovery programmes with immediate focus on ${worst ? worst.state : 'underperforming regions'}.`
      : g !== null && g > 5
        ? `Strong portfolio momentum. Accelerate expansion in ${best ? best.state : 'high-growth markets'} and replicate best-practices to lift ${healthCounts.Recovering} recovering stores into the healthy tier.`
        : `Stabilise the ${healthCounts.Declining} declining stores before the next review cycle. Investigate category-level root causes to prevent further deterioration.`

    return { what, why, action }
  }, [fs, fm, early, recent, kpis, healthCounts])

  // ── Sort helpers ───────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortIcon = (col: SortKey) =>
    sortKey !== col
      ? <ChevronUp className="h-3 w-3 opacity-25" />
      : sortDir === 'asc'
        ? <ChevronUp className="h-3 w-3 text-blue-400" />
        : <ChevronDown className="h-3 w-3 text-blue-400" />

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <KPICard
          label="Total Stores"
          value={kpis.n.toLocaleString()}
          sub={`${fm.length} month window`}
          icon={<Building2 className="h-4 w-4" />}
          delay={0}
        />
        <KPICard
          label="Active Stores"
          value={kpis.active.toLocaleString()}
          sub={`${kpis.n - kpis.active} inactive`}
          icon={<Activity className="h-4 w-4" />}
          delay={0.04}
        />
        <KPICard
          label="Total Revenue"
          value={fmtInr(kpis.totalRev)}
          sub={`${fm.length}m window`}
          icon={<BarChart2 className="h-4 w-4" />}
          delay={0.08}
        />
        <KPICard
          label="Avg Rev / Store"
          value={fmtInr(kpis.avgRev)}
          icon={<BarChart2 className="h-4 w-4" />}
          delay={0.12}
        />
        <KPICard
          label="Revenue Growth"
          value={kpis.revGrowth === null ? 'N/A' : fmtPct(kpis.revGrowth)}
          sub="early vs recent half"
          valueClass={kpis.revGrowth === null ? undefined : kpis.revGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}
          icon={kpis.revGrowth === null
            ? <Minus className="h-4 w-4" />
            : kpis.revGrowth >= 0
              ? <TrendingUp className="h-4 w-4 text-emerald-400" />
              : <TrendingDown className="h-4 w-4 text-red-400" />}
          delay={0.16}
        />
        <KPICard
          label="Stores Growing"
          value={kpis.growing.toLocaleString()}
          sub={kpis.n > 0 ? `${Math.round(kpis.growing / kpis.n * 100)}% of portfolio` : undefined}
          valueClass="text-emerald-400"
          icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
          delay={0.20}
        />
        <KPICard
          label="Stores Declining"
          value={kpis.declining.toLocaleString()}
          sub={kpis.n > 0 ? `${Math.round(kpis.declining / kpis.n * 100)}% of portfolio` : undefined}
          valueClass="text-red-400"
          icon={<TrendingDown className="h-4 w-4 text-red-400" />}
          delay={0.24}
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-1 text-sm font-semibold text-gray-200">Revenue Trend by State</h3>
          <p className="mb-3 text-[11px] text-gray-500">Monthly aggregated revenue per state · spline smoothed</p>
          {trendTraces.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-600 text-sm">
              No data for selected filters
            </div>
          ) : (
            <Plot
              data={trendTraces}
              layout={{
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
                legend: {
                  bgcolor: 'rgba(0,0,0,0)',
                  font: { color: '#9ca3af', size: 10 },
                  orientation: 'h' as const,
                  y: -0.18,
                },
                xaxis: { ...PLOTLY_AXES },
                yaxis: {
                  ...PLOTLY_AXES,
                  title: { text: 'Revenue (₹)' },
                  tickformat: ',.0f',
                },
                hovermode: 'x unified' as const,
                margin: { l: 70, r: 16, t: 8, b: 90 },
                height: 320,
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
            />
          )}
        </motion.div>

        {/* Store Health Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-1 text-sm font-semibold text-gray-200">Store Health Distribution</h3>
          <p className="mb-3 text-[11px] text-gray-500">Based on growth trend, consistency & activity</p>
          {fs.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-600 text-sm">
              No data for selected filters
            </div>
          ) : (
            <>
              <Plot
                data={[{
                  type: 'funnel' as const,
                  y: HEALTH_ORDER,
                  x: HEALTH_ORDER.map(t => healthCounts[t]),
                  textposition: 'inside' as const,
                  textinfo: 'value+percent' as const,
                  textfont: { color: '#ffffff', size: 12 },
                  marker: {
                    color: HEALTH_ORDER.map(t => HEALTH_HEX[t]),
                    line: { color: '#111827', width: 1.5 },
                  },
                }]}
                layout={{
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  plot_bgcolor: 'rgba(0,0,0,0)',
                  font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
                  margin: { l: 120, r: 30, t: 8, b: 8 },
                  height: 260,
                  showlegend: false,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
              />
              {/* Colour legend pills */}
              <div className="flex flex-wrap gap-2 mt-1 justify-center">
                {HEALTH_ORDER.map(t => (
                  <span key={t} className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', HEALTH_BADGE[t])}>
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* ── Top 10 Stores table ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Top 10 Stores</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Sorted by {sortKey} · click column headers to re-sort
            </p>
          </div>
          <span className="text-xs text-gray-600">{fs.length} stores total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="px-3 py-2.5 text-left text-xs text-gray-600 w-8">#</th>
                {(
                  [
                    { key: 'name' as SortKey, label: 'Store Name' },
                    { key: 'state' as SortKey, label: 'State' },
                    { key: 'category' as SortKey, label: 'Category' },
                    { key: 'revenue' as SortKey, label: 'Revenue' },
                    { key: 'growth' as SortKey, label: 'Growth %' },
                  ] as const
                ).map(({ key, label }) => (
                  <th key={key} className="px-3 py-2.5 text-left">
                    <button
                      onClick={() => toggleSort(key)}
                      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      {label}
                      {sortIcon(key)}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                  Trend
                </th>
              </tr>
            </thead>

            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-600 text-sm">
                    No stores match the current filters
                  </td>
                </tr>
              ) : (
                tableRows.map(({ store, rev, growth, score: s }, i) => {
                  const tag = trendTag(growth)
                  const t = tier(s)
                  return (
                    <tr
                      key={store.store_id}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-gray-600 tabular-nums text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-200 font-medium block truncate max-w-[180px]" title={store.store_name ?? store.store_id}>
                          {store.store_name ?? store.store_id}
                        </span>
                        <span className="text-[10px] text-gray-600">{store.store_id}</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">{store.state ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">{store.category ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-200 tabular-nums font-medium whitespace-nowrap">
                        {fmtInr(rev)}
                      </td>
                      <td className={cn('px-3 py-2.5 tabular-nums font-medium whitespace-nowrap', tag.cls)}>
                        {tag.label}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap', HEALTH_BADGE[t])}>
                          {tag.icon === 'up' && <TrendingUp className="h-3 w-3 shrink-0" />}
                          {tag.icon === 'flat' && <Minus className="h-3 w-3 shrink-0" />}
                          {tag.icon === 'down' && <TrendingDown className="h-3 w-3 shrink-0" />}
                          {t}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── AI Insights ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InsightCard
          tag="What Happened"
          tagCls="bg-blue-500/15 text-blue-400"
          title="Portfolio Summary"
          body={insights.what}
          delay={0.25}
        />
        <InsightCard
          tag="Why"
          tagCls="bg-purple-500/15 text-purple-400"
          title="Key Drivers"
          body={insights.why}
          delay={0.3}
        />
        <InsightCard
          tag="Action"
          tagCls="bg-emerald-500/15 text-emerald-400"
          title="Recommendation"
          body={insights.action}
          delay={0.35}
        />
      </div>

    </div>
  )
}
