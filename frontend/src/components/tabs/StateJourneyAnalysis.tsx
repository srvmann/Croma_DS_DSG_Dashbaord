import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronUp, ChevronDown,
  TrendingUp, TrendingDown,
  Star, ShieldAlert, Zap, MapPin,
} from 'lucide-react'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Types ─────────────────────────────────────────────────────────────────────

type Journey = 'Rising Star' | 'Fallen Star' | 'Consistent Performer' | 'Consistently Low' | 'Average'
type SortKey = 'state' | 'stores' | 'active' | 'growth' | 'revenue' | 'health' | 'risk' | 'opp'

interface StateRow {
  state:      string
  total:      number
  active:     number
  inactive:   number
  earlyRev:   number
  recentRev:  number
  totalRevV:  number
  growthPct:  number | null
  avgStore:   number
  netPct:     number | null
  rising:     number
  fallen:     number
  consistent: number
  low:        number
  average:    number
  health:     number
  risk:       number
  opp:        number
  topStore:   { store: StoreRecord; rev: number } | null
  worstStore: { store: StoreRecord; rev: number } | null
}

// ── Light-mode Plotly theme ───────────────────────────────────────────────────

const PT = { font: '#6b7280', grid: '#f3f4f6', line: '#e5e7eb' }
const PLOTLY_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font: { color: PT.font, family: 'Inter, sans-serif', size: 11 },
}

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

function mAvg(store: StoreRecord, months: string[]): number {
  if (!months.length) return 0
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0) / months.length
}

function sumRev(store: StoreRecord, months: string[]): number {
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function fmtInr(n: number): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function classifyJourney(
  store: StoreRecord,
  fm: string[],
  early: string[],
  recent: string[],
  medianWindowRev: number,
): Journey {
  const earlyAvg  = mAvg(store, early)
  const recentAvg = mAvg(store, recent)

  if (early.length > 0 && recent.length > 0 && earlyAvg > 0) {
    const ratio = recentAvg / earlyAvg
    if (ratio > 1.15) return 'Rising Star'
    if (ratio < 0.85) return 'Fallen Star'
  }

  const revs = fm.map(m => store.monthly_sales[m] ?? 0)
  const mean = revs.reduce((s, r) => s + r, 0) / (revs.length || 1)
  if (mean === 0) return 'Consistently Low'

  const coV = Math.sqrt(revs.reduce((s, r) => s + (r - mean) ** 2, 0) / revs.length) / mean
  if (coV < 0.10) {
    return sumRev(store, fm) > medianWindowRev ? 'Consistent Performer' : 'Consistently Low'
  }
  return 'Average'
}

// ── NetworkFunnel ─────────────────────────────────────────────────────────────

const POSITIVE_STEPS = [
  {
    label: 'All Tracked Stores',
    color: '#0f172a',
    desc:  'All stores in the network for the selected period',
  },
  {
    label: 'Active Stores',
    color: '#0369a1',
    desc:  'Stores with revenue recorded in the recent period',
  },
  {
    label: 'Growing Stores',
    color: '#059669',
    desc:  'Rising Stars + Consistent Performers — on a positive trajectory',
  },
  {
    label: 'Rising Stars',
    color: '#d97706',
    desc:  'Stores with >15% avg revenue growth vs the early period',
  },
]

const FALLEN_META = {
  label: 'Fallen Stars',
  color: '#dc2626',
  desc:  'Stores with >15% avg revenue decline vs the early period',
}

function NetworkFunnel({ counts, total }: {
  counts: { all: number; active: number; growing: number; rising: number; fallen: number }
  total: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  const positive = [
    { ...POSITIVE_STEPS[0], count: counts.all,     pct: 100 },
    { ...POSITIVE_STEPS[1], count: counts.active,  pct: pct(counts.active) },
    { ...POSITIVE_STEPS[2], count: counts.growing, pct: pct(counts.growing) },
    { ...POSITIVE_STEPS[3], count: counts.rising,  pct: pct(counts.rising) },
  ]
  const fallen = { ...FALLEN_META, count: counts.fallen, pct: pct(counts.fallen) }

  // All steps for tooltip lookup (positive 0-3, fallen = 4)
  const allSteps = [...positive, fallen]

  const FunnelBar = ({
    step, idx,
  }: {
    step: typeof positive[0]
    idx: number
  }) => {
    const displayW = Math.max(step.pct, 8)
    const showFull = displayW >= 26
    const isHov    = hovered === idx

    return (
      <div
        className="rounded-xl flex items-center justify-between px-4 cursor-pointer select-none relative overflow-hidden"
        style={{ backgroundColor: step.color, height: 50, width: `${displayW}%` }}
        onMouseEnter={() => setHovered(idx)}
        onMouseLeave={() => setHovered(null)}
      >
        {/* White highlight overlay on hover */}
        <div
          className="absolute inset-0 bg-white pointer-events-none rounded-xl transition-opacity duration-150"
          style={{ opacity: isHov ? 0.13 : 0 }}
        />
        {/* Glow ring on hover */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none transition-all duration-150"
          style={{ boxShadow: isHov ? `0 0 0 2px ${step.color}, 0 0 10px 2px ${step.color}66` : 'none' }}
        />

        {showFull ? (
          <>
            <div className="relative min-w-0 flex-1 z-10">
              <p className="text-white font-bold text-sm leading-tight truncate">{step.label}</p>
              <p className="text-white/55 text-xs tabular-nums">{step.count.toLocaleString()} stores</p>
            </div>
            <span className="relative z-10 text-white/75 font-bold text-sm tabular-nums ml-3 shrink-0">
              {step.pct.toFixed(0)}%
            </span>
          </>
        ) : (
          <div className="relative z-10 w-full text-center">
            <span className="text-white font-bold text-xs tabular-nums">{step.pct.toFixed(0)}%</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* ── Positive funnel ── */}
      <div className="space-y-1.5 flex flex-col items-center">
        {positive.map((step, i) => (
          <div key={step.label} className="w-full flex flex-col items-center">
            <FunnelBar step={step} idx={i} />
            {i < positive.length - 1 && (
              <div className="w-px h-2 bg-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* ── Separator ── */}
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 border-t border-dashed border-gray-300" />
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">at risk</span>
        <div className="flex-1 border-t border-dashed border-gray-300" />
      </div>

      {/* ── Fallen Stars bar ── */}
      <div className="flex flex-col items-center">
        <FunnelBar step={fallen} idx={4} />
      </div>

      {/* ── Hover tooltip ── */}
      <AnimatePresence>
        {hovered !== null && (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="mt-3 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block h-3 w-3 rounded shrink-0"
                style={{ backgroundColor: allSteps[hovered].color }}
              />
              <span className="text-sm font-bold text-gray-800">{allSteps[hovered].label}</span>
            </div>
            <p className="text-sm text-gray-700">
              <span className="font-bold tabular-nums text-gray-900">
                {allSteps[hovered].count.toLocaleString()}
              </span>{' '}
              stores
              {' · '}
              <span className="font-bold tabular-nums" style={{ color: allSteps[hovered].color }}>
                {allSteps[hovered].pct.toFixed(1)}%
              </span>{' '}
              of total
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{allSteps[hovered].desc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── HealthBadge ────────────────────────────────────────────────────────────────

function HealthBadge({ value }: { value: number }) {
  const color =
    value >= 75 ? 'text-emerald-600' :
    value >= 50 ? 'text-amber-600'   :
                  'text-red-500'
  return <span className={cn('tabular-nums font-semibold', color)}>{value.toFixed(1)}</span>
}

// ── RiskBadge ─────────────────────────────────────────────────────────────────

function RiskBadge({ value }: { value: number }) {
  const color =
    value <= 10 ? 'text-emerald-600' :
    value <= 25 ? 'text-amber-600'   :
                  'text-red-500'
  return <span className={cn('tabular-nums font-semibold', color)}>{value.toFixed(1)}</span>
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function StateJourneyAnalysis({ filters }: Props) {
  const { stores, months } = useDataContext()
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [compState, setCompState] = useState<string | null>(null)

  // ── Filter + split (state filter intentionally ignored) ────────────────────
  const { fs, fm, early, recent } = useMemo(() => {
    let fs = stores
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

  // ── Per-store classification ───────────────────────────────────────────────
  const classifiedStores = useMemo(() => {
    const allRevs   = fs.map(s => sumRev(s, fm)).sort((a, b) => a - b)
    const medianRev = allRevs.length ? allRevs[Math.floor(allRevs.length / 2)] : 0

    return fs.map(store => {
      const earlyAvg      = mAvg(store, early)
      const recentAvg     = mAvg(store, recent)
      const rev           = sumRev(store, fm)
      const earlyR        = sumRev(store, early)
      const recentR       = sumRev(store, recent)
      const growthPct     = early.length && recent.length && earlyAvg > 0
        ? (recentAvg - earlyAvg) / earlyAvg * 100
        : null
      const isRecentActive = recent.length
        ? recent.some(m => (store.monthly_sales[m] ?? 0) > 0)
        : fm.some(m => (store.monthly_sales[m] ?? 0) > 0)
      const journey        = classifyJourney(store, fm, early, recent, medianRev)
      return { store, rev, earlyR, recentR, growthPct, isRecentActive, journey }
    })
  }, [fs, fm, early, recent])

  // ── Funnel counts ─────────────────────────────────────────────────────────
  const funnel = useMemo(() => ({
    all:     classifiedStores.length,
    active:  classifiedStores.filter(c => c.isRecentActive).length,
    growing: classifiedStores.filter(c =>
      c.journey === 'Rising Star' || c.journey === 'Consistent Performer'
    ).length,
    rising: classifiedStores.filter(c => c.journey === 'Rising Star').length,
    fallen: classifiedStores.filter(c => c.journey === 'Fallen Star').length,
  }), [classifiedStores])

  // ── Per-state aggregations ─────────────────────────────────────────────────
  const stateMetrics = useMemo((): StateRow[] => {
    const map = new Map<string, typeof classifiedStores>()
    for (const c of classifiedStores) {
      const st = c.store.state ?? 'Unknown'
      if (!map.has(st)) map.set(st, [])
      map.get(st)!.push(c)
    }

    const totalPortfolioRev = classifiedStores.reduce((s, c) => s + c.rev, 0)

    const rows: StateRow[] = []
    for (const [state, data] of map) {
      const total     = data.length
      const active    = data.filter(d => d.isRecentActive).length
      const inactive  = total - active
      const earlyRev  = data.reduce((s, d) => s + d.earlyR, 0)
      const recentRev = data.reduce((s, d) => s + d.recentR, 0)
      const totalRevV = data.reduce((s, d) => s + d.rev, 0)

      const growthPct = earlyRev > 0 ? (recentRev - earlyRev) / earlyRev * 100 : null
      const netPct    = totalPortfolioRev > 0 ? totalRevV / totalPortfolioRev * 100 : null
      const avgStore  = total > 0 ? totalRevV / total : 0

      const rising     = data.filter(d => d.journey === 'Rising Star').length
      const fallen     = data.filter(d => d.journey === 'Fallen Star').length
      const consistent = data.filter(d => d.journey === 'Consistent Performer').length
      const low        = data.filter(d => d.journey === 'Consistently Low').length
      const average    = data.filter(d => d.journey === 'Average').length

      // Health (0–100): weighted composite of active ratio, growth momentum, rising share
      const activeRatio  = total > 0 ? active / total : 0
      const growthHealth = growthPct !== null
        ? Math.max(0, Math.min(1, (growthPct + 100) / 200))
        : 0.5
      const risingRatio  = total > 0 ? rising / total : 0
      const health = Math.round((activeRatio * 0.5 + growthHealth * 0.3 + risingRatio * 0.2) * 100 * 10) / 10

      // Risk (0–100): fallen + inactive weighted
      const risk = Math.round(
        total > 0 ? (fallen * 1.0 + inactive * 0.5) / total * 100 * 10 / 10 : 0
      )

      // Opportunity: count of rising star stores
      const opp = rising

      let topStore:   StateRow['topStore']   = null
      let worstStore: StateRow['worstStore'] = null
      for (const d of data) {
        if (!topStore   || d.rev > topStore.rev)   topStore   = { store: d.store, rev: d.rev }
        if (!worstStore || d.rev < worstStore.rev) worstStore = { store: d.store, rev: d.rev }
      }

      rows.push({
        state, total, active, inactive,
        earlyRev, recentRev, totalRevV,
        growthPct, avgStore, netPct,
        rising, fallen, consistent, low, average,
        health, risk, opp,
        topStore, worstStore,
      })
    }

    return rows.sort((a, b) => b.totalRevV - a.totalRevV)
  }, [classifiedStores])

  // ── KPI heroes ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalRevAll    = stateMetrics.reduce((s, m) => s + m.totalRevV, 0)
    const largest        = stateMetrics[0] ?? null
    const largestPct     = totalRevAll > 0 ? (largest?.totalRevV ?? 0) / totalRevAll * 100 : 0
    const fastestGrowing = [...stateMetrics]
      .filter(m => m.growthPct !== null)
      .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))[0] ?? null
    const highestRisk    = [...stateMetrics]
      .sort((a, b) => b.risk - a.risk)[0] ?? null
    return { statesInScope: stateMetrics.length, totalStores: classifiedStores.length,
             largest, largestPct, fastestGrowing, highestRisk }
  }, [stateMetrics, classifiedStores])

  // ── Store Revenue by State (defaults to largest contributor, shows ALL stores) ─
  const storeCompData = useMemo(() => {
    const largestState = stateMetrics[0]?.state ?? null
    const effectiveSt  = compState ?? largestState
    if (!effectiveSt) return { traces: [], stateName: '', count: 0, chartHeight: 320 }

    // Sort ascending so highest-revenue store appears at top in horizontal bar chart
    const stateStores = classifiedStores
      .filter(c => (c.store.state ?? 'Unknown') === effectiveSt)
      .sort((a, b) => a.rev - b.rev)

    if (!stateStores.length) return { traces: [], stateName: effectiveSt, count: 0, chartHeight: 320 }

    const labels = stateStores.map(c => c.store.store_name ?? c.store.store_id)

    // Recent bar color encodes growth direction directly
    const recentColors = stateStores.map(c =>
      c.growthPct === null ? '#94a3b8'
      : c.growthPct >= 15  ? '#15803d'   // strong growth  → deep green
      : c.growthPct >= 0   ? '#4ade80'   // mild growth    → light green
      : c.growthPct >= -15 ? '#f97316'   // mild decline   → orange
      :                      '#dc2626'   // strong decline → red
    )

    // Growth label shown to the right of each bar
    const growthLabels = stateStores.map(c =>
      c.growthPct !== null
        ? `  ${c.growthPct >= 0 ? '▲' : '▼'} ${Math.abs(c.growthPct).toFixed(1)}%`
        : ''
    )

    const growthLabelColors = stateStores.map(c =>
      c.growthPct === null ? '#94a3b8'
      : c.growthPct >= 0   ? '#15803d'
      :                      '#dc2626'
    )

    // Enough vertical space per store so nothing feels cramped
    const chartHeight = Math.max(320, stateStores.length * 30 + 80)

    return {
      stateName: effectiveSt,
      count: stateStores.length,
      chartHeight,
      traces: [
        {
          type:        'bar' as const,
          orientation: 'h' as const,
          name:        'Early',
          y:           labels,
          x:           stateStores.map(c => c.earlyR),
          marker:      { color: '#bfdbfe', opacity: 0.9 },
          hovertemplate: '<b>%{y}</b><br>Early period: ₹%{x:,.0f}<extra></extra>',
        },
        {
          type:        'bar' as const,
          orientation: 'h' as const,
          name:        'Recent',
          y:           labels,
          x:           stateStores.map(c => c.recentR),
          marker:      { color: recentColors, opacity: 0.92 },
          text:        growthLabels,
          textposition: 'outside' as const,
          textfont:    { size: 9, color: growthLabelColors },
          cliponaxis:  false,
          hovertemplate:
            '<b>%{y}</b><br>Recent period: ₹%{x:,.0f}'
            + '<br>Growth: %{text}<extra></extra>',
        },
      ],
    }
  }, [classifiedStores, compState, stateMetrics])

  // ── Treemap ───────────────────────────────────────────────────────────────
  const treemapData = useMemo(() => [{
    type:    'treemap' as const,
    labels:  stateMetrics.map(m => m.state),
    parents: stateMetrics.map(() => ''),
    values:  stateMetrics.map(m => m.total),
    customdata: stateMetrics.map(m => [m.active, m.total, m.health.toFixed(1), m.rising, m.fallen]),
    marker: {
      colorscale: [
        [0,    '#991b1b'],
        [0.25, '#c2410c'],
        [0.5,  '#b45309'],
        [0.75, '#15803d'],
        [1,    '#064e3b'],
      ] as [number, string][],
      colors:  stateMetrics.map(m => m.health),
      cmin:    0,
      cmax:    100,
      colorbar: {
        thickness: 10,
        len:       0.75,
        tickfont:  { color: '#6b7280', size: 9 },
        title:     { text: 'Health', side: 'right' as const, font: { color: '#6b7280', size: 9 } },
      },
      line: { width: 2, color: '#ffffff' },
    },
    texttemplate: '<b>%{label}</b><br>%{customdata[0]}/%{value} active<br>↑%{customdata[3]} ↓%{customdata[4]}',
    hovertemplate:
      '<b>%{label}</b>'
      + '<br>Total stores: %{value}'
      + '<br>Active: %{customdata[0]}/%{customdata[1]}'
      + '<br>Health score: %{customdata[2]}'
      + '<br>Rising Stars: %{customdata[3]}'
      + '<br>Fallen Stars: %{customdata[4]}'
      + '<extra></extra>',
    textfont: { color: '#ffffff', size: 11 },
  }], [stateMetrics])

  // ── Risk vs Opportunity ───────────────────────────────────────────────────
  const rvoData = useMemo(() => {
    if (!stateMetrics.length) return []
    const maxRev = Math.max(...stateMetrics.map(m => m.totalRevV), 1)
    const minRev = Math.min(...stateMetrics.map(m => m.totalRevV), 0)
    const bSize  = (r: number) => 12 + ((r - minRev) / ((maxRev - minRev) || 1)) * 34

    return [{
      type:   'scatter' as const,
      mode:   'text+markers' as const,
      x:      stateMetrics.map(m => m.risk),
      y:      stateMetrics.map(m => m.opp),
      text:   stateMetrics.map(m => m.state),
      textposition: 'top center' as const,
      textfont: { color: '#9ca3af', size: 9 },
      customdata: stateMetrics.map(m => [m.health, m.totalRevV, m.total]),
      marker: {
        size:   stateMetrics.map(m => bSize(m.totalRevV)),
        color:  stateMetrics.map(m => m.health),
        colorscale: [
          [0,   '#ef4444'],
          [0.5, '#f59e0b'],
          [1,   '#10b981'],
        ] as [number, string][],
        cmin:    0,
        cmax:    100,
        opacity: 0.85,
        line:    { color: '#ffffff', width: 1.5 },
        colorbar: {
          thickness: 10,
          len:       0.75,
          tickfont:  { color: '#6b7280', size: 9 },
          title:     { text: 'Health', side: 'right' as const, font: { color: '#6b7280', size: 9 } },
        },
      },
      hovertemplate:
        '<b>%{text}</b><br>Risk Index: %{x:.1f}<br>Opportunity: %{y} rising<br>'
        + 'Health: %{customdata[0]:.1f}<br>Revenue: ₹%{customdata[1]:,.0f}'
        + '<br>Stores: %{customdata[2]}<extra></extra>',
    }]
  }, [stateMetrics])

  // ── Sorted table rows ─────────────────────────────────────────────────────
  const tableRows = useMemo(() =>
    [...stateMetrics].sort((a, b) => {
      let d = 0
      switch (sortKey) {
        case 'state':   d = a.state.localeCompare(b.state); break
        case 'stores':  d = a.total     - b.total;          break
        case 'active':  d = a.active    - b.active;         break
        case 'growth':  d = (a.growthPct ?? -1e9) - (b.growthPct ?? -1e9); break
        case 'revenue': d = a.totalRevV - b.totalRevV;      break
        case 'health':  d = a.health    - b.health;         break
        case 'risk':    d = a.risk      - b.risk;           break
        case 'opp':     d = a.opp       - b.opp;            break
        default:        d = a.totalRevV - b.totalRevV
      }
      return sortDir === 'asc' ? d : -d
    }),
  [stateMetrics, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortIcon = (col: SortKey) =>
    sortKey !== col
      ? <ChevronUp className="h-3 w-3 opacity-25" />
      : sortDir === 'asc'
        ? <ChevronUp className="h-3 w-3 text-blue-600" />
        : <ChevronDown className="h-3 w-3 text-blue-600" />

  const card = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm'

  if (!stateMetrics.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white min-h-96 flex items-center justify-center">
        <p className="text-gray-400 text-sm">No data for selected filters</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <h2 className="text-base font-bold text-gray-900">State Journey Analysis</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {kpis.statesInScope} states in scope · revenue, store journey funnel, risk &amp; opportunity by geography
        </p>
      </motion.div>

      {/* ── KPI Hero Cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">

        {/* States in Scope */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 280, damping: 24 }}
          className={cn(card, 'border-l-4 border-l-gray-400')}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">States in Scope</p>
            <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
          </div>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{kpis.statesInScope}</p>
          <p className="text-[11px] text-gray-500 mt-1">{kpis.totalStores} stores total</p>
        </motion.div>

        {/* Largest Contributor */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10, type: 'spring', stiffness: 280, damping: 24 }}
          className={cn(card, 'border-l-4 border-l-emerald-500')}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Largest Contributor</p>
            <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
          </div>
          <p className="text-xl font-bold text-gray-900 truncate" title={kpis.largest?.state ?? ''}>
            {kpis.largest?.state ?? '—'}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {kpis.largestPct.toFixed(1)}% · {fmtInr(kpis.largest?.totalRevV ?? 0)}
          </p>
        </motion.div>

        {/* Fastest Growing */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 280, damping: 24 }}
          className={cn(card, 'border-l-4 border-l-amber-400')}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Fastest Growing</p>
            <Star className="h-4 w-4 text-amber-500 shrink-0" />
          </div>
          <p className="text-xl font-bold text-gray-900 truncate" title={kpis.fastestGrowing?.state ?? ''}>
            {kpis.fastestGrowing?.state ?? '—'}
          </p>
          <p className="text-[11px] text-emerald-600 mt-1 font-semibold">
            {kpis.fastestGrowing?.growthPct != null
              ? fmtPct(kpis.fastestGrowing.growthPct)
              : '—'}
          </p>
        </motion.div>

        {/* Highest Risk */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.20, type: 'spring', stiffness: 280, damping: 24 }}
          className={cn(card, 'border-l-4 border-l-red-500')}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">Highest Risk</p>
            <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
          </div>
          <p className="text-xl font-bold text-gray-900 truncate" title={kpis.highestRisk?.state ?? ''}>
            {kpis.highestRisk?.state ?? '—'}
          </p>
          <p className="text-[11px] text-red-500 mt-1 font-semibold">
            Risk {kpis.highestRisk?.risk?.toFixed(1) ?? '—'} ·{' '}
            {kpis.highestRisk?.fallen ?? 0}/{kpis.highestRisk?.total ?? 0} fallen
          </p>
        </motion.div>
      </div>

      {/* ── Row 2: Funnel + Revenue Comparison ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Network Store Journey Funnel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
          className={card}
        >
          <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Network Store Journey Funnel</h3>
          <p className="text-[11px] text-gray-400 mb-4">
            From all stores down to rising stars · across in-scope states
          </p>
          <NetworkFunnel counts={funnel} total={funnel.all} />
        </motion.div>

        {/* Store Revenue by State */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          className={card}
        >
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Store Revenue by State</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                All {storeCompData.count} stores in{' '}
                <span className="font-semibold text-blue-600">{storeCompData.stateName}</span>
                {' '}· bar colour = growth direction
              </p>
            </div>
            <select
              value={storeCompData.stateName}
              onChange={e => setCompState(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0"
            >
              {stateMetrics.map(m => (
                <option key={m.state} value={m.state}>
                  {m.state} ({m.total} stores)
                </option>
              ))}
            </select>
          </div>

          {storeCompData.traces.length > 0 ? (
            <div className="overflow-y-auto" style={{ maxHeight: 520 }}>
              <Plot
                data={storeCompData.traces}
                layout={{
                  ...PLOTLY_BASE,
                  barmode: 'group' as const,
                  legend: {
                    bgcolor: 'rgba(0,0,0,0)',
                    font:    { color: PT.font, size: 10 },
                    orientation: 'h' as const,
                    y: -0.06,
                  },
                  xaxis: {
                    gridcolor: PT.grid,
                    linecolor: PT.line,
                    tickcolor: PT.line,
                    automargin: true,
                    title:      { text: 'Revenue (₹)' },
                    tickformat: '.3s',
                    tickprefix: '₹',
                  },
                  yaxis: {
                    gridcolor:  PT.grid,
                    linecolor:  PT.line,
                    tickcolor:  PT.line,
                    automargin: true,
                    tickfont:   { size: 10 },
                  },
                  margin: { l: 160, r: 90, t: 8, b: 50 },
                  height: storeCompData.chartHeight,
                }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              No store data for selected state
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Row 3: Treemap + Risk vs Opportunity ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Store Distribution by State */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.4 }}
          className={card}
        >
          <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Store Distribution by State</h3>
          <p className="text-[11px] text-gray-400 mb-2">
            Tile size = store count · colour = health score (green healthy → red at-risk)
          </p>
          <Plot
            data={treemapData}
            layout={{
              ...PLOTLY_BASE,
              margin: { l: 0, r: 0, t: 0, b: 0 },
              height: 360,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>

        {/* Risk vs Opportunity Scatter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.4 }}
          className={card}
        >
          <h3 className="text-sm font-semibold text-gray-800 mb-0.5">Risk vs Opportunity</h3>
          <p className="text-[11px] text-gray-400 mb-2">
            X = risk index · Y = opportunity (rising stars) · size = revenue · colour = health
          </p>
          <Plot
            data={rvoData}
            layout={{
              ...PLOTLY_BASE,
              showlegend: false,
              xaxis: {
                gridcolor: PT.grid,
                linecolor: PT.line,
                tickcolor: PT.line,
                automargin: true,
                title: { text: 'Risk Index →' },
              },
              yaxis: {
                gridcolor: PT.grid,
                linecolor: PT.line,
                tickcolor: PT.line,
                automargin: true,
                title: { text: 'Opportunity Index' },
              },
              hovermode: 'closest' as const,
              margin: { l: 60, r: 80, t: 16, b: 60 },
              height: 360,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>
      </div>

      {/* ── State Ranking Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.30, duration: 0.4 }}
        className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">
            State Ranking Table
            <span className="ml-2 text-[10px] font-normal text-gray-400 uppercase tracking-wider">
              — click a column to sort
            </span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2.5 text-left text-gray-400 w-8 sticky left-0 bg-gray-50">#</th>

                {/* State */}
                <th className="px-3 py-2.5 text-left sticky left-8 bg-gray-50 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  <button onClick={() => toggleSort('state')} className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors">
                    State{sortIcon('state')}
                  </button>
                </th>

                {['Stores', 'Active', 'Inactive'].map(col => (
                  <th key={col} className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => toggleSort(col.toLowerCase() as SortKey)}
                      className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors mx-auto"
                    >
                      {col}{sortIcon(col.toLowerCase() as SortKey)}
                    </button>
                  </th>
                ))}

                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-gray-500">Early</th>
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-gray-500">Recent</th>

                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort('growth')} className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors ml-auto">
                    Growth%{sortIcon('growth')}
                  </button>
                </th>

                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort('revenue')} className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors ml-auto">
                    Avg/Store{sortIcon('revenue')}
                  </button>
                </th>

                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-gray-500">Net%</th>

                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-amber-600">Rising</th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-red-500">Fallen</th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-emerald-600">Consist.</th>
                <th className="px-3 py-2.5 text-center font-semibold uppercase tracking-wider text-gray-400">Low</th>

                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort('health')} className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors ml-auto">
                    Health{sortIcon('health')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort('risk')} className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors ml-auto">
                    Risk{sortIcon('risk')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-right">
                  <button onClick={() => toggleSort('opp')} className="flex items-center gap-1 font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800 transition-colors ml-auto">
                    <Zap className="h-3 w-3 text-amber-500" />Opp.{sortIcon('opp')}
                  </button>
                </th>

                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400">Top</th>
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-400">Worst</th>
              </tr>
            </thead>

            <tbody>
              {tableRows.map((row, i) => (
                <tr key={row.state} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors">
                  <td className="px-3 py-2.5 text-gray-400 tabular-nums sticky left-0 bg-white">{i + 1}</td>

                  <td className="px-3 py-2.5 sticky left-8 bg-white z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    <span className="font-semibold text-gray-800">{row.state}</span>
                  </td>

                  <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums font-medium">{row.total}</td>
                  <td className="px-3 py-2.5 text-center text-emerald-600 tabular-nums font-medium">{row.active}</td>
                  <td className="px-3 py-2.5 text-center text-red-400 tabular-nums">{row.inactive}</td>

                  <td className="px-3 py-2.5 text-right text-gray-600 tabular-nums">{fmtInr(row.earlyRev)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-800 tabular-nums font-medium">{fmtInr(row.recentRev)}</td>

                  <td className={cn(
                    'px-3 py-2.5 text-right tabular-nums font-semibold',
                    row.growthPct === null ? 'text-gray-400'
                      : row.growthPct >= 0  ? 'text-emerald-600' : 'text-red-500',
                  )}>
                    {row.growthPct === null ? 'N/A' : fmtPct(row.growthPct)}
                  </td>

                  <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{fmtInr(row.avgStore)}</td>

                  <td className={cn(
                    'px-3 py-2.5 text-right tabular-nums',
                    row.netPct === null ? 'text-gray-400' : 'text-blue-600 font-medium',
                  )}>
                    {row.netPct === null ? '—' : `${row.netPct.toFixed(1)}%`}
                  </td>

                  <td className="px-3 py-2.5 text-center">
                    {row.rising > 0
                      ? <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 text-amber-700 font-bold px-1.5">{row.rising}</span>
                      : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {row.fallen > 0
                      ? <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-100 text-red-600 font-bold px-1.5">{row.fallen}</span>
                      : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center text-emerald-600 tabular-nums">{row.consistent}</td>
                  <td className="px-3 py-2.5 text-center text-gray-400 tabular-nums">{row.low}</td>

                  <td className="px-3 py-2.5 text-right"><HealthBadge value={row.health} /></td>
                  <td className="px-3 py-2.5 text-right"><RiskBadge value={row.risk} /></td>

                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold tabular-nums">
                      <Zap className="h-3 w-3" />{row.opp}
                    </span>
                  </td>

                  <td className="px-3 py-2.5 max-w-[120px]">
                    <span className="block truncate text-gray-600" title={row.topStore?.store.store_name ?? row.topStore?.store.store_id ?? ''}>
                      {row.topStore?.store.store_id ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[120px]">
                    <span className="block truncate text-gray-400" title={row.worstStore?.store.store_name ?? row.worstStore?.store.store_id ?? ''}>
                      {row.worstStore?.store.store_id ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  )
}
