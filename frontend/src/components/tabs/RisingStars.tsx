import { useMemo, useState } from 'react'
import { TrendingUp, Info } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

type SortKey = 'growth' | 'earlyRev' | 'recentRev' | 'earlyRank' | 'recentRank' | 'health' | 'state'
type SortDir = 'asc' | 'desc'

interface RiserRow {
  store: StoreRecord
  growth: number
  earlyAvg: number
  recentAvg: number
  earlyRank: number
  recentRank: number
  health: number
}

function mAvg(store: StoreRecord, ms: string[]) {
  return ms.length ? ms.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0) / ms.length : 0
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

const TABLE_COLS: { key: SortKey | null; label: string; align: 'left' | 'right' | 'center' }[] = [
  { key: null,          label: 'Store',        align: 'left'   },
  { key: 'state',       label: 'State',        align: 'left'   },
  { key: null,          label: 'Status',       align: 'left'   },
  { key: 'earlyRev',   label: 'Early Rev',    align: 'right'  },
  { key: 'recentRev',  label: 'Recent Rev',   align: 'right'  },
  { key: 'growth',      label: 'Growth %',     align: 'right'  },
  { key: 'earlyRank',  label: 'Early Rank',   align: 'center' },
  { key: 'recentRank', label: 'Recent Rank',  align: 'center' },
  { key: 'health',      label: 'Health',       align: 'right'  },
]

export default function RisingStars({
  filters,
  onNavigateToStore,
}: {
  filters: FilterState
  onNavigateToStore?: (storeId: string) => void
}) {
  const { stores, months } = useDataContext()
  const [sortKey, setSortKey] = useState<SortKey>('growth')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { risers, kpi, top15 } = useMemo(() => {
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

    const earlyRankMap = new Map(
      [...fs].sort((a, b) => mAvg(a, early) - mAvg(b, early)).map((s, i) => [s.store_id, i + 1])
    )
    const recentRankMap = new Map(
      [...fs].sort((a, b) => mAvg(a, recent) - mAvg(b, recent)).map((s, i) => [s.store_id, i + 1])
    )
    const total = fs.length

    const risers: RiserRow[] = []
    for (const store of fs) {
      const earlyAvg = mAvg(store, early)
      const recentAvg = mAvg(store, recent)
      if (earlyAvg === 0 || !early.length || !recent.length) continue
      const growth = (recentAvg - earlyAvg) / earlyAvg * 100
      if (growth <= 0) continue
      const earlyRank = earlyRankMap.get(store.store_id) ?? 0
      const recentRank = recentRankMap.get(store.store_id) ?? 0
      const health = total > 0 ? +(recentRank / total * 100).toFixed(1) : 0
      risers.push({ store, growth, earlyAvg, recentAvg, earlyRank, recentRank, health })
    }

    const totalEarly = risers.reduce((s, r) => s + r.earlyAvg, 0)
    const totalRecent = risers.reduce((s, r) => s + r.recentAvg, 0)
    const topRiser = risers.length > 0
      ? risers.reduce((best, r) => r.growth > best.growth ? r : best)
      : null
    const avgGrowth = risers.length > 0
      ? risers.reduce((s, r) => s + r.growth, 0) / risers.length
      : 0

    const top15 = [...risers].sort((a, b) => b.recentAvg - a.recentAvg).slice(0, 15)

    return {
      risers,
      kpi: { count: risers.length, addedRevenue: totalRecent - totalEarly, earlyTotal: totalEarly, recentTotal: totalRecent, topRiser, avgGrowth },
      top15,
    }
  }, [stores, months, filters])

  const sorted = useMemo(() => {
    return [...risers].sort((a, b) => {
      if (sortKey === 'state') {
        const sa = a.store.state ?? '', sb = b.store.state ?? ''
        return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
      }
      const map: Record<string, [number, number]> = {
        growth:      [a.growth,      b.growth],
        earlyRev:   [a.earlyAvg,   b.earlyAvg],
        recentRev:  [a.recentAvg,  b.recentAvg],
        earlyRank:  [a.earlyRank,  b.earlyRank],
        recentRank: [a.recentRank, b.recentRank],
        health:      [a.health,      b.health],
      }
      const [va, vb] = map[sortKey] ?? [0, 0]
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [risers, sortKey, sortDir])

  const { chartTraces, chartCategories } = useMemo(() => {
    if (top15.length === 0) return { chartTraces: [] as object[], chartCategories: [] as string[] }
    const ordered = [...top15].sort((a, b) => a.recentAvg - b.recentAvg)
    const chartCategories = ordered.map(r => r.store.store_id)

    const lines = ordered.map(row => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [row.earlyAvg, row.recentAvg],
      y: [row.store.store_id, row.store.store_id],
      showlegend: false,
      line: { color: '#d1d5db', width: 2 },
      hoverinfo: 'none' as const,
    }))

    const earlyTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Early',
      x: ordered.map(r => r.earlyAvg),
      y: ordered.map(r => r.store.store_id),
      marker: { symbol: 'circle', size: 10, color: '#9ca3af' },
      hovertemplate: '<b>%{y}</b><br>Early: ₹%{x:,.0f}/mo<extra></extra>',
    }

    const recentTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Recent',
      x: ordered.map(r => r.recentAvg),
      y: ordered.map(r => r.store.store_id),
      marker: { symbol: 'circle', size: 10, color: '#3b82f6' },
      hovertemplate: '<b>%{y}</b><br>Recent: ₹%{x:,.0f}/mo<extra></extra>',
    }

    return { chartTraces: [...lines, earlyTrace, recentTrace], chartCategories }
  }, [top15])

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
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          Rising Stars — Stores That Recovered &amp; Grew
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Bottom 40% early → top 30% recently · {risers.length} stores · nurture &amp; scale
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Rising Stars</p>
          <p className="text-3xl font-bold text-gray-900">{kpi.count}</p>
          <p className="text-xs text-gray-400 mt-1">in current scope</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Added Revenue</p>
          <p className="text-2xl font-bold text-gray-900">{fmtInr(kpi.addedRevenue)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmtInr(kpi.earlyTotal)} → {fmtInr(kpi.recentTotal)}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Top Riser</p>
          <p className="text-2xl font-bold text-gray-900">
            {kpi.topRiser?.store.store_name ?? kpi.topRiser?.store.store_id ?? '—'}
          </p>
          <p className="text-xs text-emerald-600 mt-1">
            {kpi.topRiser ? `${fmtPct(kpi.topRiser.growth)} growth` : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-2">Avg Growth</p>
          <p className="text-2xl font-bold text-amber-700">{fmtPct(kpi.avgGrowth)}</p>
          <p className="text-xs text-amber-500 mt-1">Mean phase growth</p>
        </div>
      </div>

      {/* Click hint */}
      {onNavigateToStore && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs text-blue-600">
            Click any row to open that store's Journey Deep Dive
          </span>
        </div>
      )}

      {/* Dumbbell chart */}
      {top15.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Early → Recent Revenue Shift</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Top {top15.length} by recent revenue</p>
          <Plot
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={chartTraces as any}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              height: Math.max(320, top15.length * 30 + 90),
              margin: { l: 70, r: 20, t: 20, b: 60 },
              font: { color: '#6b7280', family: 'Inter, sans-serif', size: 11 },
              xaxis: {
                gridcolor: '#f3f4f6',
                linecolor: '#e5e7eb',
                tickprefix: '₹',
                tickformat: ',.0f',
                automargin: true,
                title: { text: 'Revenue (monthly avg)', font: { color: '#9ca3af', size: 11 } },
              },
              yaxis: {
                gridcolor: '#f3f4f6',
                linecolor: '#e5e7eb',
                type: 'category' as const,
                categoryorder: 'array' as const,
                categoryarray: chartCategories,
                automargin: true,
              },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#6b7280', size: 10 },
                orientation: 'h' as const,
                x: 0,
                y: 1.08,
              },
              hovermode: 'closest' as const,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* Detail table */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Rising Stars Detail</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">Click column headers to sort</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {TABLE_COLS.map(({ key, label, align }) => (
                  <th
                    key={label}
                    onClick={key ? () => toggleSort(key) : undefined}
                    className={cn(
                      'px-4 py-3 font-semibold uppercase tracking-wider whitespace-nowrap text-gray-500',
                      align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center',
                      key ? 'cursor-pointer hover:text-gray-800 select-none' : '',
                      key && sortKey === key ? 'text-gray-800' : '',
                    )}
                  >
                    {label}
                    {key && sortKey === key && (
                      <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.store.store_id}
                  onClick={() => onNavigateToStore?.(row.store.store_id)}
                  className={cn(
                    'border-b border-gray-100 transition-colors',
                    i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                    onNavigateToStore ? 'cursor-pointer hover:bg-emerald-50/40' : 'hover:bg-gray-50',
                  )}
                >
                  <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">
                    {row.store.store_name ?? row.store.store_id}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {row.store.state ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] font-semibold text-blue-500">
                    Recovering
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">
                    {fmtInr(row.earlyAvg)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-medium tabular-nums">
                    {fmtInr(row.recentAvg)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-600 tabular-nums">
                    {fmtPct(row.growth)}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-400 tabular-nums">
                    {row.earlyRank}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">
                    {row.recentRank}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                    {row.health.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
