import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
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

type SortKey = 'growth' | 'revenue' | 'state'
type SortDir = 'asc' | 'desc'

interface RiserRow {
  store: StoreRecord
  growth: number
  earlyAvg: number
  recentAvg: number
  totalRev: number
  sparkline: number[]
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
  '#10b981','#3b82f6','#f59e0b','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899',
  '#14b8a6','#a855f7',
]

// ── Card ─────────────────────────────────────────────────────────────────────

function RiserCard({ rank, row }: { rank: number; row: RiserRow }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.03 }}
      className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-emerald-800/60 transition-colors"
    >
      <div className="px-4 pt-4 pb-2 flex items-start gap-2">
        <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center justify-center">
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
        <Sparkline values={row.sparkline} color="#10b981" height={52} />
      </div>

      <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-2 border-t border-gray-800/60">
        <div>
          <p className="text-xl font-bold text-emerald-400 tabular-nums leading-tight">
            {fmtPct(row.growth)}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Growth</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-200 tabular-nums">{fmtInr(row.totalRev)}</p>
          <p className="text-[11px] text-gray-500">{fmtInr(row.recentAvg)}/mo recent</p>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RisingStars({ filters }: { filters: FilterState }) {
  const { stores, months } = useDataContext()

  const [sortKey, setSortKey] = useState<SortKey>('growth')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showAll, setShowAll] = useState(false)

  // ── Filtered + computed data
  const { fm, risers } = useMemo(() => {
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

    const risers: RiserRow[] = []

    for (const store of fs) {
      const earlyAvg = early.length ? mAvg(store, early) : 0
      const recentAvg = recent.length ? mAvg(store, recent) : 0
      if (earlyAvg === 0 || !early.length || !recent.length) continue
      const growth = (recentAvg - earlyAvg) / earlyAvg * 100
      if (growth <= 0) continue
      risers.push({
        store,
        growth,
        earlyAvg,
        recentAvg,
        totalRev: winRev(store, fm),
        sparkline: fm.map(m => store.monthly_sales[m] ?? 0),
      })
    }

    return { fm, risers }
  }, [stores, months, filters])

  // ── Sorted cards
  const sorted = useMemo(() => {
    const arr = [...risers]
    arr.sort((a, b) => {
      if (sortKey === 'growth') {
        return sortDir === 'desc' ? b.growth - a.growth : a.growth - b.growth
      }
      if (sortKey === 'revenue') {
        return sortDir === 'desc' ? b.totalRev - a.totalRev : a.totalRev - b.totalRev
      }
      const sa = a.store.state ?? '', sb = b.store.state ?? ''
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
    })
    return arr
  }, [risers, sortKey, sortDir])

  const displayed = showAll ? sorted : sorted.slice(0, 12)

  // ── Momentum chart traces (top 10 by growth)
  const momentumTraces = useMemo(() => {
    const top10 = [...risers].sort((a, b) => b.growth - a.growth).slice(0, 10)
    return top10.map((row, i) => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: row.store.store_name ?? row.store.store_id,
      x: fm,
      y: fm.map(m => row.store.monthly_sales[m] ?? 0),
      line: { shape: 'spline' as const, width: 2, color: PALETTE[i % PALETTE.length] },
      hovertemplate: `<b>${row.store.store_name ?? row.store.store_id}</b><br>%{x}: ₹%{y:,.0f}<extra></extra>`,
    }))
  }, [risers, fm])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  if (!risers.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No rising stores found in the selected filters &amp; time window.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Rising Stars
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {risers.length} stores with positive growth — ranked by early‑to‑recent momentum
          </p>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Sort:</span>
          {(['growth', 'revenue', 'state'] as SortKey[]).map(key => (
            <button
              key={key}
              onClick={() => toggleSort(key)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors capitalize',
                sortKey === key
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600',
              )}
            >
              {key === 'growth' ? 'Growth %' : key === 'revenue' ? 'Revenue' : 'State'}
              {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayed.map((row, i) => (
          <RiserCard key={row.store.store_id} rank={i + 1} row={row} />
        ))}
      </div>

      {sorted.length > 12 && (
        <div className="text-center">
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-xs text-gray-400 hover:text-emerald-400 border border-gray-700 hover:border-emerald-700 px-4 py-1.5 rounded-full transition-colors"
          >
            {showAll ? `Show top 12` : `Show all ${sorted.length} rising stores`}
          </button>
        </div>
      )}

      {/* Momentum chart */}
      {momentumTraces.length > 0 && fm.length > 1 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Rising Momentum — Top 10 Store Trajectories
          </h3>
          <Plot
            data={momentumTraces}
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
