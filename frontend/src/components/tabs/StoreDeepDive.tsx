import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Building2, Search } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Types ─────────────────────────────────────────────────────────────────────

type HealthTier     = 'Healthy' | 'Recovering' | 'Declining' | 'Dormant' | 'Underperforming'
type JourneyTag     = 'Surging' | 'Rising' | 'Stable' | 'Sliding' | 'Falling'
type ActivityStatus = 'Active' | 'Growing' | 'Declining' | 'Inactive'

// ── Light-mode Plotly tokens ──────────────────────────────────────────────────

const PT = { font: '#6b7280', grid: '#e5e7eb', line: '#d1d5db' }

// ── Animation variants ────────────────────────────────────────────────────────

const kpiContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
}
const kpiItem = {
  hidden: { opacity: 0, y: 12, scale: 0.95 },
  show:   { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 320, damping: 24 } },
}
const panelSpring = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 26, delay },
})

// ── Style maps ────────────────────────────────────────────────────────────────

const HEALTH_HEX: Record<HealthTier, string> = {
  Healthy:         '#10b981',
  Recovering:      '#0ea5e9',
  Declining:       '#f59e0b',
  Dormant:         '#f97316',
  Underperforming: '#ef4444',
}

const HEALTH_BADGE: Record<HealthTier, string> = {
  Healthy:         'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Recovering:      'bg-sky-50 text-sky-700 border border-sky-200',
  Declining:       'bg-amber-50 text-amber-700 border border-amber-200',
  Dormant:         'bg-orange-50 text-orange-700 border border-orange-200',
  Underperforming: 'bg-red-50 text-red-700 border border-red-200',
}

const HEALTH_LABEL: Record<HealthTier, string> = {
  Healthy:         'Green · Healthy. Strong, stable contributor — protect and learn from it.',
  Recovering:      'Recovering. Positive trajectory — monitor and support growth.',
  Declining:       'Declining. Revenue weakening — investigate root cause.',
  Dormant:         'Dormant. Minimal activity — assess viability.',
  Underperforming: 'Critical. Immediate intervention needed.',
}

const HEALTH_LABEL_COLOR: Record<HealthTier, string> = {
  Healthy:         'text-emerald-700',
  Recovering:      'text-sky-700',
  Declining:       'text-amber-700',
  Dormant:         'text-orange-700',
  Underperforming: 'text-red-700',
}

const JOURNEY_BADGE: Record<JourneyTag, string> = {
  Surging: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Rising:  'bg-blue-50 text-blue-700 border border-blue-200',
  Stable:  'bg-gray-50 text-gray-600 border border-gray-200',
  Sliding: 'bg-amber-50 text-amber-700 border border-amber-200',
  Falling: 'bg-red-50 text-red-700 border border-red-200',
}

const ACTIVITY_BADGE: Record<ActivityStatus, string> = {
  Active:   'text-emerald-600',
  Growing:  'text-sky-600',
  Declining:'text-red-500',
  Inactive: 'text-gray-400',
}
const ACTIVITY_DOT: Record<ActivityStatus, string> = {
  Active:   'bg-emerald-500',
  Growing:  'bg-sky-500',
  Declining:'bg-red-500',
  Inactive: 'bg-gray-300',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInr(n: number, compact = false): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (compact) {
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
    return `${sign}₹${abs.toFixed(0)}`
  }
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  return `${sign}₹${abs.toLocaleString('en-IN')}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function revForMonths(store: StoreRecord, ms: string[]): number {
  return ms.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function avgRev(store: StoreRecord, ms: string[]): number {
  return ms.length ? revForMonths(store, ms) / ms.length : 0
}

function rollingAvg(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const sl = values.slice(i - window + 1, i + 1)
    return sl.reduce((a, b) => a + b, 0) / window
  })
}

function pctileOf(rev: number, sorted: number[]): number {
  if (!sorted.length) return 0
  return (sorted.filter(r => r <= rev).length / sorted.length) * 100
}

function computeRank(storeRev: number, allRevs: number[]): number {
  return allRevs.filter(r => r > storeRev).length + 1
}

function journeyTag(g: number | null): JourneyTag {
  if (g === null) return 'Stable'
  if (g > 30)   return 'Surging'
  if (g > 10)   return 'Rising'
  if (g >= -5)  return 'Stable'
  if (g >= -20) return 'Sliding'
  return 'Falling'
}

function activityStatus(rev: number, mom: number | null): ActivityStatus {
  if (rev === 0)                        return 'Inactive'
  if (mom !== null && mom > 15)         return 'Growing'
  if (mom !== null && mom < -15)        return 'Declining'
  return 'Active'
}

function tier(score: number): HealthTier {
  if (score >= 70) return 'Healthy'
  if (score >= 50) return 'Recovering'
  if (score >= 30) return 'Declining'
  if (score >= 15) return 'Dormant'
  return 'Underperforming'
}

interface HealthScore { total: number; strength: number; consistency: number; growth: number; activity: number }

function computeHealthScore(
  store: StoreRecord,
  ms: string[],
  allStores: StoreRecord[],
): HealthScore {
  const revs = ms.map(m => store.monthly_sales[m] ?? 0)
  const n    = revs.length
  if (n === 0 || revs.every(v => v === 0)) return { total: 0, strength: 0, consistency: 0, growth: 0, activity: 0 }

  // Revenue Strength (0-100): revenue percentile among all stores
  const allTotals = allStores.map(s => revForMonths(s, ms)).sort((a, b) => a - b)
  const strength  = Math.round(pctileOf(revForMonths(store, ms), allTotals))

  // Consistency (0-100): 100 = zero volatility
  const mean = revs.reduce((a, b) => a + b, 0) / n
  const coV  = mean === 0 ? 1 : Math.sqrt(revs.reduce((s, v) => s + (v - mean) ** 2, 0) / n) / mean
  const consistency = Math.round(Math.max(0, 100 * (1 - Math.min(coV, 1))))

  // Growth (0-100): growth-% percentile among all stores
  const half = Math.max(1, Math.floor(n / 2))
  const earlyAvg  = revs.slice(0, half).reduce((a, b) => a + b, 0) / half
  const recentAvg = revs.slice(-half).reduce((a, b) => a + b, 0) / half
  const growthPct = earlyAvg === 0 ? null : (recentAvg - earlyAvg) / earlyAvg * 100

  const allGrowths = allStores.map(s => {
    const sRevs  = ms.map(m => s.monthly_sales[m] ?? 0)
    const sEarly = sRevs.slice(0, half).reduce((a, b) => a + b, 0) / half
    const sRecent = sRevs.slice(-half).reduce((a, b) => a + b, 0) / half
    return sEarly === 0 ? 0 : (sRecent - sEarly) / sEarly * 100
  }).sort((a, b) => a - b)
  const growth = Math.round(pctileOf(growthPct ?? 0, allGrowths))

  // Activity (0-100): active months ratio
  const activeMonths = revs.filter(v => v > 0).length
  const activity     = Math.round((activeMonths / n) * 100)

  // Weighted total
  const total = Math.round(0.40 * strength + 0.25 * consistency + 0.20 * growth + 0.15 * activity)
  return { total, strength, consistency, growth, activity }
}

// ── AnimatedNumber ────────────────────────────────────────────────────────────

function AnimatedNumber({ value, className, decimals = 0 }: { value: number; className?: string; decimals?: number }) {
  const mv      = useMotionValue(0)
  const display = useTransform(mv, (v: number) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()
  )
  useEffect(() => {
    const ctrl = animate(mv, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] })
    return () => ctrl.stop()
  }, [mv, value])
  return <motion.span className={className}>{display}</motion.span>
}

// ── Score Donut ───────────────────────────────────────────────────────────────

function ScoreDonut({ score, color, size = 110 }: { score: number; color: string; size?: number }) {
  const r             = 38
  const circumference = 2 * Math.PI * r
  const filled        = (score / 100) * circumference
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <circle cx={50} cy={50} r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
      <motion.circle
        cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth="9"
        strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circumference}`, strokeDashoffset: circumference * 0.25 }}
        animate={{ strokeDasharray: `${filled} ${circumference}`, strokeDashoffset: circumference * 0.25 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      <text x={50} y={44} textAnchor="middle" fill="#111827" fontSize="18"
        fontWeight="bold" fontFamily="Inter,sans-serif">{score.toFixed(1)}</text>
      <text x={50} y={57} textAnchor="middle" fill="#9ca3af" fontSize="8"
        fontFamily="Inter,sans-serif">/ 100</text>
    </svg>
  )
}

// ── Score Dimension Bar ───────────────────────────────────────────────────────

function ScoreDimBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-gray-600 w-44 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-8 text-right" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

// ── KPI Chip ──────────────────────────────────────────────────────────────────

function KPIChip({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <motion.div
      variants={kpiItem}
      className="flex flex-col gap-0.5 px-3 py-2 border border-gray-200 bg-white rounded-lg min-w-0 shrink-0 cursor-default"
      style={{ minWidth: 76 }}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400 whitespace-nowrap">{label}</span>
      <span className={cn('text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap', valueClass)}>{value}</span>
    </motion.div>
  )
}

// ── Store Selector ────────────────────────────────────────────────────────────

function StoreSelector({ stores, selectedId, selectedLabel, onSelect }: {
  stores: StoreRecord[]
  selectedId: string | null
  selectedLabel?: string
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref               = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return stores.slice(0, 80)
    return stores.filter(s =>
      (s.store_name ?? '').toLowerCase().includes(q) ||
      s.store_id.toLowerCase().includes(q) ||
      (s.state ?? '').toLowerCase().includes(q)
    ).slice(0, 80)
  }, [stores, query])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0) }, [open])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-lg border bg-white text-left transition-all shadow-sm',
          open ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-200 hover:border-gray-300',
        )}
      >
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="text-sm max-w-[220px] truncate">
          {selectedLabel
            ? <span className="text-gray-800 font-medium">{selectedLabel}</span>
            : <span className="text-gray-400">Type to filter…</span>}
        </span>
        <svg className="h-3.5 w-3.5 text-gray-400 shrink-0 ml-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 border border-gray-200">
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
                placeholder="Search name, ID or state…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0
              ? <div className="px-4 py-6 text-center text-sm text-gray-400">No stores found</div>
              : filtered.map(s => (
                <button key={s.store_id} type="button"
                  className={cn(
                    'w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors flex gap-3 items-center',
                    s.store_id === selectedId && 'bg-blue-50',
                  )}
                  onClick={() => { onSelect(s.store_id); setOpen(false); setQuery('') }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{s.store_name ?? s.store_id}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 flex gap-2">
                      <span>{s.store_id}</span>
                      {s.state && <span>· {s.state}</span>}
                      {s.category && <span>· {s.category}</span>}
                    </div>
                  </div>
                  {s.store_id === selectedId && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
                </button>
              ))}
          </div>
          <div className="px-4 py-1.5 border-t border-gray-100 text-[10px] text-gray-400">
            {filtered.length} of {stores.length} stores
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { filters: FilterState; initialStoreId?: string | null }

export default function StoreDeepDive({ filters, initialStoreId }: Props) {
  const { stores, months } = useDataContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // When navigated from another tab with a pre-selected store
  useEffect(() => {
    if (initialStoreId) setSelectedId(initialStoreId)
  }, [initialStoreId])

  const fm = useMemo(() => {
    let m = months
    if (filters.fromMonth) { const i = months.indexOf(filters.fromMonth); if (i >= 0) m = m.slice(i) }
    if (filters.toMonth)   { const i = months.indexOf(filters.toMonth);   if (i >= 0) m = m.slice(0, i + 1) }
    return m
  }, [months, filters])

  const selectedStore = useMemo(
    () => stores.find(s => s.store_id === selectedId) ?? null,
    [stores, selectedId],
  )

  const derived = useMemo(() => {
    if (!selectedStore || fm.length === 0) return null

    const n     = fm.length
    const third = Math.max(1, Math.floor(n / 3))
    const half  = Math.max(1, Math.floor(n / 2))

    const earlyMs   = fm.slice(0, third)
    const midMs     = fm.slice(third, third * 2)
    const recentMs  = fm.slice(-third)
    const earlyHalf  = fm.slice(0, half)
    const recentHalf = n % 2 === 0 ? fm.slice(half) : fm.slice(half + 1)

    const revByMonth   = fm.map(m => selectedStore.monthly_sales[m] ?? 0)
    const totalRev     = revByMonth.reduce((a, b) => a + b, 0)
    const avgMonthRev  = totalRev / n
    const activeMonths = revByMonth.filter(v => v > 0).length
    const rolling      = rollingAvg(revByMonth, 3)

    let maxIdx = 0, minIdx = 0
    revByMonth.forEach((v, i) => {
      if (v > revByMonth[maxIdx]) maxIdx = i
      if (v < revByMonth[minIdx]) minIdx = i
    })

    const earlyAvgVal  = avgRev(selectedStore, earlyHalf)
    const recentAvgVal = avgRev(selectedStore, recentHalf)
    const growthVal    = earlyAvgVal === 0 ? null : (recentAvgVal - earlyAvgVal) / earlyAvgVal * 100
    const tag          = journeyTag(growthVal)

    // Health score (all sub-scores on 0-100)
    const hs = computeHealthScore(selectedStore, fm, stores)
    const t  = tier(hs.total)

    // Rank at 3 phases
    const rankEarly  = computeRank(avgRev(selectedStore, earlyMs),  stores.map(s => avgRev(s, earlyMs)))
    const rankMid    = computeRank(avgRev(selectedStore, midMs),    stores.map(s => avgRev(s, midMs)))
    const rankRecent = computeRank(avgRev(selectedStore, recentMs), stores.map(s => avgRev(s, recentMs)))
    const rankImprovement = rankEarly - rankRecent

    // Network + state rank
    const allRevs     = stores.map(s => revForMonths(s, fm))
    const networkRank = computeRank(totalRev, allRevs)
    const stateStores = stores.filter(s => s.state === selectedStore.state)
    const stateRevs   = stateStores.map(s => revForMonths(s, fm))
    const stateRank   = computeRank(totalRev, stateRevs)

    // Month-by-month table
    const tableRows = fm.map((m, i) => {
      const rev  = selectedStore.monthly_sales[m] ?? 0
      const prev = i > 0 ? (selectedStore.monthly_sales[fm[i - 1]] ?? 0) : null
      const mom  = prev === null || prev === 0 ? null : (rev - prev) / prev * 100
      const mRevs   = stores.map(s => s.monthly_sales[m] ?? 0)
      const rank    = computeRank(rev, mRevs)
      const activity = activityStatus(rev, mom)
      return { month: m, rev, mom, rank, total: stores.length, activity }
    })

    // Waterfall
    const waterfallData = fm.map((m, i) => {
      const rev    = selectedStore.monthly_sales[m] ?? 0
      const prev   = i > 0 ? (selectedStore.monthly_sales[fm[i - 1]] ?? 0) : 0
      return { month: m, rev, change: i === 0 ? rev : rev - prev, isFirst: i === 0 }
    })

    // Label for selector button
    const selectorLabel = `${selectedStore.store_id} - ${fmtInr(totalRev, true)} ${tag}`

    return {
      revByMonth, rolling, maxIdx, minIdx, hs, t, growthVal, tag,
      totalRev, avgMonthRev, activeMonths,
      earlyAvgVal, recentAvgVal, earlyHalf, recentHalf,
      rankEarly, rankMid, rankRecent, rankImprovement,
      networkRank, stateRank, stateTotal: stateStores.length,
      tableRows, waterfallData, selectorLabel,
    }
  }, [selectedStore, stores, fm])

  const cardCls = 'rounded-xl border border-gray-200 bg-white shadow-sm'

  // ── Empty / not-selected state ────────────────────────────────────────────

  if (!selectedStore || !derived) {
    return (
      <div className="space-y-5">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between gap-4 flex-wrap"
        >
          <div>
            <h2 className="text-base font-bold text-gray-900">Store Journey — Deep Dive</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Full analytical profile, rank journey, root cause and recommended actions for the selected store
            </p>
          </div>
          <StoreSelector stores={stores} selectedId={null} onSelect={setSelectedId} />
        </motion.div>

        <div className={cn(cardCls, 'min-h-[440px] flex flex-col items-center justify-center gap-4 p-8')}>
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-400/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-blue-500" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-800">Select a Store</h3>
            <p className="mt-1 text-sm text-gray-400 max-w-xs">
              Search or select a store from the dropdown to explore its full revenue history,
              rank journey, health score, and recommended actions.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const {
    revByMonth, rolling, maxIdx, minIdx, hs, t, growthVal, tag,
    totalRev, avgMonthRev, activeMonths, earlyAvgVal, recentAvgVal,
    earlyHalf, recentHalf,
    rankEarly, rankMid, rankRecent, rankImprovement,
    networkRank, stateRank, stateTotal,
    tableRows, waterfallData, selectorLabel,
  } = derived

  const healthColor = HEALTH_HEX[t]

  // Bar colour gradient: recent months darker navy, older months gray-blue
  const barColors = fm.map((_, i) => {
    if (i === maxIdx) return '#10b981'
    if (i === minIdx && revByMonth[i] > 0) return '#ef4444'
    const recency = i / Math.max(fm.length - 1, 1)
    // interpolate from #94a3b8 (gray) → #1e3a5f (dark navy)
    const r = Math.round(148 - recency * (148 - 30))
    const g = Math.round(163 - recency * (163 - 58))
    const b = Math.round(184 - recency * (184 - 95))
    return `rgb(${r},${g},${b})`
  })

  // Peak / low annotations
  const annotations: object[] = []
  if (fm.length > 0) {
    annotations.push({
      x: fm[maxIdx], y: revByMonth[maxIdx],
      text: `Peak: ${fmtInr(revByMonth[maxIdx], true)}`,
      showarrow: true, arrowhead: 2, arrowsize: 0.8, arrowcolor: '#10b981',
      font: { color: '#10b981', size: 10 },
      bgcolor: 'rgba(16,185,129,0.08)', bordercolor: '#10b981', borderwidth: 1, borderpad: 3,
      ax: 0, ay: -38,
    })
    if (maxIdx !== minIdx && revByMonth[minIdx] > 0) {
      annotations.push({
        x: fm[minIdx], y: revByMonth[minIdx],
        text: `Low: ${fmtInr(revByMonth[minIdx], true)}`,
        showarrow: true, arrowhead: 2, arrowsize: 0.8, arrowcolor: '#ef4444',
        font: { color: '#ef4444', size: 10 },
        bgcolor: 'rgba(239,68,68,0.08)', bordercolor: '#ef4444', borderwidth: 1, borderpad: 3,
        ax: 0, ay: 38,
      })
    }
  }

  const revPattern = (() => {
    const nonZero = revByMonth.filter(v => v > 0)
    if (nonZero.length < 2) return 'Sparse data'
    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length
    const coV  = Math.sqrt(nonZero.reduce((s, v) => s + (v - mean) ** 2, 0) / nonZero.length) / mean
    return coV > 0.5 ? 'High volatility' : coV > 0.25 ? 'Moderate variance' : 'Consistent'
  })()

  return (
    <div className="space-y-4">

      {/* ── Page Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h2 className="text-base font-bold text-gray-900">Store Journey — Deep Dive</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Full analytical profile, rank journey, root cause and recommended actions for the selected store
          </p>
        </div>
        <StoreSelector
          stores={stores} selectedId={selectedId}
          selectedLabel={selectorLabel} onSelect={setSelectedId}
        />
      </motion.div>

      {/* ── KPI Chips Row 1 ── */}
      <motion.div
        key={`chips-${selectedId}`}
        variants={kpiContainer} initial="hidden" animate="show"
        className="flex gap-2 overflow-x-auto pb-0.5"
        style={{ scrollbarWidth: 'none' }}
      >
        <KPIChip label="Store ID"     value={selectedStore.store_id} />
        {selectedStore.state    && <KPIChip label="State"         value={selectedStore.state} />}
        {selectedStore.category && <KPIChip label="Item Category" value={selectedStore.category} />}
        {growthVal !== null && (
          <KPIChip
            label="Growth %"
            value={fmtPct(growthVal)}
            valueClass={growthVal >= 0 ? 'text-emerald-600' : 'text-red-600'}
          />
        )}
        <KPIChip label="Total Revenue" value={fmtInr(totalRev, true)} />
        <KPIChip
          label="Early Rev"
          value={fmtInr(earlyAvgVal * Math.max(1, earlyHalf.length), false)}
        />
        <KPIChip
          label="Recent Rev"
          value={fmtInr(recentAvgVal * Math.max(1, recentHalf.length), false)}
        />
        <KPIChip label="Months Active" value={`${activeMonths} / ${fm.length}`} />
        <KPIChip label="Network Rank"  value={`#${networkRank} / ${stores.length}`} />
      </motion.div>

      {/* ── KPI Chips Row 2 ── */}
      <motion.div
        key={`chips2-${selectedId}`}
        variants={kpiContainer} initial="hidden" animate="show"
        className="flex gap-2"
      >
        {selectedStore.state && (
          <KPIChip label="State Rank" value={`#${stateRank} / ${stateTotal}`} />
        )}
        {/* Status chip */}
        <motion.div
          variants={kpiItem}
          className="flex flex-col gap-1 px-3 py-2 border border-gray-200 bg-white rounded-lg cursor-default shrink-0"
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-gray-400">Status</span>
          <span className={cn('text-xs font-bold px-2.5 py-0.5 rounded-full self-start whitespace-nowrap', HEALTH_BADGE[t])}>
            {t}
          </span>
        </motion.div>
      </motion.div>

      {/* ── Row 1: Revenue Trend | Rank Journey ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Revenue Trend & Moving Average */}
        <motion.div {...panelSpring(0.08)} className={cn(cardCls, 'p-4')}>
          <h3 className="text-sm font-semibold text-gray-800">Revenue Trend & Moving Average</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            Monthly revenue with 3-month moving average · trend direction &amp; seasonality below
          </p>
          <Plot
            data={[
              {
                type: 'bar',
                name: 'Revenue',
                x: fm,
                y: revByMonth,
                marker: { color: barColors, opacity: 0.88 },
                hovertemplate: '<b>%{x}</b><br>Revenue: ₹%{y:,.0f}<extra></extra>',
              },
              {
                type: 'scatter',
                mode: 'lines+markers',
                name: '3-mo MA',
                x: fm.filter((_, i) => rolling[i] !== null),
                y: rolling.filter((v): v is number => v !== null),
                line: { color: '#f59e0b', width: 2.5, dash: 'dot' as const },
                marker: { color: '#f59e0b', size: 4 },
                hovertemplate: '<b>%{x}</b><br>3M Avg: ₹%{y:,.0f}<extra></extra>',
              },
            ]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font:   { color: PT.font, family: 'Inter, sans-serif', size: 11 },
              legend: {
                bgcolor: 'rgba(0,0,0,0)', font: { color: PT.font, size: 10 },
                orientation: 'h' as const, x: 0, y: -0.22,
              },
              xaxis: { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true },
              yaxis: { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true, tickformat: ',.0s', title: { text: '' } },
              hovermode: 'x unified' as const,
              margin: { l: 52, r: 12, t: 12, b: 80 },
              height: 270,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              annotations: annotations as any[],
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
          {/* Footer row */}
          <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500 flex-wrap">
            <span>Trend: <span className={cn('font-semibold',
              growthVal !== null && growthVal >= 0 ? 'text-emerald-600' : 'text-red-500')}>
              {growthVal !== null ? (growthVal >= 0 ? '↑ Upward' : '↓ Downward') : 'N/A'}
            </span></span>
            <span>Pattern: <span className="font-medium text-gray-600">{revPattern}</span></span>
            <span>Peak: <span className="font-medium text-gray-700">{fm[maxIdx]}</span></span>
          </div>
        </motion.div>

        {/* Rank Journey */}
        <motion.div {...panelSpring(0.13)} className={cn(cardCls, 'p-4')}>
          <h3 className="text-sm font-semibold text-gray-800">Rank Journey — Early → Mid → Recent</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            Lower is better · how the store's network rank moved across phases
            {rankImprovement > 0 && (
              <span className="ml-2 font-semibold text-emerald-600">
                ▲ improved {rankImprovement} positions
              </span>
            )}
            {rankImprovement < 0 && (
              <span className="ml-2 font-semibold text-red-500">
                ▼ dropped {Math.abs(rankImprovement)} positions
              </span>
            )}
          </p>
          <Plot
            data={[{
              type: 'scatter',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              mode: 'lines+markers+text' as any,
              x: ['Early', 'Mid', 'Recent'],
              y: [rankEarly, rankMid, rankRecent],
              text: [`#${rankEarly}`, `#${rankMid}`, `#${rankRecent}`],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              textposition: ['top center', 'top center', 'bottom center'] as any,
              textfont: { color: '#374151', size: 11, family: 'Inter, sans-serif' },
              line: { color: '#10b981', width: 3 },
              marker: {
                color: ['#3b82f6', '#8b5cf6', '#10b981'],
                size: 13,
                line: { color: '#ffffff', width: 2.5 },
              },
              hovertemplate: '<b>%{x}</b><br>Rank #%{y}<extra></extra>',
            }]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font:   { color: PT.font, family: 'Inter, sans-serif', size: 11 },
              xaxis:  { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true },
              yaxis:  {
                gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true,
                autorange: 'reversed' as const,
                title: { text: 'Network Rank (lower = better)' },
              },
              showlegend: false,
              margin: { l: 70, r: 32, t: 24, b: 50 },
              height: 270,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>
      </div>

      {/* ── Row 2: Health Score | Waterfall ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

        {/* Store Health Score */}
        <motion.div {...panelSpring(0.18)} className={cn(cardCls, 'p-5 lg:col-span-2')}>
          <h3 className="text-sm font-semibold text-gray-800">Store Health Score</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-4">
            40% revenue · 25% consistency · 20% growth · 15% activity
          </p>

          <div className="flex items-center gap-5">
            <ScoreDonut score={hs.total} color={healthColor} size={100} />
            <div className="flex-1 space-y-3.5">
              <ScoreDimBar label="Revenue Strength (40%)" value={hs.strength}    color="#3b82f6" />
              <ScoreDimBar label="Consistency (25%)"      value={hs.consistency} color="#6366f1" />
              <ScoreDimBar label="Growth (20%)"           value={hs.growth}      color="#10b981" />
              <ScoreDimBar label="Activity (15%)"         value={hs.activity}    color="#f59e0b" />
            </div>
          </div>

          <p className={cn('mt-4 text-[11px] font-medium', HEALTH_LABEL_COLOR[t])}>
            {HEALTH_LABEL[t]}
          </p>
        </motion.div>

        {/* Revenue Journey Waterfall */}
        <motion.div {...panelSpring(0.23)} className={cn(cardCls, 'p-4 lg:col-span-3')}>
          <h3 className="text-sm font-semibold text-gray-800">Revenue Journey Waterfall</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            How the store moved from early baseline to recent revenue, month by month
          </p>
          <Plot
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={[{
              type:        'waterfall',
              orientation: 'v',
              x:           waterfallData.map(d => d.month),
              y:           waterfallData.map(d => d.change),
              measure:     waterfallData.map((_, i) => i === 0 ? 'absolute' : 'relative'),
              connector:   { line: { color: '#e5e7eb', width: 1 } },
              increasing:  { marker: { color: '#10b981', opacity: 0.85 } },
              decreasing:  { marker: { color: '#ef4444', opacity: 0.85 } },
              totals:      { marker: { color: '#3b82f6', opacity: 0.85 } },
              texttemplate: '%{y:+,.0s}',
              textfont:    { size: 9, color: '#374151' },
              hovertemplate: '<b>%{x}</b><br>₹%{y:+,.0f}<extra></extra>',
            } as any]}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font:   { color: PT.font, family: 'Inter, sans-serif', size: 11 },
              xaxis:  { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true },
              yaxis:  { gridcolor: PT.grid, linecolor: PT.line, tickcolor: PT.line, automargin: true, tickformat: ',.0s' },
              showlegend: false,
              margin: { l: 52, r: 12, t: 12, b: 80 },
              height: 320,
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>
      </div>

      {/* ── Store Journey Timeline ── */}
      <motion.div {...panelSpring(0.28)} className={cn(cardCls, 'overflow-hidden')}>
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Store Journey Timeline</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Month-wise revenue, MoM growth, network rank and activity status
          </p>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: '#1e293b' }}>
                <th className="px-5 py-2.5 text-left text-xs font-semibold tracking-wider text-amber-400 whitespace-nowrap">Month</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold tracking-wider text-gray-300 whitespace-nowrap">Revenue</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold tracking-wider text-gray-300 whitespace-nowrap">MoM %</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold tracking-wider text-gray-300 whitespace-nowrap">Network Rank</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold tracking-wider text-gray-300 whitespace-nowrap">Activity</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(row => (
                <tr key={row.month} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-2.5 text-gray-700 font-semibold whitespace-nowrap">{row.month}</td>
                  <td className="px-5 py-2.5 text-gray-800 tabular-nums whitespace-nowrap">
                    {row.rev > 0 ? fmtInr(row.rev, false) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={cn(
                    'px-5 py-2.5 tabular-nums text-sm font-semibold whitespace-nowrap',
                    row.mom === null ? 'text-gray-300'
                      : row.mom >= 0 ? 'text-emerald-600' : 'text-red-500',
                  )}>
                    {row.mom === null ? '—' : fmtPct(row.mom)}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    {row.rev > 0 ? (
                      <span className="text-sm text-gray-600 tabular-nums">
                        #{row.rank} / {row.total}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap',
                      ACTIVITY_BADGE[row.activity],
                    )}>
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', ACTIVITY_DOT[row.activity])} />
                      {row.activity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Avg footer */}
        <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-6 text-[11px] text-gray-500">
          <span>Avg / Month: <span className="font-semibold text-gray-700">{fmtInr(avgMonthRev, false)}</span></span>
          <span>Active months: <span className="font-semibold text-gray-700">{activeMonths} / {fm.length}</span></span>
        </div>
      </motion.div>

    </div>
  )
}
