import { useMemo, useState } from 'react'
import { BarChart2, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

type TableSort = 'change' | 'pct' | 'thisRev' | 'name'
type TableDir  = 'asc' | 'desc'
type TopN      = 20 | 50 | 'all'

interface MoverRow {
  store: StoreRecord
  thisRev: number
  lastRev: number
  absChange: number
  pctChange: number | null
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

const LIGHT_AXIS = {
  gridcolor: '#f3f4f6',
  linecolor: '#e5e7eb',
  tickcolor: '#e5e7eb',
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RevenueMovers({ filters }: { filters: FilterState }) {
  const { stores, months } = useDataContext()
  const [tableSort, setTableSort] = useState<TableSort>('change')
  const [tableDir,  setTableDir]  = useState<TableDir>('desc')
  const [topN,      setTopN]      = useState<TopN>(20)

  const { fm, thisMonth, lastMonth, gainers, losers, allMovers, maxAbsChange, netChange } =
    useMemo(() => {
      let fs: StoreRecord[] = stores
      if (filters.state)    fs = fs.filter(s => s.state    === filters.state)
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

      if (fm.length < 2) {
        return { fm, thisMonth: null, lastMonth: null, gainers: [], losers: [], allMovers: [], maxAbsChange: 1, netChange: 0 }
      }

      const thisMonth = fm[fm.length - 1]
      const lastMonth = fm[fm.length - 2]

      const allMovers: MoverRow[] = fs.map(store => {
        const thisRev  = store.monthly_sales[thisMonth] ?? 0
        const lastRev  = store.monthly_sales[lastMonth] ?? 0
        const absChange = thisRev - lastRev
        const pctChange = lastRev > 0 ? absChange / lastRev * 100 : null
        return { store, thisRev, lastRev, absChange, pctChange }
      }).sort((a, b) => b.absChange - a.absChange)

      const gainers      = allMovers.filter(m => m.absChange > 0)
      const losers       = allMovers.filter(m => m.absChange < 0)
      const maxAbsChange = Math.max(...allMovers.map(m => Math.abs(m.absChange)), 1)
      const netChange    = allMovers.reduce((s, m) => s + m.absChange, 0)

      return { fm, thisMonth, lastMonth, gainers, losers, allMovers, maxAbsChange, netChange }
    }, [stores, months, filters])

  // ── Slope chart — efficient: fixed trace count regardless of store volume ──
  const slopeTraces = useMemo(() => {
    if (!thisMonth || !lastMonth || allMovers.length === 0) return []

    // Which stores to draw lines for
    const byAbsChange = [...allMovers].sort((a, b) => Math.abs(b.absChange) - Math.abs(a.absChange))
    const visible     = topN === 'all' ? allMovers : byAbsChange.slice(0, topN)

    // How many to show with name/% labels
    const labelCount  = topN === 20 ? 20 : 10
    const labeled     = byAbsChange.slice(0, Math.min(labelCount, byAbsChange.length))

    const visGainers  = visible.filter(m => m.absChange > 0)
    const visLosers   = visible.filter(m => m.absChange < 0)
    const visFlat     = visible.filter(m => m.absChange === 0)

    // Build one set of x/y per colour using null separators — O(stores), not O(stores²) traces
    function batchLines(rows: MoverRow[]): { x: (number | null)[]; y: (number | null)[] } {
      const x: (number | null)[] = []
      const y: (number | null)[] = []
      for (const m of rows) { x.push(0, 1, null); y.push(m.lastRev, m.thisRev, null) }
      return { x, y }
    }

    const lineOpacity = topN === 'all' ? 0.22 : topN === 50 ? 0.45 : 0.65
    const lineWidth   = topN === 'all' ? 1    : topN === 50 ? 1.3  : 1.8

    const traces: object[] = []

    if (visGainers.length) traces.push({
      type: 'scatter', mode: 'lines', name: 'Gainers',
      ...batchLines(visGainers),
      line: { color: '#10b981', width: lineWidth },
      opacity: lineOpacity,
      hoverinfo: 'none',
    })

    if (visLosers.length) traces.push({
      type: 'scatter', mode: 'lines', name: 'Losers',
      ...batchLines(visLosers),
      line: { color: '#ef4444', width: lineWidth },
      opacity: lineOpacity,
      hoverinfo: 'none',
    })

    if (visFlat.length) traces.push({
      type: 'scatter', mode: 'lines', name: 'Flat',
      ...batchLines(visFlat),
      line: { color: '#9ca3af', width: 1 },
      opacity: 0.2,
      hoverinfo: 'none',
    })

    // All visible stores — right-end dots with hover tooltip
    traces.push({
      type: 'scatter', mode: 'markers',
      name: thisMonth,
      x: visible.map(() => 1),
      y: visible.map(m => m.thisRev),
      marker: {
        size: 5,
        color: visible.map(m => m.absChange > 0 ? '#10b981' : m.absChange < 0 ? '#ef4444' : '#9ca3af'),
        opacity: 0.6,
        line: { color: '#fff', width: 0.8 },
      },
      text: visible.map(m =>
        `<b>${m.store.store_name ?? m.store.store_id}</b><br>` +
        `${thisMonth}: ${fmtInr(m.thisRev)}<br>` +
        `${lastMonth}: ${fmtInr(m.lastRev)}<br>` +
        `Δ ${fmtInr(m.absChange)} (${fmtPct(m.pctChange ?? 0)})`
      ),
      hovertemplate: '%{text}<extra></extra>',
      showlegend: false,
    })

    // Labeled stores — left dot + store name
    traces.push({
      type: 'scatter', mode: 'markers+text',
      x: labeled.map(() => 0),
      y: labeled.map(m => m.lastRev),
      marker: { size: 7, color: '#9ca3af', line: { color: '#fff', width: 1 } },
      text: labeled.map(m => `${m.store.store_name ?? m.store.store_id}  `),
      textposition: 'middle left',
      textfont: { size: 9, color: '#6b7280' },
      showlegend: false,
      hoverinfo: 'none',
    })

    // Labeled stores — right dot + % change badge
    traces.push({
      type: 'scatter', mode: 'markers+text',
      x: labeled.map(() => 1),
      y: labeled.map(m => m.thisRev),
      marker: {
        size: 9,
        color: labeled.map(m => m.absChange > 0 ? '#10b981' : m.absChange < 0 ? '#ef4444' : '#9ca3af'),
        line: { color: '#fff', width: 1.2 },
      },
      text: labeled.map(m => `  ${fmtPct(m.pctChange ?? 0)}`),
      textposition: 'middle right',
      textfont: {
        size: 9,
        color: labeled.map(m => m.absChange > 0 ? '#059669' : m.absChange < 0 ? '#dc2626' : '#9ca3af'),
      },
      showlegend: false,
      hoverinfo: 'none',
    })

    return traces
  }, [allMovers, topN, thisMonth, lastMonth])

  // ── Table sort ────────────────────────────────────────────────────────────
  const sortedTable = useMemo(() => {
    return [...allMovers].sort((a, b) => {
      if (tableSort === 'change')  return tableDir === 'desc' ? b.absChange - a.absChange : a.absChange - b.absChange
      if (tableSort === 'pct') {
        const pa = a.pctChange ?? -Infinity, pb = b.pctChange ?? -Infinity
        return tableDir === 'desc' ? pb - pa : pa - pb
      }
      if (tableSort === 'thisRev') return tableDir === 'desc' ? b.thisRev - a.thisRev : a.thisRev - b.thisRev
      const na = a.store.store_name ?? a.store.store_id
      const nb = b.store.store_name ?? b.store.store_id
      return tableDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na)
    })
  }, [allMovers, tableSort, tableDir])

  function toggleTable(key: TableSort) {
    if (tableSort === key) setTableDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTableSort(key); setTableDir('desc') }
  }

  if (!thisMonth || !lastMonth) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Need at least 2 months of data to compute MoM change.
      </div>
    )
  }

  const topNOptions: { value: TopN; label: string }[] = [
    { value: 20,    label: 'Top 20' },
    { value: 50,    label: 'Top 50' },
    { value: 'all', label: `All ${allMovers.length}` },
  ]

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-blue-500" />
          Revenue Movers
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Month-on-month change:{' '}
          <span className="text-gray-600 font-medium">{lastMonth}</span>{' → '}
          <span className="text-gray-600 font-medium">{thisMonth}</span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm flex items-start gap-3">
          <div className="mt-0.5"><ArrowUpRight className="w-4 h-4 text-emerald-500" /></div>
          <div>
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Gainers</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-tight">{gainers.length}</p>
            <p className="text-xs text-emerald-600 mt-1">stores up MoM</p>
          </div>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm flex items-start gap-3">
          <div className="mt-0.5"><ArrowDownRight className="w-4 h-4 text-red-500" /></div>
          <div>
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Losers</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-tight">{losers.length}</p>
            <p className="text-xs text-red-500 mt-1">stores down MoM</p>
          </div>
        </div>

        <div className={cn(
          'rounded-xl border p-4 shadow-sm flex items-start gap-3',
          netChange >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
        )}>
          <div className="mt-0.5"><Minus className="w-4 h-4 text-gray-400" /></div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Net Change</p>
            <p className={cn('text-2xl font-bold tabular-nums leading-tight', netChange >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              {fmtInr(netChange)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{netChange >= 0 ? 'Net gain' : 'Net loss'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex items-start gap-3">
          <div className="mt-0.5"><Minus className="w-4 h-4 text-gray-400" /></div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Flat / No Data</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-tight">
              {allMovers.filter(m => m.absChange === 0).length}
            </p>
            <p className="text-xs text-gray-400 mt-1">unchanged MoM</p>
          </div>
        </div>
      </div>

      {/* Slope Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Chart header + toggle */}
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Revenue Slope — {lastMonth} → {thisMonth}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Each line is a store.{' '}
              <span className="text-emerald-600 font-medium">Green rising</span> = gainer,{' '}
              <span className="text-red-500 font-medium">red falling</span> = loser.
              Hover any dot for details.
            </p>
          </div>

          {/* Top N toggle */}
          <div className="flex items-center gap-1 shrink-0">
            {topNOptions.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setTopN(opt.value)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-colors',
                  topN === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Context hint for "All" */}
        {topN === 'all' && (
          <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-2 mb-2">
            Showing all {allMovers.length} stores — lines are thin &amp; translucent; top 10 movers labeled.
            Hover dots for store details.
          </p>
        )}

        <Plot
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={slopeTraces as any}
          layout={{
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor:  'rgba(0,0,0,0)',
            height: 520,
            margin: { l: 160, r: 110, t: 30, b: 40 },
            font: { color: '#6b7280', family: 'Inter, sans-serif', size: 11 },
            xaxis: {
              tickvals: [0, 1],
              ticktext: [lastMonth ?? '', thisMonth ?? ''],
              range: [-0.05, 1.05],
              fixedrange: true,
              showgrid: false,
              linecolor: '#e5e7eb',
              zeroline: false,
              tickfont: { size: 12, color: '#374151' },
            },
            yaxis: {
              ...LIGHT_AXIS,
              tickprefix: '₹',
              tickformat: ',.0f',
              automargin: true,
              title: { text: 'Revenue', font: { color: '#9ca3af', size: 11 } },
            },
            legend: {
              bgcolor: 'rgba(0,0,0,0)',
              font: { color: '#6b7280', size: 10 },
              orientation: 'h',
              x: 0,
              y: 1.04,
            },
            hovermode: 'closest',
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </div>

      {/* Full ranked table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Full MoM Ranking — all {allMovers.length} stores
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Click column headers to sort</p>
          </div>
          <span className="text-xs text-gray-400">{thisMonth} vs {lastMonth}</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-gray-500 w-8">#</th>
                <th
                  className={cn('px-3 py-3 text-left font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap', tableSort === 'name' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('name')}
                >
                  Store {tableSort === 'name' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-3 text-left font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">State</th>
                <th
                  className={cn('px-3 py-3 text-right font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap', tableSort === 'thisRev' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('thisRev')}
                >
                  {thisMonth} {tableSort === 'thisRev' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-3 text-right font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{lastMonth}</th>
                <th
                  className={cn('px-3 py-3 text-right font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap', tableSort === 'change' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('change')}
                >
                  Δ Abs {tableSort === 'change' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className={cn('px-3 py-3 text-right font-semibold uppercase tracking-wider cursor-pointer select-none hidden md:table-cell whitespace-nowrap', tableSort === 'pct' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('pct')}
                >
                  Δ % {tableSort === 'pct' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-3 text-left font-semibold uppercase tracking-wider text-gray-500 hidden lg:table-cell w-28">Bar</th>
              </tr>
            </thead>
            <tbody>
              {sortedTable.map((row, i) => {
                const isGainer = row.absChange > 0
                const isLoser  = row.absChange < 0
                const barW     = (Math.abs(row.absChange) / maxAbsChange) * 100
                return (
                  <tr
                    key={row.store.store_id}
                    className={cn('border-b border-gray-100 transition-colors', i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50', 'hover:bg-gray-50')}
                  >
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800 max-w-[140px] truncate">
                      {row.store.store_name ?? row.store.store_id}
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">{row.store.state ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700 font-medium tabular-nums">{fmtInr(row.thisRev)}</td>
                    <td className="px-3 py-2 text-right text-gray-400 tabular-nums">{fmtInr(row.lastRev)}</td>
                    <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', isGainer ? 'text-emerald-600' : isLoser ? 'text-red-500' : 'text-gray-400')}>
                      <span className="mr-0.5">{isGainer ? '▲' : isLoser ? '▼' : '—'}</span>
                      {fmtInr(Math.abs(row.absChange))}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums hidden md:table-cell', isGainer ? 'text-emerald-500' : isLoser ? 'text-red-400' : 'text-gray-400')}>
                      {row.pctChange !== null ? fmtPct(row.pctChange) : '—'}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
                        <div className={cn('h-full rounded-full', isGainer ? 'bg-emerald-500' : 'bg-red-500')} style={{ width: `${barW}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
