import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'

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

const PAGE_SIZE = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function storeMonthRevs(store: StoreRecord, months: string[]): number[] {
  return months.map(m => store.monthly_sales[m] ?? 0)
}

// Color-scale helpers for the comparison table
function cellBg(value: number, min: number, max: number): string {
  if (value === 0) return 'rgba(107,114,128,0.08)'
  if (max === min) return 'rgba(59,130,246,0.15)'
  const t = (value - min) / (max - min) // 0=low 1=high
  if (t < 0.5) {
    return `rgba(239,68,68,${0.08 + (0.5 - t) * 0.5})`
  }
  return `rgba(16,185,129,${0.08 + (t - 0.5) * 0.5})`
}

function cellTextColor(value: number, min: number, max: number): string {
  if (value === 0) return '#4b5563'
  if (max === min) return '#93c5fd'
  const t = (value - min) / (max - min)
  if (t < 0.25) return '#fca5a5'
  if (t > 0.75) return '#6ee7b7'
  return '#9ca3af'
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function MonthlyRevenue({ filters }: Props) {
  const { stores, months } = useDataContext()
  const [tablePage, setTablePage] = useState(0)

  // ── Filter ─────────────────────────────────────────────────────────────────
  const { fs, fm } = useMemo(() => {
    let fs = stores
    if (filters.state) fs = fs.filter(s => s.state === filters.state)
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

    return { fs, fm }
  }, [stores, months, filters])

  // ── Grouped bar: revenue by month, grouped by state ─────────────────────────
  const barTraces = useMemo(() => {
    const byState: Record<string, Record<string, number>> = {}
    for (const store of fs) {
      const state = store.state ?? 'Unknown'
      if (!byState[state]) byState[state] = {}
      for (const m of fm) {
        byState[state][m] = (byState[state][m] ?? 0) + (store.monthly_sales[m] ?? 0)
      }
    }
    return Object.entries(byState).map(([state, byM], i) => ({
      type: 'bar' as const,
      name: state,
      x: fm,
      y: fm.map(m => byM[m] ?? 0),
      marker: { color: STATE_PALETTE[i % STATE_PALETTE.length], opacity: 0.85 },
      hovertemplate: `<b>${state}</b><br>%{x}: ₹%{y:,.0f}<extra></extra>`,
    }))
  }, [fs, fm])

  // ── Box plot: distribution of store revenues per month ─────────────────────
  const boxTraces = useMemo(() =>
    fm.map((month, i) => ({
      type: 'box' as const,
      y: fs.map(s => s.monthly_sales[month] ?? 0),
      name: month,
      boxpoints: false as const,
      marker: { color: STATE_PALETTE[i % STATE_PALETTE.length] },
      line: { color: STATE_PALETTE[i % STATE_PALETTE.length], width: 1.5 },
      fillcolor: `${STATE_PALETTE[i % STATE_PALETTE.length]}28`,
      hovertemplate: `%{y:,.0f}<extra>${month}</extra>`,
    })),
  [fs, fm])

  // ── Waterfall: portfolio MoM revenue change ────────────────────────────────
  const waterfallTrace = useMemo(() => {
    const totals = fm.map(m => fs.reduce((s, st) => s + (st.monthly_sales[m] ?? 0), 0))
    if (totals.length < 2) return null

    const measure = totals.map((_, i) => i === 0 ? 'absolute' : 'relative')
    const values = totals.map((t, i) => i === 0 ? t : t - totals[i - 1])
    const texts = values.map((v, i) =>
      i === 0 ? fmtInr(v) : fmtPct((v / (totals[i - 1] || 1)) * 100)
    )

    return { measure, values, texts, totals }
  }, [fs, fm])

  // ── Month comparison table ─────────────────────────────────────────────────
  const tableData = useMemo(() => {
    const rows = fs
      .map(store => {
        const values = storeMonthRevs(store, fm)
        const total = values.reduce((s, r) => s + r, 0)
        return { store, values, total }
      })
      .sort((a, b) => b.total - a.total)

    const allValues = rows.flatMap(r => r.values)
    const min = allValues.length ? Math.min(...allValues) : 0
    const max = allValues.length ? Math.max(...allValues) : 1
    return { rows, min, max }
  }, [fs, fm])

  const totalPages = Math.ceil(tableData.rows.length / PAGE_SIZE)
  const tableSlice = tableData.rows.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)

  // ── Empty state ────────────────────────────────────────────────────────────
  if (fs.length === 0 || fm.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 min-h-96 flex items-center justify-center">
        <p className="text-gray-500 text-sm">No data for selected filters</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Grouped Bar Chart ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Revenue by Month &amp; State</h3>
        <p className="mb-3 text-[11px] text-gray-500">Total revenue per state, grouped by month</p>
        <Plot
          data={barTraces}
          layout={{
            ...PLOTLY_BASE,
            barmode: 'group' as const,
            legend: {
              bgcolor: 'rgba(0,0,0,0)',
              font: { color: '#9ca3af', size: 10 },
              orientation: 'h' as const,
              y: -0.22,
            },
            xaxis: { ...PLOTLY_AXES },
            yaxis: { ...PLOTLY_AXES, title: { text: 'Revenue (₹)' }, tickformat: ',.0f' },
            margin: { l: 70, r: 16, t: 8, b: 110 },
            height: 380,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </motion.div>

      {/* ── Box Plot + Waterfall ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Distribution Box Plot */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Store Revenue Distribution</h3>
          <p className="mb-3 text-[11px] text-gray-500">Spread of individual store revenues per month</p>
          <Plot
            data={boxTraces}
            layout={{
              ...PLOTLY_BASE,
              showlegend: false,
              xaxis: { ...PLOTLY_AXES },
              yaxis: { ...PLOTLY_AXES, title: { text: 'Revenue (₹)' }, tickformat: ',.0f' },
              margin: { l: 70, r: 16, t: 8, b: 60 },
              height: 300,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>

        {/* MoM Waterfall */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-0.5 text-sm font-semibold text-gray-200">MoM Revenue Growth</h3>
          <p className="mb-3 text-[11px] text-gray-500">Month-over-month portfolio revenue change</p>
          {waterfallTrace ? (
            <Plot
              data={[{
                type: 'waterfall',
                orientation: 'v',
                measure: waterfallTrace.measure as ('absolute' | 'relative' | 'total')[],
                x: fm,
                y: waterfallTrace.values,
                text: waterfallTrace.texts,
                textposition: 'outside',
                textfont: { color: '#9ca3af', size: 10 },
                decreasing: { marker: { color: '#ef4444', opacity: 0.85 } },
                increasing: { marker: { color: '#10b981', opacity: 0.85 } },
                totals: { marker: { color: '#3b82f6', opacity: 0.85 } },
                hovertemplate: '%{x}<br>Change: ₹%{y:,.0f}<extra></extra>',
              } as any]}
              layout={{
                ...PLOTLY_BASE,
                showlegend: false,
                xaxis: { ...PLOTLY_AXES },
                yaxis: { ...PLOTLY_AXES, title: { text: 'Revenue Change (₹)' }, tickformat: ',.0f' },
                margin: { l: 70, r: 16, t: 32, b: 60 },
                height: 300,
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: '100%' }}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
              Need at least 2 months for a waterfall chart
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Month Comparison Heatmap Table ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Month Comparison Heatmap</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Revenue per store per month · red = low · green = high · sorted by total revenue
            </p>
          </div>
          <span className="shrink-0 text-xs text-gray-600">{tableData.rows.length} stores</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th
                  className="sticky left-0 z-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400 whitespace-nowrap min-w-[180px]"
                  style={{ backgroundColor: '#111827' }}
                >
                  Store
                </th>
                {fm.map(m => (
                  <th
                    key={m}
                    className="px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-gray-400 whitespace-nowrap min-w-[76px]"
                  >
                    {m}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-400 whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {tableSlice.map(({ store, values, total }) => (
                <tr
                  key={store.store_id}
                  className="border-b border-gray-800/40 hover:brightness-110 transition-all"
                >
                  <td
                    className="sticky left-0 z-10 px-3 py-2 whitespace-nowrap"
                    style={{ backgroundColor: '#111827' }}
                  >
                    <div
                      className="text-gray-200 font-medium truncate max-w-[170px]"
                      title={store.store_name ?? store.store_id}
                    >
                      {store.store_name ?? store.store_id}
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5">
                      {store.state ?? ''}{store.category ? ` · ${store.category}` : ''}
                    </div>
                  </td>
                  {values.map((v, i) => (
                    <td
                      key={fm[i]}
                      className="px-2 py-2 text-center tabular-nums font-medium transition-colors"
                      style={{
                        backgroundColor: cellBg(v, tableData.min, tableData.max),
                        color: cellTextColor(v, tableData.min, tableData.max),
                      }}
                    >
                      {fmtInr(v)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-300 whitespace-nowrap">
                    {fmtInr(total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-800 px-4 py-2.5">
            <span className="text-xs text-gray-500">
              Showing {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, tableData.rows.length)} of {tableData.rows.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTablePage(p => Math.max(0, p - 1))}
                disabled={tablePage === 0}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-gray-500 px-1.5">{tablePage + 1} / {totalPages}</span>
              <button
                onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                disabled={tablePage === totalPages - 1}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>

    </div>
  )
}
