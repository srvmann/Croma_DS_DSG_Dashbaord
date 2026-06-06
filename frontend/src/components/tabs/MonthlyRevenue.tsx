import { useMemo } from 'react'
import { motion } from 'framer-motion'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Light-mode Plotly theme (mirrors ExecutiveOverview) ───────────────────────
const PT = { font: '#6b7280', grid: '#e5e7eb', line: '#d1d5db' }

// ── Box-plot colour palette ───────────────────────────────────────────────────
const STATE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899',
  '#14b8a6', '#a855f7', '#f43f5e', '#22d3ee',
]

// ── Animation variants (identical to ExecutiveOverview) ───────────────────────
const panelSpring = (delay = 0) => ({
  initial:    { opacity: 0, y: 28 },
  animate:    { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function MonthlyRevenue({ filters }: Props) {
  const { stores, months } = useDataContext()

  // ── Filter ─────────────────────────────────────────────────────────────────
  const { fs, fm } = useMemo(() => {
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

    return { fs, fm }
  }, [stores, months, filters])

  const { early, recent } = useMemo(() => halve(fm), [fm])

  // ── Per-month aggregates ───────────────────────────────────────────────────
  const monthlyData = useMemo(() => fm.map(m => {
    const rev    = fs.reduce((s, st) => s + (st.monthly_sales[m] ?? 0), 0)
    const active = fs.filter(st => (st.monthly_sales[m] ?? 0) > 0).length
    return { m, rev, active, isRecent: recent.includes(m) }
  }), [fs, fm, recent])

  // ── KPI metrics ────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!monthlyData.length) return null

    const totalRev   = monthlyData.reduce((s, d) => s + d.rev, 0)
    const sorted     = [...monthlyData].sort((a, b) => b.rev - a.rev)
    const peak       = sorted[0]
    const trough     = sorted[sorted.length - 1]

    const earlyRevs  = monthlyData.filter(d => !d.isRecent).map(d => d.rev)
    const recentRevs = monthlyData.filter(d =>  d.isRecent).map(d => d.rev)
    const avgEarly   = earlyRevs.length  ? earlyRevs.reduce((s, v)  => s + v, 0) / earlyRevs.length  : 0
    const avgRecent  = recentRevs.length ? recentRevs.reduce((s, v) => s + v, 0) / recentRevs.length : 0
    const runRatePct = avgEarly > 0 ? (avgRecent - avgEarly) / avgEarly * 100 : 0

    const avgActive    = monthlyData.reduce((s, d) => s + d.active, 0) / monthlyData.length
    const firstActive  = monthlyData[0].active
    const lastActive   = monthlyData[monthlyData.length - 1].active
    const footprintPct = firstActive > 0 ? (lastActive - firstActive) / firstActive * 100 : 0

    return {
      totalRev, peak, trough,
      avgEarly, avgRecent, runRatePct,
      avgActive, firstActive, lastActive, footprintPct,
    }
  }, [monthlyData])

  // ── Macro chart traces: bars (revenue) + line (active stores) ─────────────
  const macroTraces = useMemo(() => {
    const earlyData  = monthlyData.filter(d => !d.isRecent)
    const recentData = monthlyData.filter(d =>  d.isRecent)

    return [
      {
        type: 'bar' as const,
        name: 'Early revenue',
        x: earlyData.map(d => d.m),
        y: earlyData.map(d => d.rev),
        marker: { color: '#94a3b8' },
        yaxis: 'y',
        hovertemplate: '<b>%{x}</b><br>Revenue: ₹%{y:,.0f}<extra>Early</extra>',
      },
      {
        type: 'bar' as const,
        name: 'Recent revenue',
        x: recentData.map(d => d.m),
        y: recentData.map(d => d.rev),
        marker: { color: '#3b82f6' },
        yaxis: 'y',
        hovertemplate: '<b>%{x}</b><br>Revenue: ₹%{y:,.0f}<extra>Recent</extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: 'Active stores',
        x: monthlyData.map(d => d.m),
        y: monthlyData.map(d => d.active),
        yaxis: 'y2',
        line: { color: '#14b8a6', width: 2 },
        marker: { color: '#14b8a6', size: 5 },
        hovertemplate: '<b>%{x}</b><br>Active stores: %{y}<extra></extra>',
      },
    ]
  }, [monthlyData])

  // ── Box-plot traces ────────────────────────────────────────────────────────
  const boxTraces = useMemo(() =>
    fm.map((month, i) => ({
      type: 'box' as const,
      y: fs.map(s => s.monthly_sales[month] ?? 0),
      name: month,
      boxpoints: false as const,
      marker:    { color: STATE_PALETTE[i % STATE_PALETTE.length] },
      line:      { color: STATE_PALETTE[i % STATE_PALETTE.length], width: 1.5 },
      fillcolor: `${STATE_PALETTE[i % STATE_PALETTE.length]}28`,
      hovertemplate: `%{y:,.0f}<extra>${month}</extra>`,
    })),
  [fs, fm])

  // ── Shared light-mode Plotly axes ──────────────────────────────────────────
  const ptAxis = { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (fs.length === 0 || fm.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white min-h-96 flex items-center justify-center shadow-sm">
        <p className="text-gray-400 text-sm">No data for selected filters</p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Overall Monthly Revenue & Active Stores ── */}
      <motion.div {...panelSpring(0.12)} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Overall Monthly Revenue &amp; Active Stores</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Macro context — bars = revenue, line = active store count · blue marks the recent phase
            </p>
          </div>
          {kpis?.runRatePct != null && (
            <motion.span
              key={Math.round(kpis.runRatePct)}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={cn(
                'text-xs font-semibold px-2.5 py-1 rounded-full border',
                kpis.runRatePct >= 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200',
              )}
            >
              {fmtPct(kpis.runRatePct)} run-rate shift
            </motion.span>
          )}
        </div>

        <Plot
          data={macroTraces as any}
          layout={{
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor:  'rgba(0,0,0,0)',
            font:    { color: PT.font, family: 'Inter, sans-serif', size: 11 },
            barmode: 'overlay' as const,
            legend:  {
              bgcolor: 'rgba(0,0,0,0)',
              font: { color: PT.font, size: 10 },
              orientation: 'h' as const,
              y: -0.22,
            },
            xaxis:  { ...ptAxis },
            yaxis:  { ...ptAxis, title: { text: 'Revenue (₹)' }, tickformat: ',.2s' },
            yaxis2: {
              ...ptAxis,
              title: { text: 'Active Stores' },
              overlaying: 'y' as const,
              side: 'right' as const,
              showgrid: false,
            },
            margin: { l: 70, r: 70, t: 8, b: 110 },
            height: 400,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />

        {/* ── Insight cards ── */}
        {kpis && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
              What the macro trend says
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

              {/* Peak & Trough */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">
                  Peak &amp; Trough
                </p>
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  Revenue peaked in{' '}
                  <span className="text-gray-900 font-semibold">{kpis.peak.m}</span>{' '}
                  ({fmtInr(kpis.peak.rev)}); weakest month was{' '}
                  <span className="text-gray-900 font-semibold">{kpis.trough.m}</span>{' '}
                  ({fmtInr(kpis.trough.rev)}).
                </p>
              </div>

              {/* Run-Rate Shift */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">
                  Run-Rate Shift
                </p>
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  Recent-phase average is{' '}
                  <span className="text-gray-900 font-semibold">{fmtInr(kpis.avgRecent)}/mo</span>{' '}
                  vs{' '}
                  <span className="text-gray-900 font-semibold">{fmtInr(kpis.avgEarly)}/mo</span>{' '}
                  early — a {fmtPct(kpis.runRatePct)} change.
                </p>
              </div>

              {/* Active-Store Footprint */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5">
                  Active-Store Footprint
                </p>
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  Active stores moved from{' '}
                  <span className="text-gray-900 font-semibold">{kpis.firstActive.toLocaleString()}</span>{' '}
                  to{' '}
                  <span className="text-gray-900 font-semibold">{kpis.lastActive.toLocaleString()}</span>{' '}
                  across the timeline ({fmtPct(kpis.footprintPct)}).
                </p>
              </div>

            </div>
          </div>
        )}
      </motion.div>

      {/* ── Store Revenue Distribution ── */}
      <motion.div {...panelSpring(0.22)} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">Store Revenue Distribution</h3>
        <p className="text-[11px] text-gray-500 mt-0.5 mb-3">Spread of individual store revenues per month</p>
        <Plot
          data={boxTraces}
          layout={{
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor:  'rgba(0,0,0,0)',
            font:       { color: PT.font, family: 'Inter, sans-serif', size: 11 },
            showlegend: false,
            xaxis:  { ...ptAxis },
            yaxis:  { ...ptAxis, title: { text: 'Revenue (₹)' }, tickformat: ',.0f' },
            margin: { l: 70, r: 16, t: 8, b: 60 },
            height: 300,
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      </motion.div>

    </div>
  )
}
