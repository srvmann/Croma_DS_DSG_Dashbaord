import { useEffect, useMemo, useState } from 'react'
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from 'framer-motion'
import {
  ChevronUp, ChevronDown,
  TrendingUp, TrendingDown,
  Star, Activity, BarChart2,
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

// ── Types & constants ─────────────────────────────────────────────────────────

type Journey =
  | 'Rising Star'
  | 'Fallen Star'
  | 'Consistent Performer'
  | 'Consistently Low'
  | 'Average'

type SortKey = 'name' | 'revenue' | 'growth'

const JOURNEY_ORDER: Journey[] = [
  'Rising Star',
  'Consistent Performer',
  'Average',
  'Consistently Low',
  'Fallen Star',
]

const JOURNEY_COLOR: Record<Journey, string> = {
  'Rising Star':          '#f59e0b',
  'Fallen Star':          '#ef4444',
  'Consistent Performer': '#10b981',
  'Consistently Low':     '#6b7280',
  'Average':              '#3b82f6',
}

const JOURNEY_BADGE: Record<Journey, string> = {
  'Rising Star':          'bg-amber-100 text-amber-700',
  'Fallen Star':          'bg-red-100 text-red-700',
  'Consistent Performer': 'bg-emerald-100 text-emerald-700',
  'Consistently Low':     'bg-gray-100 text-gray-600',
  'Average':              'bg-blue-100 text-blue-700',
}

const JOURNEY_DESC: Record<Journey, string> = {
  'Rising Star':          'Recent avg > early avg by >15%',
  'Fallen Star':          'Recent avg < early avg by >15%',
  'Consistent Performer': 'Low variance (<10% CoV), above median',
  'Consistently Low':     'Low variance (<10% CoV), below median',
  'Average':              'All other stores',
}

const JOURNEY_ICON: Record<Journey, React.ReactNode> = {
  'Rising Star':          <Star className="h-4 w-4" />,
  'Fallen Star':          <TrendingDown className="h-4 w-4" />,
  'Consistent Performer': <BarChart2 className="h-4 w-4" />,
  'Consistently Low':     <Activity className="h-4 w-4" />,
  'Average':              <TrendingUp className="h-4 w-4" />,
}

// Light-mode Plotly theme tokens (matching ExecutiveOverview)
const PT = { font: '#6b7280', grid: '#e5e7eb', line: '#d1d5db' }

// ── Animation variants ────────────────────────────────────────────────────────

const kpiContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}

const kpiItem = {
  hidden: { opacity: 0, y: 20, scale: 0.93 },
  show:   {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
}

const panelSpring = (delay = 0) => ({
  initial:    { opacity: 0, y: 28 },
  animate:    { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay },
})

// ── Pure helpers ──────────────────────────────────────────────────────────────

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

function classifyStore(
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

  const coV =
    Math.sqrt(revs.reduce((s, r) => s + (r - mean) ** 2, 0) / revs.length) / mean

  if (coV < 0.10) {
    const totalRev = revs.reduce((s, r) => s + r, 0)
    return totalRev > medianWindowRev ? 'Consistent Performer' : 'Consistently Low'
  }

  return 'Average'
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function StoreJourneyMap({ filters }: Props) {
  const { stores, months } = useDataContext()
  const [activeJourney, setActiveJourney] = useState<Journey | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('revenue')
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('desc')

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

  // ── Classify ───────────────────────────────────────────────────────────────
  const classified = useMemo(() => {
    const totals = fs
      .map(s => fm.reduce((acc, m) => acc + (s.monthly_sales[m] ?? 0), 0))
      .sort((a, b) => a - b)
    const medianRev = totals.length ? totals[Math.floor(totals.length / 2)] : 0

    return fs.map(store => {
      const earlyAvg  = mAvg(store, early)
      const recentAvg = mAvg(store, recent)
      const totalRev  = fm.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
      const growthPct =
        early.length && recent.length && earlyAvg > 0
          ? (recentAvg - earlyAvg) / earlyAvg * 100
          : null
      const journey = classifyStore(store, fm, early, recent, medianRev)
      return { store, earlyAvg, recentAvg, totalRev, growthPct, journey }
    })
  }, [fs, fm, early, recent])

  // ── Summary counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<Journey, number> = {
      'Rising Star': 0, 'Fallen Star': 0,
      'Consistent Performer': 0, 'Consistently Low': 0, 'Average': 0,
    }
    for (const { journey } of classified) c[journey]++
    return c
  }, [classified])

  // ── Scatter traces ─────────────────────────────────────────────────────────
  const scatterTraces = useMemo(() => {
    if (classified.length === 0) return []

    const maxRev   = Math.max(...classified.map(c => c.totalRev), 1)
    const minRev   = Math.min(...classified.map(c => c.totalRev), 0)
    const bubbleSize = (r: number) => 8 + ((r - minRev) / ((maxRev - minRev) || 1)) * 22

    const maxAxis =
      Math.max(...classified.map(c => Math.max(c.earlyAvg, c.recentAvg)), 1) * 1.1

    const refLine = {
      type:       'scatter' as const,
      mode:       'lines' as const,
      name:       'No Change (Y = X)',
      x:          [0, maxAxis],
      y:          [0, maxAxis],
      line:       { dash: 'dash' as const, color: '#9ca3af', width: 1.5 },
      hoverinfo:  'skip' as const,
      showlegend: true,
    }

    const dataTraces = JOURNEY_ORDER.map(j => {
      const group = classified.filter(c => c.journey === j)
      return {
        type: 'scatter' as const,
        mode: 'markers' as const,
        name: j,
        x:    group.map(c => c.earlyAvg),
        y:    group.map(c => c.recentAvg),
        text: group.map(c =>
          `${c.store.store_name ?? c.store.store_id}`
          + `<br>${c.store.state ?? ''}${c.store.category ? ` · ${c.store.category}` : ''}`
          + `<br>Total: ${fmtInr(c.totalRev)}`
        ),
        marker: {
          size:    group.map(c => bubbleSize(c.totalRev)),
          color:   JOURNEY_COLOR[j],
          opacity: 0.82,
          line:    { color: '#ffffff', width: 1 },
        },
        hovertemplate:
          '<b>%{text}</b><br>Early avg: ₹%{x:,.0f}<br>Recent avg: ₹%{y:,.0f}<extra></extra>',
      }
    })

    return [refLine, ...dataTraces]
  }, [classified])

  // ── Sorted, filtered table ─────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    const rows = activeJourney
      ? classified.filter(c => c.journey === activeJourney)
      : classified

    return [...rows].sort((a, b) => {
      let d = 0
      if (sortKey === 'revenue')     d = a.totalRev - b.totalRev
      else if (sortKey === 'growth') d = (a.growthPct ?? -1e9) - (b.growthPct ?? -1e9)
      else d = (a.store.store_name ?? '').localeCompare(b.store.store_name ?? '')
      return sortDir === 'asc' ? d : -d
    })
  }, [classified, activeJourney, sortKey, sortDir])

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

  const cardCls  = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
  const emptyMsg = 'flex items-center justify-center h-64 text-gray-400 text-sm'

  // ── Empty state ────────────────────────────────────────────────────────────
  if (fs.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white min-h-96 flex items-center justify-center">
        <p className="text-gray-400 text-sm">No data for selected filters</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <h2 className="text-base font-bold text-gray-900">Store Journey Map</h2>
        <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl leading-relaxed">
          How stores evolved between early and recent periods — classified by performance
          trajectory. Click a card to filter the table and scatter plot.
        </p>
      </motion.div>

      {/* ── Classification Cards — staggered spring entrance ── */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        variants={kpiContainer}
        initial="hidden"
        animate="show"
      >
        {JOURNEY_ORDER.map(j => {
          const count    = counts[j]
          const ratio    = fs.length > 0 ? count / fs.length : 0
          const isActive = activeJourney === j
          return (
            <motion.button
              key={j}
              variants={kpiItem}
              whileHover={{
                scale: 1.035, y: -4,
                transition: { type: 'spring', stiffness: 420, damping: 26 },
              }}
              whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
              onClick={() => setActiveJourney(isActive ? null : j)}
              className={cn(
                'rounded-xl border bg-white p-4 text-left flex flex-col gap-0.5 min-w-0 cursor-pointer',
                'shadow-sm hover:shadow-md transition-shadow duration-200',
                isActive ? 'ring-1' : 'border-gray-200',
              )}
              style={isActive ? {
                borderColor:     JOURNEY_COLOR[j],
                backgroundColor: `${JOURNEY_COLOR[j]}12`,
                outlineColor:    JOURNEY_COLOR[j],
              } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest truncate"
                  style={{ color: JOURNEY_COLOR[j] }}
                >
                  {j}
                </p>
                <span style={{ color: JOURNEY_COLOR[j] }} className="shrink-0">
                  {JOURNEY_ICON[j]}
                </span>
              </div>

              <AnimatedNumber
                value={count}
                className="text-2xl font-bold tabular-nums block text-gray-900"
              />

              <p className="text-[11px] text-gray-500">{Math.round(ratio * 100)}% of portfolio</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-2">
                {JOURNEY_DESC[j]}
              </p>

              <MiniBar ratio={ratio} color={JOURNEY_COLOR[j]} />
            </motion.button>
          )
        })}
      </motion.div>

      {/* ── Scatter Plot ── */}
      <motion.div {...panelSpring(0.12)} className={cardCls}>
        <h3 className="mb-0.5 text-sm font-semibold text-gray-800">Store Journey Scatter</h3>
        <p className="mb-3 text-[11px] text-gray-500">
          X = early period avg revenue · Y = recent period avg revenue ·
          bubble size = total revenue · dashed line = no change
        </p>
        {scatterTraces.length > 0 ? (
          <Plot
            data={scatterTraces}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font:   { color: PT.font, family: 'Inter, sans-serif', size: 11 },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font:    { color: PT.font, size: 10 },
                orientation: 'h' as const,
                y: -0.18,
              },
              xaxis: {
                gridcolor:  PT.grid,
                linecolor:  PT.line,
                tickcolor:  PT.line,
                automargin: true,
                title:      { text: 'Early Period Avg Revenue (₹)' },
                tickformat: ',.0f',
              },
              yaxis: {
                gridcolor:  PT.grid,
                linecolor:  PT.line,
                tickcolor:  PT.line,
                automargin: true,
                title:      { text: 'Recent Period Avg Revenue (₹)' },
                tickformat: ',.0f',
              },
              hovermode:  'closest' as const,
              margin:     { l: 80, r: 20, t: 8, b: 90 },
              height:     440,
              uirevision: 'constant',
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        ) : (
          <div className={emptyMsg}>Not enough data to render scatter plot</div>
        )}
      </motion.div>

      {/* ── Filterable Table ── */}
      <motion.div
        {...panelSpring(0.2)}
        className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm"
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">All Stores</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {tableRows.length} stores
              {activeJourney ? ` · filtered to "${activeJourney}"` : ' · all journeys'}
              {' · click a card above to filter'}
            </p>
          </div>
          {activeJourney && (
            <button
              onClick={() => setActiveJourney(null)}
              className="text-xs text-blue-600 hover:text-blue-500 transition-colors px-2 py-0.5 rounded border border-blue-200 bg-blue-50"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2.5 text-left text-xs text-gray-400 w-8">#</th>
                <th className="px-3 py-2.5 text-left">
                  <button
                    onClick={() => toggleSort('name')}
                    className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Store Name{sortIcon('name')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  State
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Category
                </th>
                <th className="px-3 py-2.5 text-left">
                  <button
                    onClick={() => toggleSort('revenue')}
                    className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Total Rev{sortIcon('revenue')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left">
                  <button
                    onClick={() => toggleSort('growth')}
                    className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Growth %{sortIcon('growth')}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Journey
                </th>
              </tr>
            </thead>

            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-gray-400 text-sm">
                    No stores match
                  </td>
                </tr>
              ) : (
                tableRows.map(({ store, totalRev, growthPct, journey }, i) => (
                  <tr
                    key={store.store_id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-gray-400 tabular-nums text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className="text-gray-800 font-medium block truncate max-w-[180px]"
                        title={store.store_name ?? store.store_id}
                      >
                        {store.store_name ?? store.store_id}
                      </span>
                      <span className="text-[10px] text-gray-400">{store.store_id}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {store.state ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {store.category ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 tabular-nums font-medium whitespace-nowrap">
                      {fmtInr(totalRev)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2.5 tabular-nums font-medium whitespace-nowrap',
                        growthPct === null
                          ? 'text-gray-400'
                          : growthPct > 0
                            ? 'text-emerald-600'
                            : 'text-red-500',
                      )}
                    >
                      {growthPct === null ? 'N/A' : fmtPct(growthPct)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-block text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
                          JOURNEY_BADGE[journey],
                        )}
                      >
                        {journey}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

    </div>
  )
}
