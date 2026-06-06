import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronUp, ChevronDown, Info } from 'lucide-react'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899',
  '#14b8a6', '#a855f7', '#f43f5e', '#22d3ee',
]

const PLOTLY_AXES = {
  gridcolor: '#1f2937',
  linecolor: '#374151',
  tickcolor: '#374151',
  automargin: true,
} as const

const PLOTLY_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function winRev(store: StoreRecord, months: string[]): number {
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function mAvg(store: StoreRecord, months: string[]): number {
  return months.length ? winRev(store, months) / months.length : 0
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

// ── Component ─────────────────────────────────────────────────────────────────

type RankSortKey = 'rev' | 'growth' | 'stores' | 'state'

interface Props { filters: FilterState }

export default function StateAnalytics({ filters }: Props) {
  const { stores, months } = useDataContext()
  const [rankSort, setRankSort] = useState<RankSortKey>('rev')
  const [rankDir, setRankDir] = useState<'asc' | 'desc'>('desc')

  // ── Filter — intentionally ignores filters.state (state IS the dimension) ──
  const { fs, fm, early, recent } = useMemo(() => {
    let fs = stores
    // filters.state is deliberately not applied on this page
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

  // ── Per-state aggregations ─────────────────────────────────────────────────
  const stateData = useMemo(() => {
    const map: Record<string, {
      rev: number
      earlyRev: number
      recentRev: number
      count: number
      topStore: StoreRecord | null
      bottomStore: StoreRecord | null
      growths: number[]
      revByMonth: Record<string, number>
    }> = {}

    for (const store of fs) {
      const state = store.state ?? 'Unknown'
      if (!map[state]) {
        map[state] = {
          rev: 0, earlyRev: 0, recentRev: 0,
          count: 0, topStore: null, bottomStore: null,
          growths: [], revByMonth: {},
        }
      }

      const r = winRev(store, fm)
      const earlyR = mAvg(store, early) * early.length
      const recentR = mAvg(store, recent) * recent.length

      map[state].rev += r
      map[state].earlyRev += earlyR
      map[state].recentRev += recentR
      map[state].count++

      if (!map[state].topStore || r > winRev(map[state].topStore!, fm)) {
        map[state].topStore = store
      }
      if (!map[state].bottomStore || r < winRev(map[state].bottomStore!, fm)) {
        map[state].bottomStore = store
      }

      const e = mAvg(store, early)
      if (e > 0 && early.length && recent.length) {
        map[state].growths.push((mAvg(store, recent) - e) / e * 100)
      }

      for (const m of fm) {
        map[state].revByMonth[m] = (map[state].revByMonth[m] ?? 0) + (store.monthly_sales[m] ?? 0)
      }
    }

    const states = Object.keys(map)
    return {
      states,
      map,
      totalRev: states.reduce((s, st) => s + map[st].rev, 0),
    }
  }, [fs, fm, early, recent])

  const { states, map, totalRev } = stateData

  // ── Horizontal revenue bar chart (sorted) ─────────────────────────────────
  const revBarTrace = useMemo(() => {
    const sorted = [...states].sort((a, b) => map[a].rev - map[b].rev) // asc for horizontal (low = bottom)
    return [{
      type: 'bar' as const,
      orientation: 'h' as const,
      y: sorted,
      x: sorted.map(s => map[s].rev),
      marker: {
        color: sorted.map((_, i) => STATE_PALETTE[i % STATE_PALETTE.length]),
        opacity: 0.85,
      },
      hovertemplate: '<b>%{y}</b><br>₹%{x:,.0f}<extra></extra>',
      text: sorted.map(s => fmtInr(map[s].rev)),
      textposition: 'outside' as const,
      textfont: { color: '#9ca3af', size: 10 },
    }]
  }, [states, map])

  // ── Early vs Recent grouped bars ──────────────────────────────────────────
  const growthBarTraces = useMemo(() => {
    const sorted = [...states].sort((a, b) => map[b].rev - map[a].rev)
    const earlyAvgs = sorted.map(s =>
      map[s].count > 0 ? map[s].earlyRev / map[s].count : 0
    )
    const recentAvgs = sorted.map(s =>
      map[s].count > 0 ? map[s].recentRev / map[s].count : 0
    )

    return [
      {
        type: 'bar' as const,
        name: 'Early Period',
        x: sorted,
        y: earlyAvgs,
        marker: { color: '#3b82f6', opacity: 0.75 },
        hovertemplate: '<b>%{x}</b> — Early<br>₹%{y:,.0f} avg/store<extra></extra>',
      },
      {
        type: 'bar' as const,
        name: 'Recent Period',
        x: sorted,
        y: recentAvgs,
        marker: { color: '#10b981', opacity: 0.85 },
        hovertemplate: '<b>%{x}</b> — Recent<br>₹%{y:,.0f} avg/store<extra></extra>',
      },
    ]
  }, [states, map])

  // ── State × Month heatmap ─────────────────────────────────────────────────
  const heatmapTrace = useMemo(() => {
    const sorted = [...states].sort((a, b) => map[b].rev - map[a].rev)
    return [{
      type: 'heatmap' as const,
      y: sorted,
      x: fm,
      z: sorted.map(s => fm.map(m => map[s].revByMonth[m] ?? 0)),
      colorscale: [
        [0, '#0f172a'],
        [0.2, '#1e3a5f'],
        [0.45, '#1d4ed8'],
        [0.7, '#3b82f6'],
        [1, '#93c5fd'],
      ] as [number, string][],
      hovertemplate: '<b>%{y}</b><br>%{x}: ₹%{z:,.0f}<extra></extra>',
      colorbar: {
        thickness: 12,
        bgcolor: 'rgba(0,0,0,0)',
        tickfont: { color: '#9ca3af', size: 9 },
        tickformat: '.3s',
        tickprefix: '₹',
        len: 0.8,
      },
    }]
  }, [states, map, fm])

  // ── Contribution pie (donut) ───────────────────────────────────────────────
  const pieTrace = useMemo(() => {
    const sorted = [...states].sort((a, b) => map[b].rev - map[a].rev)
    return [{
      type: 'pie' as const,
      labels: sorted,
      values: sorted.map(s => map[s].rev),
      hole: 0.45,
      textinfo: 'label+percent' as const,
      textfont: { color: '#9ca3af', size: 10 },
      marker: {
        colors: sorted.map((_, i) => STATE_PALETTE[i % STATE_PALETTE.length]),
        line: { color: '#111827', width: 1.5 },
      },
      hovertemplate: '<b>%{label}</b><br>₹%{value:,.0f}<br>%{percent}<extra></extra>',
    }]
  }, [states, map])

  // ── Ranking table rows ─────────────────────────────────────────────────────
  const rankRows = useMemo(() => {
    return [...states]
      .map(state => {
        const m = map[state]
        const earlyAvg = m.count > 0 ? m.earlyRev / m.count : 0
        const recentAvg = m.count > 0 ? m.recentRev / m.count : 0
        const growth = earlyAvg > 0 ? (recentAvg - earlyAvg) / earlyAvg * 100 : null
        return { state, rev: m.rev, count: m.count, growth, topStore: m.topStore, bottomStore: m.bottomStore }
      })
      .sort((a, b) => {
        let d = 0
        if (rankSort === 'rev') d = a.rev - b.rev
        else if (rankSort === 'growth') d = (a.growth ?? -1e9) - (b.growth ?? -1e9)
        else if (rankSort === 'stores') d = a.count - b.count
        else d = a.state.localeCompare(b.state)
        return rankDir === 'asc' ? d : -d
      })
  }, [states, map, rankSort, rankDir])

  const toggleRankSort = (key: RankSortKey) => {
    if (rankSort === key) setRankDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setRankSort(key); setRankDir('desc') }
  }

  const sortIcon = (col: RankSortKey) =>
    rankSort !== col
      ? <ChevronUp className="h-3 w-3 opacity-25" />
      : rankDir === 'asc'
        ? <ChevronUp className="h-3 w-3 text-blue-400" />
        : <ChevronDown className="h-3 w-3 text-blue-400" />

  const barHeight = Math.max(280, states.length * 42 + 80)
  const heatmapHeight = Math.max(220, states.length * 36 + 80)

  if (states.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 min-h-96 flex items-center justify-center">
        <p className="text-gray-500 text-sm">No data for selected filters</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Filter info badge ── */}
      <div className="flex items-center gap-2 text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          State filter is not applied on this page — all states are compared as the primary dimension.
          {filters.state ? ` (Ignored: "${filters.state}")` : ''}
        </span>
      </div>

      {/* ── Revenue Comparison (horizontal bar) ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Revenue by State</h3>
        <p className="mb-3 text-[11px] text-gray-500">Total revenue per state, sorted ascending · hover for exact value</p>
        <Plot
          data={revBarTrace}
          layout={{
            ...PLOTLY_BASE,
            showlegend: false,
            xaxis: { ...PLOTLY_AXES, title: { text: 'Revenue (₹)' }, tickformat: ',.0f' },
            yaxis: { ...PLOTLY_AXES },
            margin: { l: 130, r: 80, t: 8, b: 50 },
            height: barHeight,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </motion.div>

      {/* ── Early vs Recent Grouped Bars ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Early vs Recent Period — Avg Revenue per Store</h3>
        <p className="mb-3 text-[11px] text-gray-500">
          Early = first {Math.floor(fm.length / 2)} months · Recent = last {Math.floor(fm.length / 2)} months
        </p>
        <Plot
          data={growthBarTraces}
          layout={{
            ...PLOTLY_BASE,
            barmode: 'group' as const,
            legend: {
              bgcolor: 'rgba(0,0,0,0)',
              font: { color: '#9ca3af', size: 10 },
              orientation: 'h' as const,
              y: -0.2,
            },
            xaxis: { ...PLOTLY_AXES },
            yaxis: { ...PLOTLY_AXES, title: { text: 'Avg Revenue / Store (₹)' }, tickformat: ',.0f' },
            margin: { l: 70, r: 16, t: 8, b: 80 },
            height: 320,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </motion.div>

      {/* ── State × Month Heatmap ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <h3 className="mb-0.5 text-sm font-semibold text-gray-200">State Revenue Heatmap</h3>
        <p className="mb-3 text-[11px] text-gray-500">States × months · colour intensity = total revenue</p>
        <Plot
          data={heatmapTrace}
          layout={{
            ...PLOTLY_BASE,
            xaxis: { ...PLOTLY_AXES },
            yaxis: { ...PLOTLY_AXES, autorange: 'reversed' as const },
            margin: { l: 130, r: 80, t: 8, b: 60 },
            height: heatmapHeight,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </motion.div>

      {/* ── Pie + Ranking Table ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Contribution Pie */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Revenue Contribution</h3>
          <p className="mb-3 text-[11px] text-gray-500">Each state's share of total portfolio revenue</p>
          <Plot
            data={pieTrace}
            layout={{
              ...PLOTLY_BASE,
              showlegend: false,
              margin: { l: 10, r: 10, t: 10, b: 10 },
              height: states.length > 6 ? 360 : 300,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>

        {/* Ranking Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-gray-200">State Rankings</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">Click column headers to sort</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/40">
                  <th className="px-3 py-2.5 text-left text-xs text-gray-600 w-8">#</th>
                  <th className="px-3 py-2.5 text-left">
                    <button onClick={() => toggleRankSort('state')} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors">
                      State{sortIcon('state')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button onClick={() => toggleRankSort('stores')} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors">
                      Stores{sortIcon('stores')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button onClick={() => toggleRankSort('rev')} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors">
                      Revenue{sortIcon('rev')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button onClick={() => toggleRankSort('growth')} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-gray-200 transition-colors">
                      Growth %{sortIcon('growth')}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    Top Store
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                    Bottom Store
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankRows.map((row, i) => {
                  const share = totalRev > 0 ? (row.rev / totalRev * 100).toFixed(1) : '0'
                  return (
                    <tr key={row.state} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-gray-600 tabular-nums text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-200 font-medium">{row.state}</span>
                        <span className="ml-1.5 text-[10px] text-gray-600">{share}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-300 tabular-nums text-xs">{row.count}</td>
                      <td className="px-3 py-2.5 text-gray-200 tabular-nums font-medium whitespace-nowrap">
                        {fmtInr(row.rev)}
                      </td>
                      <td className={cn(
                        'px-3 py-2.5 tabular-nums font-medium whitespace-nowrap text-xs',
                        row.growth === null ? 'text-gray-500' : row.growth >= 0 ? 'text-emerald-400' : 'text-red-400',
                      )}>
                        {row.growth === null ? 'N/A' : fmtPct(row.growth)}
                      </td>
                      <td className="px-3 py-2.5 max-w-[140px]">
                        <span className="text-gray-300 text-xs truncate block" title={row.topStore?.store_name ?? ''}>
                          {row.topStore?.store_name ?? row.topStore?.store_id ?? '—'}
                        </span>
                        {row.topStore && (
                          <span className="text-[10px] text-gray-600">
                            {fmtInr(winRev(row.topStore, fm))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 max-w-[140px]">
                        <span className="text-gray-300 text-xs truncate block" title={row.bottomStore?.store_name ?? ''}>
                          {row.bottomStore?.store_name ?? row.bottomStore?.store_id ?? '—'}
                        </span>
                        {row.bottomStore && (
                          <span className="text-[10px] text-gray-600">
                            {fmtInr(winRev(row.bottomStore, fm))}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

    </div>
  )
}
