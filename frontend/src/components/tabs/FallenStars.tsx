import { useMemo, useState } from 'react'
import { TrendingDown, Info } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreCategory } from '@/lib/classificationEngine'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'growth' | 'earlyRev' | 'recentRev' | 'earlyRank' | 'recentRank' | 'health' | 'state'
type SortDir = 'asc' | 'desc'

const NEGATIVE_CATEGORIES: StoreCategory[] = ['Fallen Star', 'Declining Store']

const CATEGORY_STYLE: Record<StoreCategory, string> = {
  'New Bloomer':          'text-emerald-600',
  'Rising Star':          'text-yellow-500',
  'Growing Store':        'text-blue-500',
  'Consistent Performer': 'text-violet-500',
  'Declining Store':      'text-orange-500',
  'Fallen Star':          'text-red-600',
  'Low Volume Store':     'text-gray-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInr(n: number) {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

// ── Table columns ─────────────────────────────────────────────────────────────

const TABLE_COLS: { key: SortKey | null; label: string; align: 'left' | 'right' | 'center' }[] = [
  { key: null,          label: 'Store',        align: 'left'   },
  { key: 'state',       label: 'State',        align: 'left'   },
  { key: null,          label: 'Category',     align: 'left'   },
  { key: 'earlyRev',   label: 'Early Rev',    align: 'right'  },
  { key: 'recentRev',  label: 'Recent Rev',   align: 'right'  },
  { key: 'growth',      label: 'Decline %',    align: 'right'  },
  { key: 'earlyRank',  label: 'Early Rank',   align: 'center' },
  { key: 'recentRank', label: 'Recent Rank',  align: 'center' },
  { key: 'health',      label: 'Health %',    align: 'right'  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function FallenStars({
  filters,
  onNavigateToStore,
}: {
  filters: FilterState
  onNavigateToStore?: (storeId: string) => void
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

    const total = scope.length

    // Compute health % relative to visible scope
    const byRecent = [...scope].sort((a, b) => b.recentTotal - a.recentTotal)
    const localRecentRank = new Map(byRecent.map((m, i) => [m.store.store_id, i + 1]))

    const enriched = rows.map(m => ({
      ...m,
      localHealth: total > 0
        ? +((total - (localRecentRank.get(m.store.store_id) ?? total)) / total * 100).toFixed(1)
        : 0,
    }))

    const totalEarly  = enriched.reduce((s, r) => s + r.earlyTotal,  0)
    const totalRecent = enriched.reduce((s, r) => s + r.recentTotal, 0)
    const worstFaller = enriched.length > 0
      ? enriched.reduce((worst, r) => (r.growthPct ?? 0) < (worst.growthPct ?? 0) ? r : worst)
      : null
    const avgDecline = enriched.length > 0
      ? enriched.reduce((s, r) => s + (r.growthPct ?? 0), 0) / enriched.length
      : 0

    const top15 = [...enriched]
      .sort((a, b) => b.earlyTotal - a.earlyTotal)
      .slice(0, 15)

    return {
      rows: enriched,
      kpi: { count: enriched.length, lostRevenue: totalEarly - totalRecent, earlyTotal: totalEarly, recentTotal: totalRecent, worstFaller, avgDecline },
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
    const ordered     = [...top15].sort((a, b) => a.earlyTotal - b.earlyTotal)
    const chartCategories = ordered.map(r => r.store.store_id)

    const lines = ordered.map(row => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: [row.recentTotal, row.earlyTotal],
      y: [row.store.store_id, row.store.store_id],
      showlegend: false,
      line:  { color: '#fca5a5', width: 2 },
      hoverinfo: 'none' as const,
    }))

    const recentTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Recent',
      x:    ordered.map(r => r.recentTotal),
      y:    ordered.map(r => r.store.store_id),
      marker: { symbol: 'circle', size: 10, color: '#ef4444' },
      hovertemplate: '<b>%{y}</b><br>Recent: ₹%{x:,.0f}/mo<extra></extra>',
    }

    const earlyTrace = {
      type: 'scatter' as const,
      mode: 'markers' as const,
      name: 'Early',
      x:    ordered.map(r => r.earlyTotal),
      y:    ordered.map(r => r.store.store_id),
      marker: { symbol: 'circle', size: 10, color: '#9ca3af' },
      hovertemplate: '<b>%{y}</b><br>Early: ₹%{x:,.0f}/mo<extra></extra>',
    }

    return { chartTraces: [...lines, earlyTrace, recentTrace], chartCategories }
  }, [top15])

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
          {rows.length} stores declining — classified as Fallen Star or Declining Store.
          These need attention — identify root causes and intervene before further erosion.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Declining Stores</p>
          <p className="text-3xl font-bold text-gray-900">{kpi.count}</p>
          <p className="text-xs text-gray-400 mt-1">in current scope</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Lost Revenue</p>
          <p className="text-2xl font-bold text-gray-900">{fmtInr(kpi.lostRevenue)}</p>
          <p className="text-xs text-gray-400 mt-1">{fmtInr(kpi.earlyTotal)} → {fmtInr(kpi.recentTotal)}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Worst Faller</p>
          <p className="text-2xl font-bold text-gray-900">
            {kpi.worstFaller?.store.store_name ?? kpi.worstFaller?.store.store_id ?? '—'}
          </p>
          <p className="text-xs text-red-600 mt-1">
            {kpi.worstFaller?.growthPct != null ? `${fmtPct(kpi.worstFaller.growthPct)} decline` : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-2">Avg Decline</p>
          <p className="text-2xl font-bold text-red-700">{fmtPct(kpi.avgDecline)}</p>
          <p className="text-xs text-red-400 mt-1">Mean phase decline</p>
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
          <h3 className="text-sm font-semibold text-gray-700">Early → Recent Revenue Shift</h3>
          <p className="text-xs text-gray-400 mt-0.5 mb-4">Top {top15.length} by early revenue</p>
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
                title: { text: 'Revenue collected (phase total)', font: { color: '#9ca3af', size: 11 } },
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
                  <td className={cn('px-4 py-2.5 text-[11px] font-semibold', CATEGORY_STYLE[row.category])}>
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
