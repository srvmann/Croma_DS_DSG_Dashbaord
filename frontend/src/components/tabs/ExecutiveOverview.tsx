import { useEffect, useMemo, useState } from 'react'
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from 'framer-motion'
import { TrendingUp, TrendingDown, Users, Star, Moon } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'
import { fmtInr, fmtPct } from '@/lib/formatting'
import { kpiContainer, kpiItem, panelSpring } from '@/lib/animations'
import { PT } from '@/lib/plotlyTheme'

const Plot = createPlotlyComponent(Plotly)

// ── Types ─────────────────────────────────────────────────────────────────────

type EarlyTier      = 'Top Performer' | 'Mid-tier' | 'Low Tier'
type RecentCategory = 'Consistent Performer' | 'Fallen Star' | 'Average' | 'Consistently Low' | 'Rising Star'
type HealthStatus   = 'Healthy' | 'Recovering' | 'Declining' | 'Underperforming' | 'Dormant' | 'Stable'

// ── Color palette ─────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<HealthStatus, string> = {
  Healthy:         '#10b981',
  Recovering:      '#0ea5e9',
  Declining:       '#f59e0b',
  Underperforming: '#ef4444',
  Dormant:         '#94a3b8',
  Stable:          '#8b5cf6',
}

const EARLY_TIERS: EarlyTier[]      = ['Top Performer', 'Mid-tier', 'Low Tier']
const RECENT_CATS: RecentCategory[] = [
  'Consistent Performer', 'Fallen Star', 'Average', 'Consistently Low', 'Rising Star',
]

const EARLY_NODE_COLORS  = ['#0ea5e9', '#8b5cf6', '#94a3b8']
const RECENT_NODE_COLORS = ['#10b981', '#ef4444', '#f59e0b', '#64748b', '#06b6d4']
const SANKEY_LINK_COLORS = [
  'rgba(14,165,233,0.20)',
  'rgba(139,92,246,0.20)',
  'rgba(148,163,184,0.20)',
]

// nodeBorder re-uses the shared line token
const nodeBorder = PT.line

// ── Helpers ───────────────────────────────────────────────────────────────────

function halve(months: string[]): { early: string[]; recent: string[] } {
  const n = months.length
  if (n === 0) return { early: [], recent: [] }
  if (n === 1) return { early: [], recent: months }
  const half = Math.floor(n / 2)
  return {
    early:  months.slice(0, half),
    recent: n % 2 === 0 ? months.slice(half) : months.slice(half + 1),
  }
}

function winRev(store: StoreRecord, months: string[]): number {
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function pctileOf(rev: number, sorted: number[]): number {
  if (!sorted.length) return 0
  return (sorted.filter(r => r <= rev).length / sorted.length) * 100
}

function classifyEarlyTier(pct: number): EarlyTier {
  if (pct >= 67) return 'Top Performer'
  if (pct >= 33) return 'Mid-tier'
  return 'Low Tier'
}

function classifyRecentCategory(
  earlyTier: EarlyTier, recentPct: number, recentRev: number,
): RecentCategory {
  if (recentRev === 0) return 'Consistently Low'
  const band = recentPct >= 67 ? 'Top' : recentPct >= 33 ? 'Mid' : 'Low'
  if (earlyTier === 'Top Performer') {
    if (band === 'Top') return 'Consistent Performer'
    if (band === 'Low') return 'Fallen Star'
    return 'Average'
  }
  if (earlyTier === 'Low Tier') {
    if (band === 'Top') return 'Rising Star'
    if (band === 'Low') return 'Consistently Low'
    return 'Average'
  }
  if (band === 'Top') return 'Consistent Performer'
  if (band === 'Low') return 'Consistently Low'
  return 'Average'
}

function classifyHealth(ePct: number, rPct: number, rRev: number): HealthStatus {
  if (rRev === 0)           return 'Dormant'
  const diff = rPct - ePct
  if (rPct >= 67 && diff >= 0) return 'Healthy'
  if (diff >= 20)           return 'Recovering'
  if (diff <= -25)          return 'Declining'
  if (rPct < 20)            return 'Underperforming'
  return 'Stable'
}

// ── AnimatedNumber ────────────────────────────────────────────────────────────

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv      = useMotionValue(0)
  const display = useTransform(mv, (v: number) => Math.round(v).toLocaleString())

  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] })
    return () => ctrl.stop()
  }, [mv, value])

  return <motion.span className={className}>{display}</motion.span>
}

// ── MiniBar ───────────────────────────────────────────────────────────────────

function MiniBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="h-[3px] w-full rounded-full bg-gray-100 overflow-hidden mt-1.5">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ scaleX: 0, originX: 0 }}
        animate={{ scaleX: Math.min(Math.max(ratio, 0), 1) }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      />
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KPICardProps {
  label:     string
  value:     number
  sub:       string
  icon:      React.ReactNode
  barRatio?: number
  barColor?: string
  danger?:   boolean
}

function KPICard({ label, value, sub, icon, barRatio, barColor, danger }: KPICardProps) {
  return (
    <motion.div
      variants={kpiItem}
      whileHover={{
        scale: 1.035, y: -4,
        transition: { type: 'spring', stiffness: 420, damping: 26 },
      }}
      whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
      className={cn(
        'rounded-xl border bg-white p-4 flex flex-col gap-0.5 min-w-0 cursor-default',
        'shadow-sm hover:shadow-md transition-shadow duration-200',
        danger ? 'border-red-200' : 'border-gray-200',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500 truncate">
          {label}
        </p>
        <motion.span
          className={cn('shrink-0', danger ? 'text-red-400' : 'text-gray-400')}
          animate={danger ? { rotate: [0, -8, 8, -4, 0] } : {}}
          transition={{ duration: 0.5, delay: 0.6 }}
        >
          {icon}
        </motion.span>
      </div>

      <AnimatedNumber
        value={value}
        className={cn(
          'text-2xl font-bold tabular-nums block',
          danger ? 'text-red-600' : 'text-gray-900',
        )}
      />

      <p className="text-[11px] text-gray-500 truncate">{sub}</p>

      {barRatio !== undefined && barColor && (
        <MiniBar ratio={barRatio} color={barColor} />
      )}
    </motion.div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function ExecutiveOverview({ filters }: Props) {
  const { stores, months, classification } = useDataContext()

  // ── Filter + split ─────────────────────────────────────────────────────────
  const { fs, fm, early, recent } = useMemo(() => {
    let fs = stores
    if (filters.state)    fs = fs.filter(s => s.state    === filters.state)
    if (filters.category) fs = fs.filter(s => s.category === filters.category)
    let fm = months
    if (filters.fromMonth) {
      const i = months.indexOf(filters.fromMonth); if (i >= 0) fm = fm.slice(i)
    }
    if (filters.toMonth) {
      const i = months.indexOf(filters.toMonth); if (i >= 0) fm = fm.slice(0, i + 1)
    }
    const { early, recent } = halve(fm)
    return { fs, fm, early, recent }
  }, [stores, months, filters])

  // ── Journey data ───────────────────────────────────────────────────────────
  const journeys = useMemo(() => {
    if (!fs.length || !early.length || !recent.length) return []
    const eSorted = fs.map(s => winRev(s, early)).sort((a, b) => a - b)
    const rSorted = fs.map(s => winRev(s, recent)).sort((a, b) => a - b)
    return fs.map(store => {
      const eRev = winRev(store, early)
      const rRev = winRev(store, recent)
      const ePct = pctileOf(eRev, eSorted)
      const rPct = pctileOf(rRev, rSorted)
      const earlyTier      = classifyEarlyTier(ePct)
      const recentCategory = classifyRecentCategory(earlyTier, rPct, rRev)
      const health         = classifyHealth(ePct, rPct, rRev)
      return { store, eRev, rRev, ePct, rPct, earlyTier, recentCategory, health }
    })
  }, [fs, early, recent])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const scope    = journeys.length
    const improved = journeys.filter(j => j.rPct > j.ePct).length
    const declined = journeys.filter(j => j.rPct <= j.ePct).length
    const dormant  = journeys.filter(j => j.rRev === 0).length

    // Use the central classification engine so counts match the detail pages
    let engineScope = classification.metrics
    if (filters.state)    engineScope = engineScope.filter(m => m.store.state    === filters.state)
    if (filters.category) engineScope = engineScope.filter(m => m.store.category === filters.category)
    const rising = engineScope.filter(m => m.category === 'Rising Star').length
    const fallen = engineScope.filter(m => m.category === 'Fallen Star').length

    return { scope, improved, declined, rising, fallen, dormant }
  }, [journeys, classification, filters])

  // ── Sankey ─────────────────────────────────────────────────────────────────
  const sankeyTrace = useMemo(() => {
    if (!journeys.length) return null
    const labels = [...EARLY_TIERS, ...RECENT_CATS]
    const colors = [...EARLY_NODE_COLORS, ...RECENT_NODE_COLORS]
    const flowMap: Record<string, number> = {}
    for (const j of journeys) {
      const key = `${EARLY_TIERS.indexOf(j.earlyTier)}_${
        EARLY_TIERS.length + RECENT_CATS.indexOf(j.recentCategory)}`
      flowMap[key] = (flowMap[key] ?? 0) + 1
    }
    const sources: number[] = [], targets: number[] = []
    const values: number[]  = [], linkColors: string[] = []
    for (const [k, v] of Object.entries(flowMap)) {
      const [s, t] = k.split('_').map(Number)
      sources.push(s); targets.push(t); values.push(v)
      linkColors.push(SANKEY_LINK_COLORS[s % SANKEY_LINK_COLORS.length])
    }
    return { labels, colors, sources, targets, values, linkColors }
  }, [journeys])

  // ── Donut ──────────────────────────────────────────────────────────────────
  const donutCounts = useMemo(() => {
    const c: Record<HealthStatus, number> = {
      Healthy: 0, Recovering: 0, Declining: 0, Underperforming: 0, Dormant: 0, Stable: 0,
    }
    for (const j of journeys) c[j.health]++
    return c
  }, [journeys])

  // ── Bar data ───────────────────────────────────────────────────────────────
  const barEarly = useMemo(() =>
    early.map(m => ({ m, rev: fs.reduce((s, st) => s + (st.monthly_sales[m] ?? 0), 0) })),
  [fs, early])

  const barMid = useMemo(() => {
    const earlySet  = new Set(early)
    const recentSet = new Set(recent)
    return fm
      .filter(m => !earlySet.has(m) && !recentSet.has(m))
      .map(m => ({ m, rev: fs.reduce((s, st) => s + (st.monthly_sales[m] ?? 0), 0) }))
  }, [fs, fm, early, recent])

  const barRecent = useMemo(() =>
    recent.map(m => ({ m, rev: fs.reduce((s, st) => s + (st.monthly_sales[m] ?? 0), 0) })),
  [fs, recent])

  const totalEarly  = barEarly.reduce((s, d)  => s + d.rev, 0)
  const totalMid    = barMid.reduce((s, d)    => s + d.rev, 0)
  const totalRecent = barRecent.reduce((s, d) => s + d.rev, 0)
  const phaseShift  = totalEarly > 0 ? (totalRecent - totalEarly) / totalEarly * 100 : null

  const earlyLabel  = early.length  ? `${early[0]} – ${early[early.length - 1]}`    : ''
  const recentLabel = recent.length ? `${recent[0]} – ${recent[recent.length - 1]}` : ''

  const n       = kpis.scope || 1
  const cardCls = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
  const emptyMsg = 'flex items-center justify-center h-64 text-gray-400 text-sm'

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h2 className="text-base font-bold text-gray-900">Network Store Journey Summary</h2>
        <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl leading-relaxed">
          How the store network moved between the early phase
          {earlyLabel  ? ` (${earlyLabel})`  : ''} and recent phase
          {recentLabel ? ` (${recentLabel})` : ''}.
          Revenue is context; the story is store movement.
        </p>
      </motion.div>

      {/* ── KPI Row — staggered spring entrance ── */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        variants={kpiContainer}
        initial="hidden"
        animate="show"
      >
        <KPICard
          label="Stores in Scope" value={kpis.scope}
          sub={`of ${stores.length} tracked`}
          icon={<Users className="h-4 w-4" />}
          barRatio={kpis.scope / (stores.length || 1)} barColor="#6b7280"
        />
        <KPICard
          label="Improved Rank" value={kpis.improved}
          sub="Climbed in percentile"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          barRatio={kpis.improved / n} barColor="#10b981"
        />
        <KPICard
          label="Declined Rank" value={kpis.declined}
          sub="Slipped in percentile"
          icon={<TrendingDown className="h-4 w-4" />}
          barRatio={kpis.declined / n} barColor="#ef4444"
          danger
        />
        <KPICard
          label="Rising Stars" value={kpis.rising}
          sub="Bottom→top movers"
          icon={<Star className="h-4 w-4 text-amber-500" />}
          barRatio={kpis.rising / n} barColor="#f59e0b"
        />
        <KPICard
          label="Fallen Stars" value={kpis.fallen}
          sub="Top→bottom movers"
          icon={<Star className="h-4 w-4" />}
          barRatio={kpis.fallen / n} barColor="#ef4444"
          danger
        />
        <KPICard
          label="Dormant Now" value={kpis.dormant}
          sub="Zero recent revenue"
          icon={<Moon className="h-4 w-4 text-slate-400" />}
          barRatio={kpis.dormant / n} barColor="#94a3b8"
        />
      </motion.div>

      {/* ── Sankey + Donut ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

        {/* Store Journey Flow */}
        <motion.div {...panelSpring(0.12)} className={cn(cardCls, 'lg:col-span-3')}>
          <h3 className="text-sm font-semibold text-gray-800">Store Journey Flow</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            How early-phase tiers flowed into recent performance categories
          </p>
          {sankeyTrace ? (
            <Plot
              data={[{
                type: 'sankey' as const,
                orientation: 'h' as const,
                node: {
                  pad: 20,
                  thickness: 24,
                  line: { color: nodeBorder, width: 0.5 },
                  label: sankeyTrace.labels,
                  color: sankeyTrace.colors,
                },
                link: {
                  source:     sankeyTrace.sources,
                  target:     sankeyTrace.targets,
                  value:      sankeyTrace.values,
                  color:      sankeyTrace.linkColors,
                },
              }]}
              layout={{
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor:  'rgba(0,0,0,0)',
                font:  { color: PT.font, family: 'Inter, sans-serif', size: 11 },
                margin: { l: 8, r: 8, t: 8, b: 8 },
                height: 300,
                uirevision: 'constant',
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
            />
          ) : (
            <div className={emptyMsg}>No data for selected filters</div>
          )}
        </motion.div>

        {/* Store Movement Summary */}
        <motion.div {...panelSpring(0.2)} className={cn(cardCls, 'lg:col-span-2')}>
          <h3 className="text-sm font-semibold text-gray-800">Store Movement Summary</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            Performance & status distribution of in-scope stores
          </p>
          {journeys.length > 0 ? (
            <Plot
              data={[{
                type: 'pie' as const,
                hole: 0.55,
                labels: Object.keys(donutCounts),
                values: Object.values(donutCounts),
                marker: {
                  colors: (Object.keys(donutCounts) as HealthStatus[]).map(k => HEALTH_COLORS[k]),
                  line: { color: '#ffffff', width: 2 },
                },
                textinfo:      'percent' as const,
                textfont:      { size: 10, color: '#ffffff' },
                hovertemplate: '<b>%{label}</b><br>%{value} stores · %{percent}<extra></extra>',
                sort: false,
              }]}
              layout={{
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor:  'rgba(0,0,0,0)',
                font:  { color: PT.font, family: 'Inter, sans-serif', size: 10 },
                showlegend: true,
                legend: {
                  bgcolor: 'rgba(0,0,0,0)',
                  font: { size: 10, color: PT.font },
                  orientation: 'h' as const,
                  x: 0, y: -0.1,
                },
                margin: { l: 10, r: 10, t: 10, b: 80 },
                height: 300,
                uirevision: 'constant',
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
            />
          ) : (
            <div className={emptyMsg}>No data for selected filters</div>
          )}
        </motion.div>
      </div>

      {/* ── Revenue bar chart ── */}
      <motion.div {...panelSpring(0.28)} className={cardCls}>
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Revenue Context — Network Trend</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Monthly gross revenue · early / mid / recent phases
              {totalEarly + totalMid + totalRecent > 0
                ? ` · ${fmtInr(totalEarly + totalMid + totalRecent)} total`
                : ''}
            </p>
          </div>
          {phaseShift !== null && (
            <motion.span
              key={Math.round(phaseShift)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={cn(
                'text-xs font-semibold px-2.5 py-1 rounded-full border',
                phaseShift >= 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200',
              )}
            >
              {fmtPct(phaseShift)} phase shift
            </motion.span>
          )}
        </div>

        {(barEarly.length + barMid.length + barRecent.length) === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            No data for selected filters
          </div>
        ) : (
          <Plot
            data={[
              {
                type: 'bar' as const,
                name: 'Early Phase',
                x: barEarly.map(d => d.m),
                y: barEarly.map(d => d.rev),
                marker: { color: '#94a3b8' },
                hovertemplate: '<b>%{x}</b><br>₹%{y:,.0f}<extra>Early Phase</extra>',
              },
              ...(barMid.length > 0 ? [{
                type: 'bar' as const,
                name: 'Mid Phase',
                x: barMid.map(d => d.m),
                y: barMid.map(d => d.rev),
                marker: { color: '#8b5cf6' },
                hovertemplate: '<b>%{x}</b><br>₹%{y:,.0f}<extra>Mid Phase</extra>',
              }] : []),
              {
                type: 'bar' as const,
                name: 'Recent Phase',
                x: barRecent.map(d => d.m),
                y: barRecent.map(d => d.rev),
                marker: { color: '#3b82f6' },
                hovertemplate: '<b>%{x}</b><br>₹%{y:,.0f}<extra>Recent Phase</extra>',
              },
            ]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font:   { color: PT.font, family: 'Inter, sans-serif', size: 11 },
              xaxis:  { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true },
              yaxis:  {
                gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line,
                automargin: true, tickformat: ',.0s',
                title: { text: 'Revenue (₹)' },
              },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font: { color: PT.font, size: 10 },
                orientation: 'h' as const,
                x: 0, y: 1.08,
              },
              margin:     { l: 70, r: 16, t: 36, b: 70 },
              height:     260,
              bargap:     0.25,
              uirevision: 'constant',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        )}
      </motion.div>

    </div>
  )
}
