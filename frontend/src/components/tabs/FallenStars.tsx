import { useMemo, useState } from 'react'
import { TrendingDown, Info, ArrowRight } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreCategory } from '@/lib/classificationEngine'
import { cn } from '@/lib/utils'
import { fmtInr, fmtPct } from '@/lib/formatting'
import { CATEGORY_TEXT_COLOR } from '@/lib/categoryStyles'

const Plot = createPlotlyComponent(Plotly)

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'growth' | 'earlyRev' | 'recentRev' | 'earlyRank' | 'recentRank' | 'health' | 'state'
type SortDir = 'asc' | 'desc'

const NEGATIVE_CATEGORIES: StoreCategory[] = ['Fallen Star']

// ── Table columns ─────────────────────────────────────────────────────────────

const TABLE_COLS: { key: SortKey | null; label: string; align: 'left' | 'right' | 'center' }[] = [
  { key: null,          label: 'Store',        align: 'left'   },
  { key: 'state',       label: 'State',        align: 'left'   },
  { key: null,          label: 'Category',     align: 'left'   },
  { key: 'earlyRev',   label: 'Early Rev',    align: 'right'  },
  { key: 'recentRev',  label: 'Recent Rev',   align: 'right'  },
  { key: 'growth',      label: 'Decline %',    align: 'right'  },
  { key: null,          label: 'Early Plans',  align: 'right'  },
  { key: null,          label: 'Mid Plans',    align: 'right'  },
  { key: null,          label: 'Recent Plans', align: 'right'  },
  { key: 'earlyRank',  label: 'Early Rank',   align: 'center' },
  { key: 'recentRank', label: 'Recent Rank',  align: 'center' },
  { key: 'health',      label: 'Health %',    align: 'right'  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function FallenStars({
  filters,
  onNavigateToStore,
  onNavigateToJourneyCategory,
}: {
  filters: FilterState
  onNavigateToStore?: (storeId: string) => void
  onNavigateToJourneyCategory?: (category: StoreCategory) => void
}) {
  const { classification } = useDataContext()
  const [sortKey, setSortKey] = useState<SortKey>('growth')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // ── Filter engine results ─────────────────────────────────────────────────

  const { rows, kpi, top15 } = useMemo(() => {
    let scope = classification.metrics

    // Apply store-level filters
    if (filters.state)    scope = scope.filter(m => m.store.state    === filters.state)
    if (filters.category) scope = scope.filter(m => m.store.category === filters.category)

    // Keep only negative-trajectory categories
    const rows = scope.filter(m => NEGATIVE_CATEGORIES.includes(m.category))
    const decliningCount = scope.filter(m => m.category === 'Declining Store').length

    const total = scope.length

    // Compute health % relative to visible scope
    const byRecent = [...scope].sort((a, b) => b.recentTotal - a.recentTotal)
    const localRecentRank = new Map(byRecent.map((m, i) => [m.store.store_id, i + 1]))

    const { earlyMonths, midMonths, recentMonths } = classification.phases

    const enriched = rows.map(m => ({
      ...m,
      localHealth: total > 0
        ? +((total - (localRecentRank.get(m.store.store_id) ?? total)) / total * 100).toFixed(1)
        : 0,
      earlyPlans:  earlyMonths.reduce((s, mo) => s + (m.store.monthly_plans_count?.[mo] ?? 0), 0),
      midPlans:    midMonths.reduce((s, mo) => s + (m.store.monthly_plans_count?.[mo] ?? 0), 0),
      recentPlans: recentMonths.reduce((s, mo) => s + (m.store.monthly_plans_count?.[mo] ?? 0), 0),
    }))

    const worstFaller = enriched.length > 0
      ? enriched.reduce((worst, r) => (r.growthPct ?? 0) < (worst.growthPct ?? 0) ? r : worst)
      : null

    // Median decline % — more robust than average for skewed distributions
    const declinesSorted = [...enriched]
      .map(r => r.growthPct ?? 0)
      .sort((a, b) => a - b)
    const mid = Math.floor(declinesSorted.length / 2)
    const medianDecline = declinesSorted.length === 0 ? 0
      : declinesSorted.length % 2 !== 0
        ? declinesSorted[mid]
        : (declinesSorted[mid - 1] + declinesSorted[mid]) / 2

    // Revenue at risk — Fallen Stars' recent revenue as % of total network recent revenue
    const networkRecentTotal = scope.reduce((s, m) => s + m.recentTotal, 0)
    const fallenRecentTotal  = enriched.reduce((s, r) => s + r.recentTotal, 0)
    const revenueAtRiskPct = networkRecentTotal > 0
      ? fallenRecentTotal / networkRecentTotal * 100
      : 0

    const top15 = [...enriched]
      .sort((a, b) => b.earlyTotal - a.earlyTotal)
      .slice(0, 15)

    return {
      rows: enriched,
      kpi: { count: enriched.length, decliningCount, worstFaller, medianDecline, revenueAtRiskPct },
      top15,
    }
  }, [classification, filters])

  // ── Sort ─────────────────────────────────────────────────────────────────────

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortKey === 'state') {
        const sa = a.store.state ?? '', sb = b.store.state ?? ''
        return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa)
      }
      const map: Record<string, [number, number]> = {
        growth:      [a.growthPct ?? 0,  b.growthPct ?? 0],
        earlyRev:   [a.earlyTotal,   b.earlyTotal],
        recentRev:  [a.recentTotal,  b.recentTotal],
        earlyRank:  [a.earlyRank,  b.earlyRank],
        recentRank: [a.recentRank, b.recentRank],
        health:      [a.localHealth, b.localHealth],
      }
      const [va, vb] = map[sortKey] ?? [0, 0]
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [rows, sortKey, sortDir])

  // ── Dumbbell chart ────────────────────────────────────────────────────────────

  const { chartTraces, chartCategories } = useMemo(() => {
    if (top15.length === 0) return { chartTraces: [] as object[], chartCategories: [] as string[] }

    const { earlyMonths, midMonths, recentMonths } = classification.phases
    const ec = earlyMonths.length  || 1
    const mc = midMonths.length    || 1
    const rc = recentMonths.length || 1

    const ordered = [...top15].sort((a, b) => a.earlyTotal / ec - b.earlyTotal / ec)
    const chartCategories = ordered.map(r => r.store.store_id)

    // Connector line spanning early avg → recent avg
    const lines = ordered.map(row => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [row.recentTotal / rc, row.earlyTotal / ec],
      y: [row.store.store_id,   row.store.store_id],
      showlegend: false,
      line:  { color: '#fca5a5', width: 2 },
      hoverinfo: 'none' as const,
    }))

    const recentTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Recent',
      x:    ordered.map(r => r.recentTotal / rc),
      y:    ordered.map(r => r.store.store_id),
      marker: { symbol: 'circle', size: 10, color: '#ef4444' },
      hovertemplate: '<b>%{y}</b><br>Recent: ₹%{x:,.0f}<extra></extra>',
    }

    const midTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Mid',
      x:    ordered.map(r => r.midTotal / mc),
      y:    ordered.map(r => r.store.store_id),
      marker: { symbol: 'diamond', size: 9, color: '#8b5cf6' },
      hovertemplate: '<b>%{y}</b><br>Mid: ₹%{x:,.0f}<extra></extra>',
    }

    const earlyTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Early',
      x:    ordered.map(r => r.earlyTotal / ec),
      y:    ordered.map(r => r.store.store_id),
      marker: { symbol: 'circle', size: 10, color: '#9ca3af' },
      hovertemplate: '<b>%{y}</b><br>Early: ₹%{x:,.0f}<extra></extra>',
    }

    return { chartTraces: [...lines, earlyTrace, midTrace, recentTrace], chartCategories }
  }, [top15, classification.phases])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'growth' ? 'asc' : 'desc')
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────────

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No declining stores found in the selected filters.
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-red-500" />
          Stores Losing Ground
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {rows.length} Fallen Star stores — once-strong stores with strict phase-over-phase decline (Early &gt; Mid &gt; Recent)
          in both Revenue and Plans Sold, dropping ≥ 30% from a historically above-median base.
          Identify root causes and intervene before further erosion.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-2">Fallen Stars</p>
          <p className="text-3xl font-bold text-red-700">{kpi.count}</p>
          <p className="text-xs text-red-500 mt-1">in current scope</p>
        </div>

        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider mb-2">Declining Stores</p>
          <p className="text-3xl font-bold text-orange-700">{kpi.decliningCount}</p>
          <button
            onClick={() => onNavigateToJourneyCategory?.('Declining Store')}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-800 font-medium transition-colors"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Worst Faller</p>
          <p className="text-2xl font-bold text-gray-900 truncate">
            {kpi.worstFaller?.store.store_name ?? kpi.worstFaller?.store.store_id ?? '—'}
          </p>
          <p className="text-xs text-red-600 mt-1">
            {kpi.worstFaller?.growthPct != null ? `${fmtPct(kpi.worstFaller.growthPct)} decline` : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-2">Median Decline</p>
          <p className="text-2xl font-bold text-red-700">{fmtPct(kpi.medianDecline)}</p>
          <p className="text-xs text-red-400 mt-1">Typical fallen star</p>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider mb-2">Revenue at Risk</p>
          <p className="text-2xl font-bold text-rose-700">{kpi.revenueAtRiskPct.toFixed(1)}%</p>
          <p className="text-xs text-rose-500 mt-1">of network recent rev</p>
        </div>
      </div>

      {/* Click hint */}
      {onNavigateToStore && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-xs text-blue-600">
            Click any row to open that store's Store Spotlight
          </span>
        </div>
      )}

      {/* Dumbbell chart */}
      {top15.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700">Early → Mid → Recent Revenue</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Top {top15.length} by early phase total · ● Early · ◆ Mid · ● Recent</p>
          <Plot
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={chartTraces as any}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              height: Math.max(320, top15.length * 30 + 90),
              margin: { l: 70, r: 20, t: 20, b: 60 },
              font:   { color: '#6b7280', family: 'Inter, sans-serif', size: 11 },
              xaxis: {
                gridcolor: '#f3f4f6', linecolor: '#e5e7eb',
                tickprefix: '₹', tickformat: ',.0f', automargin: true,
                title: { text: 'Revenue — phase total (₹)', font: { color: '#9ca3af', size: 11 } },
              },
              yaxis: {
                gridcolor: '#f3f4f6', linecolor: '#e5e7eb',
                type: 'category' as const,
                categoryorder: 'array' as const,
                categoryarray: chartCategories,
                automargin: true,
              },
              legend: {
                bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#6b7280', size: 10 },
                orientation: 'h' as const, x: 0, y: 1.08,
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
          <h3 className="text-sm font-semibold text-gray-700">Declining Stores Detail</h3>
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
                    onNavigateToStore ? 'cursor-pointer hover:bg-red-50/40' : 'hover:bg-gray-50',
                  )}
                >
                  <td className="px-4 py-2.5 font-semibold text-gray-800 whitespace-nowrap">
                    {row.store.store_name ?? row.store.store_id}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {row.store.state ?? '—'}
                  </td>
                  <td className={cn('px-4 py-2.5 text-[11px] font-semibold', CATEGORY_TEXT_COLOR[row.category])}>
                    {row.category}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-medium tabular-nums">
                    {fmtInr(row.earlyTotal)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">
                    {fmtInr(row.recentTotal)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-red-600 tabular-nums">
                    {row.growthPct != null ? fmtPct(row.growthPct) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 font-medium tabular-nums">
                    {row.earlyPlans.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-violet-500 tabular-nums">
                    {row.midPlans.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">
                    {row.recentPlans.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-600 tabular-nums">
                    {row.earlyRank}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-400 tabular-nums">
                    {row.recentRank}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                    {row.localHealth.toFixed(1)}
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
