import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
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
type TableDir = 'asc' | 'desc'

interface MoverRow {
  store: StoreRecord
  thisRev: number
  lastRev: number
  absChange: number
  pctChange: number | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Main Component ────────────────────────────────────────────────────────────

export default function RevenueMovers({ filters }: { filters: FilterState }) {
  const { stores, months } = useDataContext()

  const [tableSort, setTableSort] = useState<TableSort>('change')
  const [tableDir, setTableDir] = useState<TableDir>('desc')

  const { fm, thisMonth, lastMonth, gainers, losers, allMovers, maxAbsChange, netChange } =
    useMemo(() => {
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

      if (fm.length < 2) {
        return {
          fm, thisMonth: null, lastMonth: null,
          gainers: [], losers: [], allMovers: [],
          maxAbsChange: 1, netChange: 0,
        }
      }

      const thisMonth = fm[fm.length - 1]
      const lastMonth = fm[fm.length - 2]

      const allMovers: MoverRow[] = fs.map(store => {
        const thisRev = store.monthly_sales[thisMonth] ?? 0
        const lastRev = store.monthly_sales[lastMonth] ?? 0
        const absChange = thisRev - lastRev
        const pctChange = lastRev > 0 ? absChange / lastRev * 100 : null
        return { store, thisRev, lastRev, absChange, pctChange }
      }).sort((a, b) => b.absChange - a.absChange)

      const gainers = allMovers.filter(m => m.absChange > 0)
      const losers = allMovers.filter(m => m.absChange < 0)
      const maxAbsChange = Math.max(...allMovers.map(m => Math.abs(m.absChange)), 1)
      const netChange = allMovers.reduce((s, m) => s + m.absChange, 0)

      return { fm, thisMonth, lastMonth, gainers, losers, allMovers, maxAbsChange, netChange }
    }, [stores, months, filters])

  const sortedTable = useMemo(() => {
    const arr = [...allMovers]
    arr.sort((a, b) => {
      if (tableSort === 'change') return tableDir === 'desc' ? b.absChange - a.absChange : a.absChange - b.absChange
      if (tableSort === 'pct') {
        const pa = a.pctChange ?? -Infinity, pb = b.pctChange ?? -Infinity
        return tableDir === 'desc' ? pb - pa : pa - pb
      }
      if (tableSort === 'thisRev') return tableDir === 'desc' ? b.thisRev - a.thisRev : a.thisRev - b.thisRev
      const na = a.store.store_name ?? a.store.store_id
      const nb = b.store.store_name ?? b.store.store_id
      return tableDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na)
    })
    return arr
  }, [allMovers, tableSort, tableDir])

  // Net mover chart — sorted by absChange, positive left → negative right
  const netMoverTrace = useMemo(() => {
    const cap = 40
    const chartStores = [
      ...gainers.slice(0, Math.ceil(cap / 2)),
      ...[...losers].reverse().slice(0, Math.floor(cap / 2)),
    ]
    return [{
      type: 'bar' as const,
      x: chartStores.map(m => m.store.store_name ?? m.store.store_id),
      y: chartStores.map(m => m.absChange),
      marker: {
        color: chartStores.map(m => m.absChange >= 0 ? '#10b981' : '#ef4444'),
        opacity: 0.85,
      },
      hovertemplate: '<b>%{x}</b><br>Change: ₹%{y:,.0f}<extra></extra>',
    }]
  }, [gainers, losers])

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
          Revenue Movers
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Month-on-month change: <span className="text-gray-400">{lastMonth}</span>{' → '}
          <span className="text-gray-400">{thisMonth}</span>
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Gainers',
            value: gainers.length,
            sub: gainers.length ? `+${fmtInr(gainers.reduce((s, m) => s + m.absChange, 0))} total` : '—',
            color: 'text-emerald-400',
            icon: <ArrowUpRight className="w-4 h-4 text-emerald-400" />,
          },
          {
            label: 'Losers',
            value: losers.length,
            sub: losers.length ? `${fmtInr(losers.reduce((s, m) => s + m.absChange, 0))} total` : '—',
            color: 'text-red-400',
            icon: <ArrowDownRight className="w-4 h-4 text-red-400" />,
          },
          {
            label: 'Net Change',
            value: fmtInr(netChange),
            sub: netChange >= 0 ? 'Net gain' : 'Net loss',
            color: netChange >= 0 ? 'text-emerald-400' : 'text-red-400',
            icon: <Minus className="w-4 h-4 text-gray-400" />,
          },
          {
            label: 'Flat / No Data',
            value: allMovers.filter(m => m.absChange === 0).length,
            sub: 'unchanged MoM',
            color: 'text-gray-400',
            icon: <Minus className="w-4 h-4 text-gray-500" />,
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 flex items-start gap-3"
          >
            <div className="mt-0.5">{s.icon}</div>
            <div>
              <p className={cn('text-xl font-bold tabular-nums leading-tight', s.color)}>{s.value}</p>
              <p className="text-[11px] text-gray-500">{s.label}</p>
              <p className="text-[10px] text-gray-600">{s.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Net mover chart */}
      {netMoverTrace[0] && (netMoverTrace[0].x as string[]).length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Net MoM Change per Store — {lastMonth} → {thisMonth}
          </h3>
          <Plot
            data={netMoverTrace}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              height: 300,
              margin: { l: 60, r: 20, t: 10, b: 90 },
              font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
              xaxis: {
                gridcolor: '#1f2937',
                linecolor: '#374151',
                tickcolor: '#374151',
                tickangle: -40,
                automargin: true,
              },
              yaxis: {
                gridcolor: '#1f2937',
                linecolor: '#374151',
                tickcolor: '#374151',
                tickprefix: '₹',
                tickformat: ',.0f',
                zeroline: true,
                zerolinecolor: '#374151',
                zerolinewidth: 1.5,
                automargin: true,
              },
              bargap: 0.25,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {/* Full ranked table */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">
            Full MoM Ranking — all {allMovers.length} stores
          </h3>
          <span className="text-xs text-gray-500">
            {thisMonth} vs {lastMonth}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800/60 text-gray-500">
                <th className="px-4 py-2.5 text-left font-medium w-8">#</th>
                <th
                  className="px-3 py-2.5 text-left font-medium cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => toggleTable('name')}
                >
                  Store {tableSort === 'name' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-600 hidden sm:table-cell">State</th>
                <th
                  className="px-3 py-2.5 text-right font-medium cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => toggleTable('thisRev')}
                >
                  {thisMonth} {tableSort === 'thisRev' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-gray-600">{lastMonth}</th>
                <th
                  className="px-3 py-2.5 text-right font-medium cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => toggleTable('change')}
                >
                  Δ Abs {tableSort === 'change' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className="px-3 py-2.5 text-right font-medium cursor-pointer hover:text-gray-300 select-none hidden md:table-cell"
                  onClick={() => toggleTable('pct')}
                >
                  Δ % {tableSort === 'pct' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-2.5 text-left font-medium hidden lg:table-cell w-28">Bar</th>
              </tr>
            </thead>
            <tbody>
              {sortedTable.map((row, i) => {
                const isGainer = row.absChange > 0
                const isLoser = row.absChange < 0
                const barW = (Math.abs(row.absChange) / maxAbsChange) * 100

                return (
                  <tr
                    key={row.store.store_id}
                    className={cn(
                      'border-b border-gray-800/40 transition-colors',
                      i % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                      'hover:bg-gray-800/40',
                    )}
                  >
                    <td className="px-4 py-2 text-gray-600">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-200 max-w-[140px] truncate">
                      {row.store.store_name ?? row.store.store_id}
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                      {row.store.state ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 tabular-nums">
                      {fmtInr(row.thisRev)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500 tabular-nums">
                      {fmtInr(row.lastRev)}
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right font-semibold tabular-nums',
                      isGainer ? 'text-emerald-400' : isLoser ? 'text-red-400' : 'text-gray-500',
                    )}>
                      <span className="mr-0.5">
                        {isGainer ? '▲' : isLoser ? '▼' : '—'}
                      </span>
                      {fmtInr(Math.abs(row.absChange))}
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right tabular-nums hidden md:table-cell',
                      isGainer ? 'text-emerald-400/80' : isLoser ? 'text-red-400/80' : 'text-gray-500',
                    )}>
                      {row.pctChange !== null ? fmtPct(row.pctChange) : '—'}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden w-full">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            isGainer ? 'bg-emerald-500' : 'bg-red-500',
                          )}
                          style={{ width: `${barW}%` }}
                        />
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
