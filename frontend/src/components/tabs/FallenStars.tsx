import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingDown, AlertTriangle } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'
import Sparkline from './Sparkline'

const Plot = createPlotlyComponent(Plotly)

type SortKey = 'growth' | 'revenue' | 'recovery' | 'state'
type SortDir = 'asc' | 'desc'

interface FallerRow {
  store: StoreRecord
  growth: number
  earlyAvg: number
  recentAvg: number
  totalRev: number
  sparkline: number[]
  historicalPeak: number
  recoveryPotential: number
  recentDecline: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function winRev(store: StoreRecord, ms: string[]) {
  return ms.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}
function mAvg(store: StoreRecord, ms: string[]) {
  return ms.length ? winRev(store, ms) / ms.length : 0
}
function fmtInr(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

const PALETTE = [
  '#ef4444','#f97316','#ec4899','#a855f7',
  '#8b5cf6','#f59e0b','#06b6d4','#3b82f6',
  '#84cc16','#10b981',
]

// ── Card ─────────────────────────────────────────────────────────────────────

function FallerCard({ rank, row }: { rank: number; row: FallerRow }) {
  const currentPct = row.historicalPeak > 0 ? (row.recentAvg / row.historicalPeak) * 100 : 0
  const barColor = currentPct < 40 ? 'bg-red-600' : currentPct < 65 ? 'bg-amber-500' : 'bg-emerald-500'
  const isAlert = row.recentDecline !== null && row.recentDecline < -30

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.03 }}
      className={cn(
        'rounded-xl border bg-gray-900 overflow-hidden transition-colors',
        isAlert
          ? 'border-red-700/60 shadow-[0_0_12px_rgba(239,68,68,0.08)]'
          : 'border-gray-800 hover:border-red-800/50',
      )}
    >
      {isAlert && (
        <div className="px-3 py-1.5 bg-red-900/30 border-b border-red-800/40 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
          <span className="text-[10px] text-red-300 font-medium">
            Accelerated decline {row.recentDecline !== null ? fmtPct(row.recentDecline) : ''} last 2 months
          </span>
        </div>
      )}

      <div className="px-4 pt-4 pb-2 flex items-start gap-2">
        <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold flex items-center justify-center">
          {rank}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-200 truncate">
            {row.store.store_name ?? row.store.store_id}
          </p>
          <p className="text-[11px] text-gray-500">
            {row.store.state ?? '—'} · {row.store.category ?? '—'}
          </p>
        </div>
      </div>

      <div className="px-2">
        <Sparkline values={row.sparkline} color="#ef4444" height={52} />
      </div>

      <div className="px-4 pb-3 pt-2 border-t border-gray-800/60">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="text-xl font-bold text-red-400 tabular-nums leading-tight">
              {fmtPct(row.growth)}
            </p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Decline</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-200 tabular-nums">{fmtInr(row.totalRev)}</p>
            <p className="text-[11px] text-gray-500">{fmtInr(row.recentAvg)}/mo recent</p>
          </div>
        </div>

        {/* Recovery potential */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500">Recovery to peak</span>
            <span className={cn(
              'text-[11px] font-semibold tabular-nums',
              row.recoveryPotential > 60 ? 'text-red-400' :
              row.recoveryPotential > 30 ? 'text-amber-400' : 'text-emerald-400',
            )}>
              {row.recoveryPotential.toFixed(0)}% gap
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={cn('h-full rounded-full', barColor)}
              style={{ width: `${Math.max(2, currentPct)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-600 mt-1">
            Peak: {fmtInr(row.historicalPeak)}/mo
          </p>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FallenStars({ filters }: { filters: FilterState }) {
  const { stores, months } = useDataContext()

  const [sortKey, setSortKey] = useState<SortKey>('growth')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [showAll, setShowAll] = useState(false)

  const { fm, fallers, alertStores } = useMemo(() => {
    let fs: StoreRecord[] = stores
    if (filters.state) fs = fs.filter(s => s.state === filters.state)
    if (filters.category) fs = fs.filter(s => s.category === filters.category)

    let fm: string[] = months
    if (filters.fromMonth) {
      const i = months.indexOf(filters.fromMonth)
      if (i >= 0) fm = fm.slice(i)
    }
    if (filters.toMonth) {
      const i = months.indexOf(filters.toMonth)
      if (i >= 0) fm = fm.slice(0, i + 1)
    }

    const half = Math.floor(fm.length / 2)
    const early = fm.slice(0, half)
    const recent = fm.slice(half)

    const lastM = fm[fm.length - 1]
    const prevM = fm[fm.length - 2]

    const fallers: FallerRow[] = []

    for (const store of fs) {
      const earlyAvg = early.length ? mAvg(store, early) : 0
      const recentAvg = recent.length ? mAvg(store, recent) : 0
      if (earlyAvg === 0 || !early.length || !recent.length) continue
      const growth = (recentAvg - earlyAvg) / earlyAvg * 100
      if (growth >= 0) continue

      const historicalPeak = fm.length
        ? Math.max(...fm.map(m => store.monthly_sales[m] ?? 0))
        : 0
      const recoveryPotential = historicalPeak > 0 && recentAvg < historicalPeak
        ? (historicalPeak - recentAvg) / historicalPeak * 100
        : 0

      let recentDecline: number | null = null
      if (lastM && prevM) {
        const last = store.monthly_sales[lastM] ?? 0
        const prev = store.monthly_sales[prevM] ?? 0
        recentDecline = prev > 0 ? (last - prev) / prev * 100 : null
      }

      fallers.push({
        store,
        growth,
        earlyAvg,
        recentAvg,
        totalRev: winRev(store, fm),
        sparkline: fm.map(m => store.monthly_sales[m] ?? 0),
        historicalPeak,
        recoveryPotential,
        recentDecline,
      })
    }

    const alertStores = fallers.filter(f => f.recentDecline !== null && f.recentDecline < -30)

    return { fm, fallers, alertStores }
  }, [stores, months, filters])

  const sorted = useMemo(() => {
    const arr = [...fallers]
    arr.sort((a, b) => {
      if (sortKey === 'growth') {
        return sortDir === 'asc' ? a.growth - b.growth : b.growth - a.growth
      }
      if (sortKey === 'revenue') {
        return sortDir === 'desc' ? b.totalRev - a.totalRev : a.totalRev - b.totalRev
      }
      if (sortKey === 'recovery') {
        return sortDir === 'desc'
          ? b.recoveryPotential - a.recoveryPotential
          : a.recoveryPotential - b.recoveryPotential
      }
      const sa = a.store.state ?? '', sb = b.store.state ?? ''
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
    return arr
  }, [fallers, sortKey, sortDir])

  const displayed = showAll ? sorted : sorted.slice(0, 12)

  // Decline trajectory chart (top 10 fallen stores)
  const trajectoryTraces = useMemo(() => {
    const top10 = [...fallers].sort((a, b) => a.growth - b.growth).slice(0, 10)
    return top10.map((row, i) => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: row.store.store_name ?? row.store.store_id,
      x: fm,
      y: fm.map(m => row.store.monthly_sales[m] ?? 0),
      line: { shape: 'spline' as const, width: 2, color: PALETTE[i % PALETTE.length] },
      hovertemplate: `<b>${row.store.store_name ?? row.store.store_id}</b><br>%{x}: ₹%{y:,.0f}<extra></extra>`,
    }))
  }, [fallers, fm])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'growth' ? 'asc' : 'desc')
    }
  }

  if (!fallers.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No falling stores found in the selected filters &amp; time window.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Alert insight */}
      {alertStores.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-red-700/50 bg-red-900/20 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">
                Accelerated Decline Alert — {alertStores.length} store{alertStores.length > 1 ? 's' : ''} declined &gt;30% in the last 2 months
              </p>
              <p className="text-xs text-red-400/70 mt-1">
                {alertStores.map(s => s.store.store_name ?? s.store.store_id).join(' · ')}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            Fallen Stars
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {fallers.length} stores with declining growth — ranked by early‑to‑recent drop
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort:</span>
          {([
            { key: 'growth' as SortKey, label: 'Decline %' },
            { key: 'revenue' as SortKey, label: 'Revenue' },
            { key: 'recovery' as SortKey, label: 'Recovery Gap' },
            { key: 'state' as SortKey, label: 'State' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors',
                sortKey === key
                  ? 'border-red-500/40 bg-red-500/10 text-red-400'
                  : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600',
              )}
            >
              {label}
              {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayed.map((row, i) => (
          <FallerCard key={row.store.store_id} rank={i + 1} row={row} />
        ))}
      </div>

      {sorted.length > 12 && (
        <div className="text-center">
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-xs text-gray-400 hover:text-red-400 border border-gray-700 hover:border-red-700 px-4 py-1.5 rounded-full transition-colors"
          >
            {showAll ? 'Show top 12' : `Show all ${sorted.length} fallen stores`}
          </button>
        </div>
      )}

      {/* Decline trajectory chart */}
      {trajectoryTraces.length > 0 && fm.length > 1 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Decline Trajectories — Top 10 Fallen Stores
          </h3>
          <Plot
            data={trajectoryTraces}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              height: 320,
              margin: { l: 60, r: 20, t: 10, b: 60 },
              font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
              xaxis: {
                gridcolor: '#1f2937',
                linecolor: '#374151',
                tickcolor: '#374151',
                tickangle: -30,
                automargin: true,
              },
              yaxis: {
                gridcolor: '#1f2937',
                linecolor: '#374151',
                tickcolor: '#374151',
                tickprefix: '₹',
                tickformat: ',.0f',
                automargin: true,
              },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#9ca3af', size: 10 },
              },
              hovermode: 'x unified' as const,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </div>
      )}
    </div>
  )
}
