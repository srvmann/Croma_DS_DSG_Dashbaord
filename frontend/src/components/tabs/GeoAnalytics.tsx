import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Building2, TrendingUp, TrendingDown, Minus, BarChart2, MapPin } from 'lucide-react'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

const Plot = createPlotlyComponent(Plotly)

const GEO_URL =
  'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson'

// ── Helpers ───────────────────────────────────────────────────────────────────

function halve(months: string[]): { early: string[]; recent: string[] } {
  const n = months.length
  if (n === 0) return { early: [], recent: [] }
  if (n === 1) return { early: [], recent: months }
  const half = Math.floor(n / 2)
  return {
    early: months.slice(0, half),
    recent: n % 2 === 0 ? months.slice(half) : months.slice(half + 1),
  }
}

function winRev(store: StoreRecord, months: string[]): number {
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function mAvg(store: StoreRecord, months: string[]): number {
  return months.length ? winRev(store, months) / months.length : 0
}

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

// Try to match our state name to a GeoJSON feature name
function matchGeoName(ourName: string, geoNames: string[]): string | null {
  if (geoNames.includes(ourName)) return ourName
  const lower = ourName.toLowerCase()
  return (
    geoNames.find(g => g.toLowerCase() === lower) ??
    geoNames.find(g => g.toLowerCase().startsWith(lower.split(' ')[0])) ??
    null
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface StateMetric {
  ourState: string
  geoName: string | null
  rev: number
  count: number
  topStore: StoreRecord | null
  growth: number | null
}

// ── Summary card sub-component ─────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
  icon: React.ReactNode
  delay?: number
}

function MetricCard({ label, value, sub, valueClass, icon, delay = 0 }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl border border-gray-800 bg-gray-900 p-4 flex flex-col gap-1 min-w-0"
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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { filters: FilterState }

export default function GeoAnalytics({ filters }: Props) {
  const { stores, months } = useDataContext()

  const [geojson, setGeojson] = useState<any>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [selectedState, setSelectedState] = useState<string | null>(null)

  // ── Fetch GeoJSON once ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch(GEO_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { setGeojson(data); setGeoLoading(false) })
      .catch(e => {
        setGeoError(e?.message ?? 'Failed to load map data')
        setGeoLoading(false)
      })
  }, [])

  // Detect GeoJSON property key for state names
  const featureidkey = useMemo(() => {
    if (!geojson?.features?.[0]) return 'properties.NAME_1'
    const props = geojson.features[0].properties ?? {}
    const candidates = ['NAME_1', 'ST_NM', 'name', 'Name', 'STATE', 'statename']
    for (const k of candidates) {
      if (props[k] !== undefined) return `properties.${k}`
    }
    return 'properties.NAME_1'
  }, [geojson])

  const geoStateNames = useMemo<string[]>(() => {
    if (!geojson) return []
    const propKey = featureidkey.replace('properties.', '')
    return geojson.features.map((f: any) => f.properties[propKey] as string).filter(Boolean)
  }, [geojson, featureidkey])

  // ── Filter stores / months ─────────────────────────────────────────────────
  const { fs, fm, early, recent } = useMemo(() => {
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

    const { early, recent } = halve(fm)
    return { fs, fm, early, recent }
  }, [stores, months, filters])

  // ── Per-state aggregations ─────────────────────────────────────────────────
  const stateMetrics = useMemo((): StateMetric[] => {
    const map: Record<string, {
      rev: number; count: number; topStore: StoreRecord | null; growths: number[]
    }> = {}

    for (const store of fs) {
      const s = store.state ?? 'Unknown'
      if (!map[s]) map[s] = { rev: 0, count: 0, topStore: null, growths: [] }
      const r = winRev(store, fm)
      map[s].rev += r
      map[s].count++
      if (!map[s].topStore || r > winRev(map[s].topStore!, fm)) map[s].topStore = store

      const e = mAvg(store, early)
      if (e > 0 && early.length && recent.length) {
        map[s].growths.push((mAvg(store, recent) - e) / e * 100)
      }
    }

    return Object.entries(map).map(([ourState, d]) => ({
      ourState,
      geoName: geoStateNames.length ? matchGeoName(ourState, geoStateNames) : ourState,
      rev: d.rev,
      count: d.count,
      topStore: d.topStore,
      growth: d.growths.length ? d.growths.reduce((a, b) => a + b, 0) / d.growths.length : null,
    }))
  }, [fs, fm, early, recent, geoStateNames])

  // ── Choropleth traces ──────────────────────────────────────────────────────
  const choroplethTraces = useMemo(() => {
    if (!geojson || stateMetrics.length === 0) return []

    const matched = stateMetrics.filter(m => m.geoName !== null)
    if (matched.length === 0) return []

    const mainTrace = {
      type: 'choropleth',
      geojson,
      featureidkey,
      locations: matched.map(m => m.geoName),
      z: matched.map(m => m.rev),
      text: matched.map(m => {
        const top = m.topStore?.store_name ?? m.topStore?.store_id ?? 'N/A'
        return `<b>${m.ourState}</b>`
          + `<br>Revenue: ${fmtInr(m.rev)}`
          + `<br>Stores: ${m.count}`
          + `<br>Top Store: ${top}`
          + (m.growth !== null ? `<br>Avg Growth: ${fmtPct(m.growth)}` : '')
      }),
      hovertemplate: '%{text}<extra></extra>',
      colorscale: [
        [0, '#172554'],
        [0.2, '#1e40af'],
        [0.45, '#2563eb'],
        [0.7, '#3b82f6'],
        [1, '#93c5fd'],
      ],
      autocolorscale: false,
      colorbar: {
        title: { text: 'Revenue', font: { color: '#9ca3af', size: 11 } },
        thickness: 12,
        len: 0.55,
        bgcolor: 'rgba(0,0,0,0)',
        tickfont: { color: '#9ca3af', size: 9 },
        tickformat: '.3s',
        tickprefix: '₹',
      },
      marker: { line: { color: '#374151', width: 0.5 } },
    }

    const traces: any[] = [mainTrace]

    // Highlight selected state with a gold border overlay
    if (selectedState) {
      const sel = matched.find(m => m.ourState === selectedState)
      if (sel) {
        traces.push({
          type: 'choropleth',
          geojson,
          featureidkey,
          locations: [sel.geoName],
          z: [1],
          colorscale: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']],
          showscale: false,
          hoverinfo: 'skip',
          marker: { line: { color: '#fbbf24', width: 3 } },
        })
      }
    }

    return traces
  }, [geojson, featureidkey, stateMetrics, selectedState])

  // ── Summary cards data ─────────────────────────────────────────────────────
  const summaryCards = useMemo(() => {
    const totalRev = stateMetrics.reduce((s, m) => s + m.rev, 0)
    const totalStores = stateMetrics.reduce((s, m) => s + m.count, 0)
    const numStates = stateMetrics.length || 1
    const natAvgRevPerState = totalRev / numStates
    const natAvgRevPerStore = totalStores > 0 ? totalRev / totalStores : 0

    if (!selectedState) {
      const topState = [...stateMetrics].sort((a, b) => b.rev - a.rev)[0]
      return {
        mode: 'national' as const,
        cards: [
          { label: 'Total Revenue', value: fmtInr(totalRev), sub: `${numStates} states`, icon: <BarChart2 className="h-4 w-4" /> },
          { label: 'Total Stores', value: totalStores.toString(), sub: `${(totalStores / numStates).toFixed(1)} avg/state`, icon: <Building2 className="h-4 w-4" /> },
          { label: 'Avg Rev / State', value: fmtInr(natAvgRevPerState), icon: <BarChart2 className="h-4 w-4" /> },
          { label: 'Avg Rev / Store', value: fmtInr(natAvgRevPerStore), icon: <BarChart2 className="h-4 w-4" /> },
          {
            label: 'Top State',
            value: topState?.ourState ?? '—',
            sub: topState ? fmtInr(topState.rev) : undefined,
            icon: <MapPin className="h-4 w-4" />,
          },
        ],
      }
    }

    const sel = stateMetrics.find(m => m.ourState === selectedState)
    if (!sel) return { mode: 'national' as const, cards: [] }

    const vsRevPct = natAvgRevPerState > 0 ? (sel.rev - natAvgRevPerState) / natAvgRevPerState * 100 : null
    const avgStoresPerState = totalStores / numStates
    const vsStoresPct = avgStoresPerState > 0 ? (sel.count - avgStoresPerState) / avgStoresPerState * 100 : null

    return {
      mode: 'state' as const,
      stateName: selectedState,
      cards: [
        {
          label: `${selectedState} Revenue`,
          value: fmtInr(sel.rev),
          sub: vsRevPct !== null ? `${fmtPct(vsRevPct)} vs national avg` : undefined,
          valueClass: vsRevPct !== null ? (vsRevPct >= 0 ? 'text-emerald-400' : 'text-red-400') : undefined,
          icon: <BarChart2 className="h-4 w-4" />,
        },
        {
          label: 'Stores in State',
          value: sel.count.toString(),
          sub: vsStoresPct !== null ? `${fmtPct(vsStoresPct)} vs national avg` : undefined,
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          label: 'Avg Growth',
          value: sel.growth !== null ? fmtPct(sel.growth) : 'N/A',
          sub: 'early vs recent period',
          valueClass: sel.growth !== null ? (sel.growth >= 0 ? 'text-emerald-400' : 'text-red-400') : undefined,
          icon: sel.growth !== null && sel.growth >= 0
            ? <TrendingUp className="h-4 w-4 text-emerald-400" />
            : sel.growth !== null
              ? <TrendingDown className="h-4 w-4 text-red-400" />
              : <Minus className="h-4 w-4" />,
        },
        {
          label: 'Top Store',
          value: sel.topStore?.store_name ?? sel.topStore?.store_id ?? '—',
          sub: sel.topStore ? fmtInr(winRev(sel.topStore, fm)) : undefined,
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          label: 'Rev / Store (State)',
          value: sel.count > 0 ? fmtInr(sel.rev / sel.count) : '—',
          sub: `vs ${fmtInr(natAvgRevPerStore)} national`,
          icon: <BarChart2 className="h-4 w-4" />,
        },
      ],
    }
  }, [stateMetrics, selectedState, fm])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Map ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">India Revenue Choropleth</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Colour intensity = total revenue for selected period · click a state to drill down
            </p>
          </div>
          {selectedState && (
            <button
              onClick={() => setSelectedState(null)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0 px-2 py-0.5 rounded border border-blue-500/20"
            >
              Clear selection
            </button>
          )}
        </div>

        {geoLoading && (
          <div className="flex items-center justify-center h-[480px] gap-3 text-gray-500 text-sm">
            <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin" />
            Loading India map…
          </div>
        )}

        {geoError && (
          <div className="flex items-center justify-center h-[480px] text-red-400 text-sm">
            {geoError} — check your network connection.
          </div>
        )}

        {!geoLoading && !geoError && choroplethTraces.length === 0 && (
          <div className="flex items-center justify-center h-[480px] text-gray-600 text-sm">
            No data matches the selected filters.
          </div>
        )}

        {!geoLoading && !geoError && choroplethTraces.length > 0 && (
          <Plot
            data={choroplethTraces}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
              geo: {
                fitbounds: 'locations',
                bgcolor: 'rgba(0,0,0,0)',
                showframe: false,
                showcoastlines: true,
                coastlinecolor: '#374151',
                coastlinewidth: 0.8,
                showland: true,
                landcolor: '#1f2937',
                showocean: true,
                oceancolor: '#0a0f1a',
                showlakes: false,
                showcountries: true,
                countrycolor: '#374151',
                projection: { type: 'mercator' },
              },
              margin: { l: 0, r: 0, t: 0, b: 0 },
              height: 500,
            } as any}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            onClick={(evt: any) => {
              const pt = evt?.points?.[0]
              if (!pt) return
              const clickedGeoName = pt.location as string
              const entry = stateMetrics.find(m => m.geoName === clickedGeoName)
              if (entry) {
                setSelectedState(prev => prev === entry.ourState ? null : entry.ourState)
              }
            }}
          />
        )}
      </motion.div>

      {/* ── Summary Cards ── */}
      {summaryCards.cards.length > 0 && (
        <div>
          {summaryCards.mode === 'state' && (
            <p className="text-[11px] text-amber-400/80 mb-2 flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Showing metrics for <strong>{(summaryCards as any).stateName}</strong> vs national average
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {summaryCards.cards.map((card, i) => (
              <MetricCard key={card.label} {...card} delay={i * 0.04} />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
