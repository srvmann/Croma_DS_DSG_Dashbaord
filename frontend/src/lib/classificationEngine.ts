import type { StoreRecord } from './api'
import { CLASSIFICATION_CONFIG as C } from './classificationConfig'

// ── Public types ──────────────────────────────────────────────────────────────

export type StoreCategory =
  | 'New Bloomer'
  | 'Rising Star'
  | 'Growing Store'
  | 'Consistent Performer'
  | 'Declining Store'
  | 'Fallen Star'
  | 'Low Volume Store'

export const CATEGORY_ORDER: StoreCategory[] = [
  'New Bloomer',
  'Rising Star',
  'Growing Store',
  'Consistent Performer',
  'Declining Store',
  'Fallen Star',
  'Low Volume Store',
]

export interface PhaseInfo {
  earlyMonths:  string[]
  midMonths:    string[]
  recentMonths: string[]
}

// All revenue/policy fields are CUMULATIVE TOTALS (sum over the phase's months).
// In this dashboard, monthly_sales represents policies sold; totals serve as both
// the revenue and policies-sold metric for classification purposes.
export interface StoreMetrics {
  store:          StoreRecord
  earlyTotal:     number        // policies sold during early phase
  midTotal:       number        // policies sold during mid phase
  recentTotal:    number        // policies sold during recent phase
  totalRevenue:   number        // total policies sold across all months
  growthPct:      number | null // (recentTotal - earlyTotal) / earlyTotal × 100
  momentumPct:    number | null // (recentTotal - midTotal)   / midTotal   × 100
  trendScore:     number        // normalised linear slope (positive = upward)
  stabilityScore: number        // CoV as % — lower is more stable
  category:       StoreCategory
  earlyRank:      number        // 1 = highest earlyTotal in scope
  recentRank:     number        // 1 = highest recentTotal in scope
  overallRank:    number        // 1 = highest totalRevenue in scope
}

export interface ClassificationResult {
  phases:  PhaseInfo
  metrics: StoreMetrics[]
  counts:  Record<StoreCategory, number>
}

// ── Phase allocation ──────────────────────────────────────────────────────────
//
// Divides months into three equal phases, distributing any remainder:
//   remainder 0 → Early = base, Mid = base, Recent = base
//   remainder 1 → Recent += 1
//   remainder 2 → Early += 1, Recent += 1

export function allocatePhases(months: string[]): PhaseInfo {
  const total = months.length
  if (total === 0) return { earlyMonths: [], midMonths: [], recentMonths: [] }

  const base      = Math.floor(total / 3)
  const remainder = total % 3

  let earlyCount  = base
  const midCount  = base
  let recentCount = base

  if (remainder === 1) {
    recentCount += 1
  } else if (remainder === 2) {
    earlyCount  += 1
    recentCount += 1
  }

  return {
    earlyMonths:  months.slice(0, earlyCount),
    midMonths:    months.slice(earlyCount, earlyCount + midCount),
    recentMonths: months.slice(earlyCount + midCount),
  }
}

// ── Internal metric helpers ───────────────────────────────────────────────────

function phaseTotal(store: StoreRecord, phaseMonths: string[]): number {
  return phaseMonths.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function computeTrendScore(store: StoreRecord, months: string[]): number {
  const n = months.length
  if (n < 2) return 0
  const y    = months.map(m => store.monthly_sales[m] ?? 0)
  const x    = Array.from({ length: n }, (_, i) => i + 1)
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((s, xi, i) => s + xi * y[i], 0)
  const sumX2 = x.reduce((s, xi) => s + xi * xi, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0
  const slope = (n * sumXY - sumX * sumY) / denom
  const mean  = sumY / n
  return mean === 0 ? 0 : (slope / mean) * 100
}

function computeStabilityScore(store: StoreRecord, months: string[]): number {
  const n = months.length
  if (n < 2) return 0
  const vals = months.map(m => store.monthly_sales[m] ?? 0)
  const mean = vals.reduce((a, b) => a + b, 0) / n
  if (mean === 0) return 100
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  return (Math.sqrt(variance) / mean) * 100
}

// ── Classification rules (single source of truth) ────────────────────────────
// Priority order: New Bloomer → Rising Star → Growing Store → Consistent Performer
//                 → Declining Store → Fallen Star → Low Volume Store

function classifyStore(
  earlyTotal:  number,
  midTotal:    number,
  recentTotal: number,
  growthPct:   number | null,
): StoreCategory {
  // Priority 1: New Bloomer — little/no early or mid activity, now contributing
  if (
    (earlyTotal < C.NEW_BLOOMER_EARLY_CEILING || midTotal < C.NEW_BLOOMER_EARLY_CEILING) &&
    recentTotal >= C.NEW_BLOOMER_ACTIVITY_FLOOR &&
    recentTotal > earlyTotal
  ) return 'New Bloomer'

  // Priority 2: Rising Star — established store, strong upward trajectory
  // Monotonic-phase check removed: a store that dipped mid-phase then surged
  // still qualifies — growthPct ≥ 30 already guarantees recentTotal > earlyTotal.
  if (
    earlyTotal >= C.RISING_STAR_ACTIVITY_FLOOR &&
    growthPct !== null && growthPct >= C.RISING_STAR_GROWTH
  ) return 'Rising Star'

  // Priority 3: Growing Store — steady improvement below Rising Star threshold
  if (
    earlyTotal >= C.GROWING_STORE_ACTIVITY_FLOOR &&
    growthPct !== null &&
    growthPct >= C.GROWING_STORE_MIN_GROWTH &&
    growthPct <  C.GROWING_STORE_MAX_GROWTH &&
    recentTotal > earlyTotal
  ) return 'Growing Store'

  // Priority 4: Consistent Performer — stable performance
  if (
    growthPct !== null &&
    growthPct >= C.CONSISTENT_MIN_GROWTH &&
    growthPct <= C.CONSISTENT_MAX_GROWTH
  ) return 'Consistent Performer'

  // Priority 5: Declining Store — moderate negative trajectory
  if (
    growthPct !== null &&
    growthPct < C.DECLINING_MAX_GROWTH &&
    growthPct > C.DECLINING_MIN_GROWTH &&
    recentTotal < earlyTotal
  ) return 'Declining Store'

  // Priority 6: Fallen Star — sharp decline from an established base
  // Monotonic-phase check removed: a store that spiked mid-phase before collapsing
  // still qualifies — growthPct ≤ −30 already guarantees recentTotal < earlyTotal.
  if (
    earlyTotal >= C.FALLEN_STAR_ACTIVITY_FLOOR &&
    growthPct !== null && growthPct <= C.FALLEN_STAR_GROWTH
  ) return 'Fallen Star'

  return 'Low Volume Store'
}

// ── Main engine entry point ───────────────────────────────────────────────────

export function classifyAllStores(
  stores: StoreRecord[],
  months: string[],
): ClassificationResult {
  const phases = allocatePhases(months)
  const { earlyMonths, midMonths, recentMonths } = phases

  const raw = stores.map(store => {
    const earlyTotal   = phaseTotal(store, earlyMonths)
    const midTotal     = phaseTotal(store, midMonths)
    const recentTotal  = phaseTotal(store, recentMonths)
    const totalRevenue = phaseTotal(store, months)
    const growthPct    = earlyTotal > 0 ? (recentTotal - earlyTotal) / earlyTotal * 100 : null
    const momentumPct  = midTotal   > 0 ? (recentTotal - midTotal)   / midTotal   * 100 : null
    const trend        = computeTrendScore(store, months)
    const stability    = computeStabilityScore(store, months)
    return { store, earlyTotal, midTotal, recentTotal, totalRevenue, growthPct, momentumPct, trend, stability }
  })

  const byEarly  = [...raw].sort((a, b) => b.earlyTotal   - a.earlyTotal)
  const byRecent = [...raw].sort((a, b) => b.recentTotal  - a.recentTotal)
  const byTotal  = [...raw].sort((a, b) => b.totalRevenue - a.totalRevenue)

  const earlyRankMap   = new Map(byEarly.map((r, i)  => [r.store.store_id, i + 1]))
  const recentRankMap  = new Map(byRecent.map((r, i) => [r.store.store_id, i + 1]))
  const overallRankMap = new Map(byTotal.map((r, i)  => [r.store.store_id, i + 1]))

  const metrics: StoreMetrics[] = raw.map(r => ({
    store:          r.store,
    earlyTotal:     r.earlyTotal,
    midTotal:       r.midTotal,
    recentTotal:    r.recentTotal,
    totalRevenue:   r.totalRevenue,
    growthPct:      r.growthPct,
    momentumPct:    r.momentumPct,
    trendScore:     r.trend,
    stabilityScore: r.stability,
    category:       classifyStore(r.earlyTotal, r.midTotal, r.recentTotal, r.growthPct),
    earlyRank:      earlyRankMap.get(r.store.store_id)  ?? 0,
    recentRank:     recentRankMap.get(r.store.store_id) ?? 0,
    overallRank:    overallRankMap.get(r.store.store_id) ?? 0,
  }))

  const counts = Object.fromEntries(
    CATEGORY_ORDER.map(c => [c, 0])
  ) as Record<StoreCategory, number>
  for (const m of metrics) counts[m.category]++

  return { phases, metrics, counts }
}
