import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity, AlertCircle, BarChart2,
  Calendar, Minus, Target,
  TrendingDown, TrendingUp, Zap,
} from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_DAYS = 31

const PLOTLY_AXES = {
  gridcolor: '#1f2937',
  linecolor: '#374151',
  tickcolor: '#374151',
  automargin: true,
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInr(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}

function fmtPct(n: number, decimals = 1): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon: React.ReactNode
  accent?: string
  delay?: number
}

function KPICard({ label, value, sub, valueClass, icon, accent, delay = 0 }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn(
        'rounded-xl border bg-gray-900 p-4 flex flex-col gap-1 min-w-0',
        accent ?? 'border-gray-800',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-gray-500 truncate">
          {label}
        </p>
        <span className="shrink-0 text-gray-600">{icon}</span>
      </div>
      <p className={cn('text-2xl font-bold text-white tabular-nums truncate', valueClass)}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-500 truncate">{sub}</p>}
    </motion.div>
  )
}

// ── No-targets upload prompt ───────────────────────────────────────────────────

function NoTargetsPrompt() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 min-h-[420px] flex flex-col items-center justify-center gap-5 p-10"
    >
      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-400/15 flex items-center justify-center">
        <Target className="h-7 w-7 text-amber-400" />
      </div>
      <div className="text-center max-w-sm">
        <h3 className="text-lg font-semibold text-gray-100">No Targets Loaded</h3>
        <p className="mt-2 text-sm text-gray-400 leading-relaxed">
          Upload a <span className="font-mono text-amber-400 text-xs px-1.5 py-0.5 rounded bg-amber-500/10">targets.xlsx</span> file
          to unlock the Target Command Center. The file should contain{' '}
          <span className="text-gray-300">Store_ID</span> and{' '}
          <span className="text-gray-300">Monthly_Target</span> columns.
        </p>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-xs text-gray-400">
          Go back to the upload screen via the <span className="text-gray-200 font-medium">Reset Data</span> button in the header.
        </span>
      </div>
    </motion.div>
  )
}

// ── Day-of-month slider ───────────────────────────────────────────────────────

function DaySlider({
  value, onChange, targetMonth,
}: { value: number; onChange: (v: number) => void; targetMonth: string }) {
  const pct = ((value - 1) / (TOTAL_DAYS - 1)) * 100

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4"
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-200">
              Day of Month Simulator
            </p>
            <p className="text-[11px] text-gray-500">
              Tracking: <span className="text-gray-300 font-medium">{targetMonth}</span>
              {' '}· Projections update live
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-1 min-w-[280px]">
          <span className="text-xs text-gray-500 shrink-0 w-14">Day 1</span>
          <div className="relative flex-1">
            <input
              type="range"
              min={1}
              max={TOTAL_DAYS}
              value={value}
              onChange={e => onChange(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-800"
              style={{
                background: `linear-gradient(to right, #3b82f6 ${pct}%, #1f2937 ${pct}%)`,
              }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0 w-14 text-right">Day {TOTAL_DAYS}</span>

          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="text-xs text-gray-500">Day</span>
            <span className="text-lg font-bold text-blue-400 tabular-nums w-6 text-center">
              {value}
            </span>
            <span className="text-xs text-gray-600">/ {TOTAL_DAYS}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function TargetCommandCenter({ filters }: Props) {
  const { stores, months, hasTargets } = useDataContext()
  const [dayOfMonth, setDayOfMonth] = useState(15)

  // Respect month-range filters
  const fm = useMemo(() => {
    let m = months
    if (filters.fromMonth) {
      const i = months.indexOf(filters.fromMonth)
      if (i >= 0) m = m.slice(i)
    }
    if (filters.toMonth) {
      const i = months.indexOf(filters.toMonth)
      if (i >= 0) m = m.slice(0, i + 1)
    }
    return m
  }, [months, filters])

  // Target month = latest in the filtered window (targets are monthly)
  const targetMonth = fm[fm.length - 1] ?? months[months.length - 1] ?? ''

  // Filter stores and require a target value
  const filteredStores = useMemo(() => {
    let fs = stores
    if (filters.state) fs = fs.filter(s => s.state === filters.state)
    if (filters.category) fs = fs.filter(s => s.category === filters.category)
    return fs.filter(s => s.target != null && (s.target as number) > 0)
  }, [stores, filters])

  // Per-store calculations driven by dayOfMonth
  const storeCalcs = useMemo(() => {
    const elapsed = Math.max(1, dayOfMonth)
    const remaining = Math.max(0, TOTAL_DAYS - elapsed)
    return filteredStores.map(s => {
      const target      = s.target as number
      const currentSales = s.monthly_sales[targetMonth] ?? 0
      const achPct      = target > 0 ? (currentSales / target) * 100 : 0
      const expectedPct = (elapsed / TOTAL_DAYS) * 100
      const gap         = target - currentSales
      const projected   = (currentSales / elapsed) * TOTAL_DAYS
      const reqDRR      = remaining > 0 && gap > 0 ? gap / remaining : 0
      const expectedSales = target * (elapsed / TOTAL_DAYS)
      return {
        store: s, target, currentSales,
        achPct, expectedPct, gap,
        projected, reqDRR, expectedSales,
      }
    })
  }, [filteredStores, targetMonth, dayOfMonth])

  // National-level roll-up
  const national = useMemo(() => {
    const elapsed     = Math.max(1, dayOfMonth)
    const remaining   = Math.max(0, TOTAL_DAYS - elapsed)
    const totalTarget = storeCalcs.reduce((s, d) => s + d.target, 0)
    const totalSales  = storeCalcs.reduce((s, d) => s + d.currentSales, 0)
    const achPct      = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0
    const expectedPct = (elapsed / TOTAL_DAYS) * 100
    const gap         = totalTarget - totalSales
    const projected   = (totalSales / elapsed) * TOTAL_DAYS
    const reqDRR      = remaining > 0 && gap > 0 ? gap / remaining : 0
    const remaining_target = Math.max(0, gap)
    return {
      totalTarget, totalSales, achPct, expectedPct,
      gap, projected, reqDRR, remaining_target,
      elapsed, remaining,
    }
  }, [storeCalcs, dayOfMonth])

  // ── Gauge trace ───────────────────────────────────────────────────────────

  const gaugeTrace = useMemo(() => ({
    type: 'indicator' as const,
    mode: 'gauge+number+delta' as const,
    value: national.achPct,
    number: {
      suffix: '%',
      font: { size: 32, color: '#e5e7eb' },
      valueformat: '.1f',
    },
    delta: {
      reference: national.expectedPct,
      relative: false,
      valueformat: '.1f',
      suffix: 'pp vs pace',
      increasing: { symbol: '▲', color: '#10b981' },
      decreasing: { symbol: '▼', color: '#ef4444' },
    },
    gauge: {
      axis: {
        range: [0, 150],
        tickwidth: 1,
        tickcolor: '#374151',
        tickfont: { color: '#6b7280', size: 10 },
        dtick: 25,
      },
      bar: {
        color: national.achPct >= 95 ? '#10b981'
          : national.achPct >= 80 ? '#f59e0b'
            : '#ef4444',
        thickness: 0.72,
      },
      bgcolor: 'rgba(0,0,0,0)',
      borderwidth: 0,
      steps: [
        { range: [0, 80],   color: 'rgba(239,68,68,0.08)'  },
        { range: [80, 95],  color: 'rgba(245,158,11,0.08)' },
        { range: [95, 150], color: 'rgba(16,185,129,0.08)' },
      ],
      threshold: {
        line: { color: '#ffffff40', width: 2 },
        thickness: 0.85,
        value: 100,
      },
    },
  }), [national.achPct, national.expectedPct])

  // ── Ideal vs Actual Pace traces ───────────────────────────────────────────

  const paceTraces = useMemo(() => {
    const elapsed = national.elapsed
    const days    = Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1)

    // Ideal: straight line 0 → totalTarget
    const idealY = days.map(d => national.totalTarget * (d / TOTAL_DAYS))

    // Actual to date: linear interpolation from 0 to totalSales across elapsed days
    const actualDays = days.filter(d => d <= elapsed)
    const actualY    = actualDays.map(d =>
      elapsed > 0 ? (national.totalSales / elapsed) * d : 0,
    )

    // Projected from dayOfMonth → 31 (dashed extension of current pace)
    const projDays = days.filter(d => d >= elapsed)
    const projY    = projDays.map(d =>
      elapsed > 0 ? (national.totalSales / elapsed) * d : 0,
    )

    return [
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Ideal Pace',
        x: days,
        y: idealY,
        line: { color: '#6b7280', width: 2, dash: 'dot' as const },
        hovertemplate: 'Day %{x}<br>Ideal: ₹%{y:,.0f}<extra>Ideal Pace</extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines+markers' as const,
        name: 'Actual to Date',
        x: actualDays,
        y: actualY,
        line: {
          color: national.achPct >= national.expectedPct ? '#10b981' : '#ef4444',
          width: 2.5,
        },
        marker: { size: 4 },
        hovertemplate: 'Day %{x}<br>Actual: ₹%{y:,.0f}<extra>Actual</extra>',
      },
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Projected',
        x: projDays,
        y: projY,
        line: {
          color: national.achPct >= national.expectedPct ? '#10b98180' : '#ef444480',
          width: 2,
          dash: 'dash' as const,
        },
        hovertemplate: 'Day %{x}<br>Projected: ₹%{y:,.0f}<extra>Projected</extra>',
      },
      // target ceiling
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'Monthly Target',
        x: [1, TOTAL_DAYS],
        y: [national.totalTarget, national.totalTarget],
        line: { color: '#f59e0b50', width: 1.5, dash: 'longdash' as const },
        hovertemplate: 'Target: ₹%{y:,.0f}<extra>Target</extra>',
      },
    ]
  }, [national])

  // ── Daily Pace Matrix traces (bubble scatter) ─────────────────────────────

  const bubbleTraces = useMemo(() => {
    if (storeCalcs.length === 0) return []

    const maxTarget = Math.max(...storeCalcs.map(d => d.target), 1)
    const minTarget = Math.min(...storeCalcs.map(d => d.target), 1)
    const sizeRange = maxTarget - minTarget || 1
    const bubbleSize = (t: number) => 10 + ((t - minTarget) / sizeRange) * 36

    const above = storeCalcs.filter(d => d.currentSales >= d.expectedSales)
    const below = storeCalcs.filter(d => d.currentSales < d.expectedSales)

    const makeTrace = (data: typeof storeCalcs, color: string, name: string) => ({
      type: 'scatter' as const,
      mode: 'markers' as const,
      name,
      x: data.map(d => d.expectedSales),
      y: data.map(d => d.currentSales),
      marker: {
        size: data.map(d => bubbleSize(d.target)),
        color,
        opacity: 0.72,
        line: { color: '#111827', width: 1 },
      },
      text: data.map(d => d.store.store_name ?? d.store.store_id),
      customdata: data.map(d => [
        d.store.store_name ?? d.store.store_id,
        d.store.store_id,
        d.target,
        d.currentSales,
        d.achPct,
        d.expectedPct,
        d.gap,
      ]),
      hovertemplate:
        '<b>%{customdata[0]}</b> (%{customdata[1]})<br>' +
        'Target: ₹%{customdata[2]:,.0f}<br>' +
        'Current Sales: ₹%{customdata[3]:,.0f}<br>' +
        'Achievement: %{customdata[4]:.1f}%<br>' +
        'Expected: %{customdata[5]:.1f}%<br>' +
        'Gap: ₹%{customdata[6]:,.0f}' +
        '<extra></extra>',
    })

    const maxVal = Math.max(
      ...storeCalcs.map(d => Math.max(d.expectedSales, d.currentSales)),
      1,
    ) * 1.12

    return [
      // reference diagonal Y=X
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: 'On Pace (Y = X)',
        x: [0, maxVal],
        y: [0, maxVal],
        line: { color: '#374151', width: 1.5, dash: 'dash' as const },
        hoverinfo: 'skip' as const,
        showlegend: true,
      },
      makeTrace(above, '#10b981', 'Ahead of Pace'),
      makeTrace(below, '#ef4444', 'Behind Pace'),
    ]
  }, [storeCalcs])

  // ── Gate on hasTargets ────────────────────────────────────────────────────

  if (!hasTargets) return <NoTargetsPrompt />

  if (filteredStores.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 min-h-72 flex items-center justify-center">
        <p className="text-sm text-gray-500">No stores with targets match the current filters.</p>
      </div>
    )
  }

  const achClass = national.achPct >= 95 ? 'text-emerald-400'
    : national.achPct >= 80 ? 'text-amber-400'
      : 'text-red-400'

  const gapPositive = national.gap > 0  // still need to sell more

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Day of Month Slider ── */}
      <DaySlider
        value={dayOfMonth}
        onChange={setDayOfMonth}
        targetMonth={targetMonth}
      />

      {/* ── ROW 1: KPI Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <KPICard
          label="Monthly Target"
          value={fmtInr(national.totalTarget)}
          sub={`${filteredStores.length} stores`}
          icon={<Target className="h-4 w-4" />}
          delay={0}
        />
        <KPICard
          label="Achieved Sales"
          value={fmtInr(national.totalSales)}
          sub={`Day ${dayOfMonth} of ${TOTAL_DAYS}`}
          icon={<BarChart2 className="h-4 w-4 text-blue-400" />}
          delay={0.04}
        />
        <KPICard
          label="Achievement %"
          value={`${national.achPct.toFixed(1)}%`}
          sub={`Expected ${national.expectedPct.toFixed(1)}%`}
          valueClass={achClass}
          icon={national.achPct >= national.expectedPct
            ? <TrendingUp className="h-4 w-4 text-emerald-400" />
            : <TrendingDown className="h-4 w-4 text-red-400" />}
          accent={national.achPct >= 95 ? 'border-emerald-800/40'
            : national.achPct >= 80 ? 'border-amber-800/40'
              : 'border-red-900/40'}
          delay={0.08}
        />
        <KPICard
          label="Gap to Target"
          value={gapPositive ? fmtInr(national.gap) : '✓ Exceeded'}
          sub={gapPositive ? 'still to be sold' : `by ${fmtInr(-national.gap)}`}
          valueClass={gapPositive ? 'text-red-400' : 'text-emerald-400'}
          icon={gapPositive
            ? <AlertCircle className="h-4 w-4 text-red-400" />
            : <TrendingUp className="h-4 w-4 text-emerald-400" />}
          delay={0.12}
        />
        <KPICard
          label="Remaining Target"
          value={national.remaining_target > 0 ? fmtInr(national.remaining_target) : '—'}
          sub={`${national.remaining} days left`}
          valueClass={national.remaining_target > 0 ? 'text-amber-400' : 'text-gray-400'}
          icon={<Minus className="h-4 w-4 text-amber-400" />}
          delay={0.16}
        />
        <KPICard
          label="Req. Daily Run Rate"
          value={national.reqDRR > 0 ? fmtInr(national.reqDRR) : '—'}
          sub="per day to close gap"
          valueClass={national.reqDRR > 0 ? 'text-amber-400' : 'text-gray-400'}
          icon={<Zap className="h-4 w-4 text-amber-400" />}
          delay={0.20}
        />
        <KPICard
          label="Projected Month-End"
          value={fmtInr(national.projected)}
          sub={`${fmtPct((national.projected / national.totalTarget - 1) * 100)} vs target`}
          valueClass={national.projected >= national.totalTarget ? 'text-emerald-400' : 'text-red-400'}
          icon={<Activity className="h-4 w-4" />}
          delay={0.24}
        />
      </div>

      {/* ── ROW 2: Gauge + Ideal vs Actual Pace ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

        {/* Gauge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-0.5 text-sm font-semibold text-gray-200">National Achievement</h3>
          <p className="mb-2 text-[11px] text-gray-500">
            Overall target attainment ·
            <span className="text-red-400"> &lt;80%</span>
            <span className="text-gray-600"> · </span>
            <span className="text-amber-400">80–95%</span>
            <span className="text-gray-600"> · </span>
            <span className="text-emerald-400">&gt;95%</span>
          </p>
          <Plot
            data={[gaugeTrace]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
              margin: { l: 24, r: 24, t: 16, b: 8 },
              height: 260,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />

          {/* Zone legend */}
          <div className="flex justify-center gap-4 mt-1">
            {[
              { label: 'Behind < 80%', cls: 'text-red-400' },
              { label: 'On Track 80–95%', cls: 'text-amber-400' },
              { label: 'Exceeding > 95%', cls: 'text-emerald-400' },
            ].map(z => (
              <span key={z.label} className={cn('text-[10px] font-medium', z.cls)}>
                {z.label}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Ideal vs Actual Pace */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-3 rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Ideal vs Actual Pace</h3>
          <p className="mb-3 text-[11px] text-gray-500">
            Cumulative revenue vs ideal linear pace · Dashed = projected month-end trajectory
          </p>
          <Plot
            data={paceTraces}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#9ca3af', size: 10 },
                orientation: 'h' as const,
                y: -0.22,
              },
              xaxis: {
                ...PLOTLY_AXES,
                title: { text: 'Day of Month' },
                dtick: 5,
                range: [0, TOTAL_DAYS + 0.5],
              },
              yaxis: {
                ...PLOTLY_AXES,
                tickformat: ',.0s',
                title: { text: 'Cumulative Revenue (₹)' },
              },
              hovermode: 'x unified' as const,
              margin: { l: 70, r: 16, t: 8, b: 90 },
              height: 300,
              // vertical marker for current day
              shapes: [{
                type: 'line' as const,
                x0: dayOfMonth, x1: dayOfMonth,
                y0: 0, y1: 1,
                xref: 'x' as const, yref: 'paper' as const,
                line: { color: '#3b82f640', width: 1.5, dash: 'dot' as const },
              }],
              annotations: [{
                x: dayOfMonth,
                y: 1,
                xref: 'x' as const,
                yref: 'paper' as const,
                text: `Day ${dayOfMonth}`,
                showarrow: false,
                font: { color: '#3b82f6', size: 10 },
                yanchor: 'bottom' as const,
              }],
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>
      </div>

      {/* ── ROW 3: Daily Pace Matrix ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <h3 className="mb-0.5 text-sm font-semibold text-gray-200">Daily Pace Matrix</h3>
        <p className="mb-3 text-[11px] text-gray-500">
          Each bubble = 1 store · Size = monthly target · X = expected sales at Day {dayOfMonth} ·
          Y = actual sales · Diagonal = on-pace reference ·
          <span className="text-emerald-400"> Green</span> = ahead,
          <span className="text-red-400"> Red</span> = behind
        </p>

        {storeCalcs.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-600 text-sm">
            No data for selected filters
          </div>
        ) : (
          <Plot
            data={bubbleTraces}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#9ca3af', size: 10 },
                orientation: 'h' as const,
                y: -0.18,
              },
              xaxis: {
                ...PLOTLY_AXES,
                title: { text: `Expected Sales at Day ${dayOfMonth} (₹)` },
                tickformat: ',.0s',
              },
              yaxis: {
                ...PLOTLY_AXES,
                title: { text: 'Actual Sales (₹)' },
                tickformat: ',.0s',
              },
              hovermode: 'closest' as const,
              margin: { l: 70, r: 20, t: 16, b: 90 },
              height: 420,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        )}

        {/* Summary strip below chart */}
        <div className="mt-3 flex flex-wrap gap-4 px-1">
          {[
            {
              label: 'Stores Ahead of Pace',
              value: storeCalcs.filter(d => d.currentSales >= d.expectedSales).length,
              cls: 'text-emerald-400',
            },
            {
              label: 'Stores Behind Pace',
              value: storeCalcs.filter(d => d.currentSales < d.expectedSales).length,
              cls: 'text-red-400',
            },
            {
              label: 'Avg Achievement',
              value: `${(storeCalcs.reduce((s, d) => s + d.achPct, 0) / storeCalcs.length).toFixed(1)}%`,
              cls: achClass,
            },
            {
              label: 'Expected Pace',
              value: `${national.expectedPct.toFixed(1)}%`,
              cls: 'text-gray-400',
            },
          ].map(({ label, value, cls }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">{label}</span>
              <span className={cn('text-sm font-bold tabular-nums', cls)}>{value}</span>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  )
}
