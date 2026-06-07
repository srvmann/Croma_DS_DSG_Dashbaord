import { useMemo, useState } from 'react'
import { BarChart2, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { allocatePhases } from '@/lib/classificationEngine'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

type TableSort = 'change' | 'pct' | 'recentAvg' | 'name'
type TableDir  = 'asc' | 'desc'
type TopN      = 5 | 10

interface MoverRow {
  store: StoreRecord
  recentAvg: number
  earlyAvg: number
  absChange: number
  pctChange: number | null
}


function phaseAvg(store: StoreRecord, ms: string[]) {
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
function abbr(m: string) {
  // "Jan-2024" → "Jan'24"
  return m.replace(/-20(\d{2})$/, "'$1")
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RevenueMovers({ filters }: { filters: FilterState }) {
  const { stores, months } = useDataContext()
  const [tableSort, setTableSort] = useState<TableSort>('change')
  const [tableDir,  setTableDir]  = useState<TableDir>('desc')
  const [topN,      setTopN]      = useState<TopN>(5)

  const {
    earlyRange, recentRange,
    gainers, losers, allMovers, maxAbsChange, netChange,
    topGainer, topLoser, insufficient,
  } = useMemo(() => {
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
      return {
        earlyRange: '—', recentRange: '—',
        gainers: [], losers: [], allMovers: [], maxAbsChange: 1, netChange: 0,
        topGainer: null, topLoser: null, insufficient: true,
      }
    }

    const { earlyMonths: early, recentMonths: recent } = allocatePhases(fm)

    const earlyRange  = `${abbr(early[0])} – ${abbr(early[early.length - 1])}`
    const recentRange = `${abbr(recent[0])} – ${abbr(recent[recent.length - 1])}`

    const allMovers: MoverRow[] = fs
      .map(store => {
        const earlyAvg  = phaseAvg(store, early)
        const recentAvg = phaseAvg(store, recent)
        const absChange = recentAvg - earlyAvg
        const pctChange = earlyAvg > 0 ? absChange / earlyAvg * 100 : null
        return { store, recentAvg, earlyAvg, absChange, pctChange }
      })
      .filter(m => m.earlyAvg > 0 || m.recentAvg > 0)
      .sort((a, b) => b.absChange - a.absChange)

    const gainers      = allMovers.filter(m => m.absChange > 0)
    const losers       = allMovers.filter(m => m.absChange < 0)
    const maxAbsChange = Math.max(...allMovers.map(m => Math.abs(m.absChange)), 1)
    const netChange    = allMovers.reduce((s, m) => s + m.absChange, 0)
    const topGainer    = gainers[0] ?? null
    const topLoser     = losers.length > 0
      ? losers.reduce((w, m) => m.absChange < w.absChange ? m : w)
      : null

    return {
      earlyRange, recentRange,
      gainers, losers, allMovers, maxAbsChange, netChange,
      topGainer, topLoser, insufficient: false,
    }
  }, [stores, months, filters])

  // ── Slope chart traces ────────────────────────────────────────────────────
  const slopeTraces = useMemo(() => {
    if (allMovers.length === 0) return []

    const topGainers = gainers.slice(0, topN)
    const topLosers  = [...losers].sort((a, b) => a.absChange - b.absChange).slice(0, topN)
    const showStores = [...topGainers, ...topLosers]
    if (showStores.length === 0) return []

    const maxAbs = Math.max(...showStores.map(m => Math.abs(m.absChange)), 1)
    const maxRev = Math.max(...showStores.map(m => Math.max(m.recentAvg, m.earlyAvg)), 1)

    // Colour scales: mint → deep emerald | blush → deep crimson
    function lerpHex(c1: string, c2: string, t: number): string {
      const p = (s: string, o: number) => parseInt(s.slice(o, o + 2), 16)
      const r = Math.round(p(c1, 1) + (p(c2, 1) - p(c1, 1)) * t)
      const g = Math.round(p(c1, 3) + (p(c2, 3) - p(c1, 3)) * t)
      const b = Math.round(p(c1, 5) + (p(c2, 5) - p(c1, 5)) * t)
      return `rgb(${r},${g},${b})`
    }
    const gColor = (mag: number) => lerpHex('#86efac', '#15803d', mag)
    const lColor = (mag: number) => lerpHex('#fca5a5', '#b91c1c', mag)

    const traces: object[] = []

    // ① Translucent delta-fill triangles (rendered behind lines)
    for (const m of showStores) {
      const isGainer = m.absChange > 0
      const mag      = Math.abs(m.absChange) / maxAbs
      traces.push({
        type: 'scatter', mode: 'lines',
        x: [0, 1, 1, 0],
        y: [m.earlyAvg, m.recentAvg, m.earlyAvg, m.earlyAvg],
        fill: 'toself',
        fillcolor: isGainer
          ? `rgba(16,185,129,${(0.04 + mag * 0.1).toFixed(2)})`
          : `rgba(239,68,68,${(0.04 + mag * 0.1).toFixed(2)})`,
        line: { color: 'rgba(0,0,0,0)', width: 0 },
        showlegend: false,
        hoverinfo: 'none',
      })
    }

    // ② Spline lines — thickness, opacity, colour all scale with magnitude
    for (const m of showStores) {
      const isGainer = m.absChange > 0
      const mag      = Math.abs(m.absChange) / maxAbs
      traces.push({
        type: 'scatter', mode: 'lines',
        x: [0, 1],
        y: [m.earlyAvg, m.recentAvg],
        line: {
          color:     isGainer ? gColor(mag) : lColor(mag),
          width:     1.8 + mag * 3.2,          // 1.8 → 5 px
          shape:     'spline',
          smoothing: 1.2,
        },
        opacity: 0.55 + mag * 0.45,            // 0.55 → 1.0
        showlegend: false,
        hoverinfo: 'none',
      })
    }

    // ③ Left dots — rank badge + store name + state (dot size ∝ early revenue)
    const leftRows = [
      ...topGainers.map((m, i) => ({ m, rank: i + 1, isGainer: true  })),
      ...topLosers .map((m, i) => ({ m, rank: i + 1, isGainer: false })),
    ]
    traces.push({
      type: 'scatter', mode: 'markers+text',
      x: leftRows.map(() => 0),
      y: leftRows.map(({ m }) => m.earlyAvg),
      marker: {
        size:  leftRows.map(({ m }) => 7 + (m.earlyAvg / maxRev) * 7),
        color: leftRows.map(({ m, isGainer }) => {
          const mag = Math.abs(m.absChange) / maxAbs
          return isGainer ? gColor(mag) : lColor(mag)
        }),
        line: { color: '#fff', width: 1.5 },
      },
      text: leftRows.map(({ m, rank, isGainer }) => {
        const name  = (m.store.store_name ?? m.store.store_id).slice(0, 14)
        const state = m.store.state ? ` · ${m.store.state}` : ''
        return `${isGainer ? '▲' : '▼'}${rank} ${name}${state}  `
      }),
      textposition: 'middle left',
      textfont: {
        size:  9,
        color: leftRows.map(({ isGainer }) => isGainer ? '#065f46' : '#7f1d1d'),
      },
      showlegend: false,
      hoverinfo: 'none',
    })

    // ④ Right dots — % + recent revenue label + rich hover (dot size ∝ recent revenue)
    traces.push({
      type: 'scatter', mode: 'markers+text',
      x: showStores.map(() => 1),
      y: showStores.map(m => m.recentAvg),
      marker: {
        size:  showStores.map(m => 8 + (m.recentAvg / maxRev) * 8),
        color: showStores.map(m => {
          const mag = Math.abs(m.absChange) / maxAbs
          return m.absChange > 0 ? gColor(mag) : lColor(mag)
        }),
        line: { color: '#fff', width: 1.5 },
      },
      text: showStores.map(m =>
        `  ${fmtPct(m.pctChange ?? 0)}`
      ),
      textposition: 'middle right',
      textfont: {
        size:  9,
        color: showStores.map(m => m.absChange > 0 ? '#059669' : '#dc2626'),
      },
      customdata: showStores.map(m => [
        m.store.store_name ?? m.store.store_id,
        m.store.state ?? '—',
        fmtInr(m.recentAvg),
        fmtInr(m.earlyAvg),
        fmtInr(m.absChange),
        fmtPct(m.pctChange ?? 0),
      ]),
      hovertemplate:
        '<b>%{customdata[0]}</b>  <i>%{customdata[1]}</i><br>' +
        `Recent (${recentRange}): ` + '%{customdata[2]}<br>' +
        `Early  (${earlyRange}): `  + '%{customdata[3]}<br>' +
        'Avg Δ: %{customdata[4]}  (%{customdata[5]})<extra></extra>',
      showlegend: false,
    })

    // ⑤ Legend entries
    traces.push({
      type: 'scatter', mode: 'lines',
      name: `▲ Gainers — top ${topGainers.length}`,
      x: [null], y: [null],
      line: { color: '#10b981', width: 3 },
    })
    traces.push({
      type: 'scatter', mode: 'lines',
      name: `▼ Losers — top ${topLosers.length}`,
      x: [null], y: [null],
      line: { color: '#ef4444', width: 3 },
    })

    return traces
  }, [gainers, losers, topN, earlyRange, recentRange])

  // ── Table sort ────────────────────────────────────────────────────────────
  const sortedTable = useMemo(() => {
    return [...allMovers].sort((a, b) => {
      if (tableSort === 'change')    return tableDir === 'desc' ? b.absChange - a.absChange : a.absChange - b.absChange
      if (tableSort === 'pct') {
        const pa = a.pctChange ?? -Infinity, pb = b.pctChange ?? -Infinity
        return tableDir === 'desc' ? pb - pa : pa - pb
      }
      if (tableSort === 'recentAvg') return tableDir === 'desc' ? b.recentAvg - a.recentAvg : a.recentAvg - b.recentAvg
      const na = a.store.store_name ?? a.store.store_id
      const nb = b.store.store_name ?? b.store.store_id
      return tableDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na)
    })
  }, [allMovers, tableSort, tableDir])

  function toggleTable(key: TableSort) {
    if (tableSort === key) setTableDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTableSort(key); setTableDir('desc') }
  }

  if (insufficient) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Need at least 2 months of data to compute phase comparison.
      </div>
    )
  }

  const topNOptions: { value: TopN; label: string }[] = [
    { value: 5,  label: 'Top 5'  },
    { value: 10, label: 'Top 10' },
  ]

  const scopeLabel = filters.state ? filters.state : 'All India'

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-blue-500" />
          Biggest Revenue Swings
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Ranks stores by absolute change in average monthly revenue · Early{' '}
          <span className="text-gray-600 font-medium">({earlyRange})</span>
          {' vs '}
          Recent <span className="text-gray-600 font-medium">({recentRange})</span>
          {' · '}
          <span className={cn('font-medium', filters.state ? 'text-blue-600' : 'text-gray-500')}>
            {scopeLabel}
          </span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm flex items-start gap-3">
          <div className="mt-0.5"><ArrowUpRight className="w-4 h-4 text-emerald-500" /></div>
          <div>
            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Gainers</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-tight">{gainers.length}</p>
            <p className="text-xs text-emerald-600 mt-1">stores grew phase-on-phase</p>
          </div>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm flex items-start gap-3">
          <div className="mt-0.5"><ArrowDownRight className="w-4 h-4 text-red-500" /></div>
          <div>
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Losers</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-tight">{losers.length}</p>
            <p className="text-xs text-red-500 mt-1">stores fell phase-on-phase</p>
          </div>
        </div>

        <div className={cn(
          'rounded-xl border p-4 shadow-sm flex items-start gap-3',
          netChange >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50',
        )}>
          <div className="mt-0.5"><Minus className="w-4 h-4 text-gray-400" /></div>
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Net Direction</p>
            <p className={cn('text-xl font-bold leading-tight', netChange >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              {netChange >= 0 ? 'Growing ↑' : 'Declining ↓'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {gainers.length} up · {losers.length} down
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex items-start gap-3">
          <div className="mt-0.5"><Minus className="w-4 h-4 text-gray-400" /></div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Flat / No Data</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums leading-tight">
              {allMovers.filter(m => m.absChange === 0).length}
            </p>
            <p className="text-xs text-gray-400 mt-1">unchanged</p>
          </div>
        </div>

      </div>

      {/* Spotlight — biggest gainer & loser */}
      {(topGainer || topLoser) && (
        <div className="grid grid-cols-2 gap-3">
          {topGainer && (
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-2">
                Biggest Gainer · {scopeLabel}
              </p>
              <p className="text-sm font-bold text-gray-900 truncate">
                {topGainer.store.store_name ?? topGainer.store.store_id}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{topGainer.store.state ?? '—'}</p>
              <p className="text-2xl font-bold text-emerald-600 mt-2 tabular-nums">
                {fmtPct(topGainer.pctChange ?? 0)}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{earlyRange} → {recentRange}</p>
            </div>
          )}
          {topLoser && (
            <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-white p-4 shadow-sm">
              <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-2">
                Biggest Loser · {scopeLabel}
              </p>
              <p className="text-sm font-bold text-gray-900 truncate">
                {topLoser.store.store_name ?? topLoser.store.store_id}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{topLoser.store.state ?? '—'}</p>
              <p className="text-2xl font-bold text-red-500 mt-2 tabular-nums">
                {fmtPct(topLoser.pctChange ?? 0)}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">{earlyRange} → {recentRange}</p>
            </div>
          )}
        </div>
      )}

      {/* Slope Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Phase Revenue Slope — {scopeLabel}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Top N <span className="text-emerald-600 font-medium">gainers</span> &amp;{' '}
              <span className="text-red-500 font-medium">losers</span> by avg monthly revenue shift ·
              Thicker + darker line = bigger move · Dot size = revenue scale · Hover for details.
            </p>
          </div>
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

        <Plot
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={slopeTraces as any}
          layout={{
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor:  'rgba(249,250,251,0.6)',
            height: topN === 5 ? 430 : 540,
            margin: { l: 260, r: 120, t: 44, b: 50 },
            font: { color: '#6b7280', family: 'Inter, sans-serif', size: 11 },
            xaxis: {
              tickvals: [0, 1],
              ticktext: [
                `Early Phase<br><i style="color:#9ca3af;font-size:10px">${earlyRange}</i>`,
                `Recent Phase<br><i style="color:#9ca3af;font-size:10px">${recentRange}</i>`,
              ],
              range: [-0.05, 1.05],
              fixedrange: true,
              showgrid: false,
              linecolor: '#e5e7eb',
              zeroline: false,
              tickfont: { size: 12, color: '#111827', family: 'Inter, sans-serif' },
              ticklen: 0,
            },
            yaxis: {
              gridcolor: '#f3f4f6',
              linecolor: 'rgba(0,0,0,0)',
              tickcolor: 'rgba(0,0,0,0)',
              showticklabels: false,
              automargin: false,
              title: { text: '' },
            },
            legend: {
              bgcolor: 'rgba(255,255,255,0.85)',
              bordercolor: '#f3f4f6',
              borderwidth: 1,
              font: { color: '#6b7280', size: 10 },
              orientation: 'h',
              x: 0,
              y: 1.08,
            },
            hovermode: 'closest',
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </div>

      {/* Full phase ranking table */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">
              Full Phase Ranking — {allMovers.length} stores
              {filters.state && <span className="text-blue-600"> · {filters.state}</span>}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Click column headers to sort</p>
          </div>
          <span className="text-xs text-gray-400">{earlyRange} vs {recentRange}</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs min-w-[660px]">
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
                  className={cn('px-3 py-3 text-right font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap', tableSort === 'recentAvg' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('recentAvg')}
                >
                  Recent Avg {tableSort === 'recentAvg' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-3 text-right font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                  Early Avg
                </th>
                <th
                  className={cn('px-3 py-3 text-right font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap', tableSort === 'change' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('change')}
                >
                  Δ Avg {tableSort === 'change' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th
                  className={cn('px-3 py-3 text-right font-semibold uppercase tracking-wider cursor-pointer select-none hidden md:table-cell whitespace-nowrap', tableSort === 'pct' ? 'text-gray-800' : 'text-gray-500 hover:text-gray-800')}
                  onClick={() => toggleTable('pct')}
                >
                  Δ % {tableSort === 'pct' && (tableDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-3 py-3 text-left font-semibold uppercase tracking-wider text-gray-500 hidden lg:table-cell w-28">
                  Bar
                </th>
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
                    className={cn(
                      'border-b border-gray-100 transition-colors',
                      i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                      'hover:bg-gray-50',
                    )}
                  >
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-gray-800 max-w-[140px] truncate">
                      {row.store.store_name ?? row.store.store_id}
                    </td>
                    <td className="px-3 py-2 text-gray-500 hidden sm:table-cell">
                      {row.store.state ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700 font-medium tabular-nums">
                      {fmtInr(row.recentAvg)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400 tabular-nums">
                      {fmtInr(row.earlyAvg)}
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right font-semibold tabular-nums',
                      isGainer ? 'text-emerald-600' : isLoser ? 'text-red-500' : 'text-gray-400',
                    )}>
                      <span className="mr-0.5">{isGainer ? '▲' : isLoser ? '▼' : '—'}</span>
                      {fmtInr(Math.abs(row.absChange))}
                    </td>
                    <td className={cn(
                      'px-3 py-2 text-right tabular-nums hidden md:table-cell',
                      isGainer ? 'text-emerald-500' : isLoser ? 'text-red-400' : 'text-gray-400',
                    )}>
                      {row.pctChange !== null ? fmtPct(row.pctChange) : '—'}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
                        <div
                          className={cn('h-full rounded-full', isGainer ? 'bg-emerald-500' : 'bg-red-500')}
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
