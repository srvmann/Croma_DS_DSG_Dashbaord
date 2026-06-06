import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'
import { useDataContext } from '@/contexts/DataContext'
import type { FilterState } from '@/hooks/useFilters'
import type { StoreRecord } from '@/lib/api'

const Plot = createPlotlyComponent(Plotly)

const GEO_URL =
  'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson'

// ── State centroids for bubble placement ──────────────────────────────────────
const STATE_CENTROIDS: Record<string, [number, number]> = {
  'Andhra Pradesh':             [15.9,  79.7],
  'Arunachal Pradesh':          [27.5,  94.0],
  'Assam':                      [26.2,  92.9],
  'Bihar':                      [25.4,  85.3],
  'Chhattisgarh':               [21.3,  81.9],
  'Goa':                        [15.4,  74.0],
  'Gujarat':                    [22.3,  71.2],
  'Haryana':                    [29.1,  76.1],
  'Himachal Pradesh':           [31.5,  77.2],
  'Jammu and Kashmir':          [33.5,  75.5],
  'Jammu & Kashmir':            [33.5,  75.5],
  'Jharkhand':                  [23.6,  85.3],
  'Karnataka':                  [15.3,  75.7],
  'Kerala':                     [10.5,  76.3],
  'Ladakh':                     [34.1,  77.6],
  'Madhya Pradesh':             [23.5,  78.7],
  'Maharashtra':                [19.2,  75.7],
  'Manipur':                    [24.7,  93.9],
  'Meghalaya':                  [25.5,  91.4],
  'Mizoram':                    [23.2,  92.9],
  'Nagaland':                   [26.2,  94.6],
  'Odisha':                     [20.5,  84.5],
  'Punjab':                     [31.1,  75.3],
  'Rajasthan':                  [26.4,  73.9],
  'Sikkim':                     [27.5,  88.5],
  'Tamil Nadu':                 [11.1,  78.7],
  'Telangana':                  [17.5,  79.1],
  'Tripura':                    [23.9,  91.9],
  'Uttar Pradesh':              [26.8,  80.7],
  'Uttarakhand':                [30.1,  79.3],
  'West Bengal':                [23.5,  87.9],
  'Delhi':                      [28.7,  77.1],
  'Chandigarh':                 [30.7,  76.8],
  'Puducherry':                 [11.9,  79.8],
  'Andaman and Nicobar Islands':[11.7,  92.7],
  'Lakshadweep':                [10.6,  72.6],
  'Dadra and Nagar Haveli':     [20.1,  73.0],
  'Daman and Diu':              [20.4,  72.8],
}

// ── Growth colorscale: red (–40 %) → amber (0 %) → dark-green (+40 %) ─────────
const GROWTH_CS = [
  [0,    '#991b1b'],
  [0.2,  '#ef4444'],
  [0.35, '#f97316'],
  [0.5,  '#fbbf24'],
  [0.65, '#a3e635'],
  [0.8,  '#16a34a'],
  [1,    '#14532d'],
]

const LEGEND_CATS = [
  { label: 'Strong growth', color: '#14532d' },
  { label: 'Growth',        color: '#16a34a' },
  { label: 'Stable',        color: '#fbbf24' },
  { label: 'Declining',     color: '#f97316' },
  { label: 'Critical',      color: '#991b1b' },
]

// ── Animation ─────────────────────────────────────────────────────────────────
const panelSpring = {
  initial:    { opacity: 0, y: 24 },
  animate:    { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 260, damping: 24 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function winRev(store: StoreRecord, months: string[]): number {
  return months.reduce((s, m) => s + (store.monthly_sales[m] ?? 0), 0)
}

function mAvg(store: StoreRecord, months: string[]): number {
  return months.length ? winRev(store, months) / months.length : 0
}

function fmtInr(n: number): string {
  const abs = Math.abs(n); const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`
  return `${sign}₹${abs.toFixed(0)}`
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function matchGeoName(ourName: string, geoNames: string[]): string | null {
  if (geoNames.includes(ourName)) return ourName
  const lower = ourName.toLowerCase()
  return (
    geoNames.find(g => g.toLowerCase() === lower) ??
    geoNames.find(g => g.toLowerCase().startsWith(lower.split(' ')[0])) ??
    null
  )
}

function matchCentroid(state: string): [number, number] | null {
  if (STATE_CENTROIDS[state]) return STATE_CENTROIDS[state]
  const lower = state.toLowerCase()
  const key = Object.keys(STATE_CENTROIDS).find(k =>
    k.toLowerCase() === lower ||
    k.toLowerCase().replace(/[^a-z]/g, '').includes(lower.replace(/[^a-z]/g, '').slice(0, 5)),
  )
  return key ? STATE_CENTROIDS[key] : null
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface StateMetric {
  ourState: string
  geoName:  string | null
  rev:      number
  count:    number
  topStore: StoreRecord | null
  growth:   number | null
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { filters: FilterState }

export default function GeoAnalytics({ filters }: Props) {
  const { stores, months } = useDataContext()

  const [geojson, setGeojson]       = useState<any>(null)
  const [geoLoading, setGeoLoading] = useState(true)
  const [geoError, setGeoError]     = useState<string | null>(null)
  const [selectedState, setSelectedState] = useState<string | null>(null)

  useEffect(() => {
    fetch(GEO_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => { setGeojson(data); setGeoLoading(false) })
      .catch(e  => { setGeoError(e?.message ?? 'Failed'); setGeoLoading(false) })
  }, [])

  const featureidkey = useMemo(() => {
    if (!geojson?.features?.[0]) return 'properties.NAME_1'
    const props = geojson.features[0].properties ?? {}
    for (const k of ['NAME_1', 'ST_NM', 'name', 'Name', 'STATE', 'statename']) {
      if (props[k] !== undefined) return `properties.${k}`
    }
    return 'properties.NAME_1'
  }, [geojson])

  const geoStateNames = useMemo<string[]>(() => {
    if (!geojson) return []
    const pk = featureidkey.replace('properties.', '')
    return geojson.features.map((f: any) => f.properties[pk] as string).filter(Boolean)
  }, [geojson, featureidkey])

  // ── Filtered stores + months ───────────────────────────────────────────────
  const { fs, fm, early, recent } = useMemo(() => {
    let fs = stores
    if (filters.state)    fs = fs.filter(s => s.state    === filters.state)
    if (filters.category) fs = fs.filter(s => s.category === filters.category)
    let fm = months
    if (filters.fromMonth) { const i = months.indexOf(filters.fromMonth); if (i >= 0) fm = fm.slice(i) }
    if (filters.toMonth)   { const i = months.indexOf(filters.toMonth);   if (i >= 0) fm = fm.slice(0, i + 1) }
    const { early, recent } = halve(fm)
    return { fs, fm, early, recent }
  }, [stores, months, filters])

  // ── Per-state aggregations ─────────────────────────────────────────────────
  const stateMetrics = useMemo((): StateMetric[] => {
    const map: Record<string, { rev: number; count: number; topStore: StoreRecord | null; growths: number[] }> = {}
    for (const store of fs) {
      const s = store.state ?? 'Unknown'
      if (!map[s]) map[s] = { rev: 0, count: 0, topStore: null, growths: [] }
      const r = winRev(store, fm)
      map[s].rev += r; map[s].count++
      if (!map[s].topStore || r > winRev(map[s].topStore!, fm)) map[s].topStore = store
      const e = mAvg(store, early)
      if (e > 0 && early.length && recent.length)
        map[s].growths.push((mAvg(store, recent) - e) / e * 100)
    }
    return Object.entries(map).map(([ourState, d]) => ({
      ourState,
      geoName: geoStateNames.length ? matchGeoName(ourState, geoStateNames) : ourState,
      rev:     d.rev,
      count:   d.count,
      topStore: d.topStore,
      growth:  d.growths.length ? d.growths.reduce((a, b) => a + b, 0) / d.growths.length : null,
    }))
  }, [fs, fm, early, recent, geoStateNames])

  // ── Plotly traces ──────────────────────────────────────────────────────────
  const traces = useMemo(() => {
    if (!geojson) return []

    const matched         = stateMetrics.filter(m => m.geoName !== null)
    const matchedGeoNames = matched.map(m => m.geoName as string)
    const unmatched       = geoStateNames.filter(n => !matchedGeoNames.includes(n))

    const out: any[] = []

    // 1. Background: states with no data → light neutral
    if (unmatched.length > 0) {
      out.push({
        type:         'choropleth',
        geojson,
        featureidkey,
        locations:    unmatched,
        z:            unmatched.map(() => 0),
        colorscale:   [[0, '#e2e8f0'], [1, '#e2e8f0']],
        showscale:    false,
        hovertemplate: '<b>%{location}</b><br>No stores in scope<extra></extra>',
        marker:       { line: { color: '#ffffff', width: 0.8 } },
      })
    }

    // 2. Choropleth: growth % — diverging green-red scale
    if (matched.length > 0) {
      out.push({
        type:         'choropleth',
        geojson,
        featureidkey,
        locations:    matched.map(m => m.geoName),
        z:            matched.map(m => m.growth ?? 0),
        zmin:  -40, zmax: 40,
        text:  matched.map(m => {
          const top = m.topStore?.store_name ?? m.topStore?.store_id ?? 'N/A'
          return `<b>${m.ourState}</b>`
            + `<br>Growth: ${m.growth !== null ? fmtPct(m.growth) : 'N/A'}`
            + `<br>Revenue: ${fmtInr(m.rev)}`
            + `<br>Stores: ${m.count}`
            + `<br>Top Store: ${top}`
        }),
        hovertemplate: '%{text}<extra></extra>',
        colorscale:    GROWTH_CS,
        autocolorscale: false,
        colorbar: {
          title:     { text: 'Growth %', font: { color: '#6b7280', size: 11 } },
          thickness: 14,
          len:       0.65,
          bgcolor:   'rgba(0,0,0,0)',
          tickfont:  { color: '#6b7280', size: 10 },
          ticksuffix: '%',
          tickvals:  [-40, -20, 0, 20, 40],
        },
        marker: { line: { color: '#ffffff', width: 0.8 } },
      })
    }

    // 3. Selected-state amber ring
    if (selectedState) {
      const sel = matched.find(m => m.ourState === selectedState)
      if (sel) {
        out.push({
          type:       'choropleth',
          geojson,
          featureidkey,
          locations:  [sel.geoName],
          z:          [1],
          colorscale: [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']],
          showscale:  false,
          hoverinfo:  'skip',
          marker:     { line: { color: '#f59e0b', width: 3 } },
        })
      }
    }

    // 4. Bubbles: scattergeo sized by store count, colored by growth %
    const bubbles = matched
      .map(m => ({ ...m, centroid: matchCentroid(m.ourState) }))
      .filter(m => m.centroid !== null)

    if (bubbles.length > 0) {
      const maxCount = Math.max(...bubbles.map(b => b.count), 1)
      out.push({
        type: 'scattergeo',
        lat:  bubbles.map(b => b.centroid![0]),
        lon:  bubbles.map(b => b.centroid![1]),
        mode: 'markers',
        text: bubbles.map(b =>
          `<b>${b.ourState}</b>`
          + `<br>Stores: ${b.count}`
          + `<br>Growth: ${b.growth !== null ? fmtPct(b.growth) : 'N/A'}`
        ),
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
        marker: {
          size:      bubbles.map(b => Math.max(8, (b.count / maxCount) * 44)),
          color:     bubbles.map(b => b.growth ?? 0),
          colorscale: GROWTH_CS,
          cmin: -40, cmax: 40,
          opacity:   0.55,
          line:      { width: 1.5, color: 'rgba(255,255,255,0.9)' },
          showscale: false,
        },
      })
    }

    return out
  }, [geojson, featureidkey, stateMetrics, geoStateNames, selectedState])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div
      {...panelSpring}
      className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-bold text-gray-900">India Geographic Store Journey</h2>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed max-w-lg">
            Where growth is happening and where intervention is required.
            Choropleth shades each state; bubbles sized by store count and coloured by direction.
          </p>
        </div>
        {selectedState && (
          <motion.button
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setSelectedState(null)}
            className="shrink-0 text-xs text-blue-600 hover:text-blue-500 transition-colors px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 font-medium"
          >
            ✕ {selectedState}
          </motion.button>
        )}
      </div>

      {/* Hint bar */}
      <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-blue-400/60 shrink-0" />
        <p className="text-[10.5px] text-blue-700/80">
          Hover a state for its full journey profile · all states shaded by growth %, bubbles sized by store count
        </p>
      </div>

      {/* Map */}
      <div className="px-2">
        {geoLoading && (
          <div className="flex items-center justify-center h-[520px] gap-3 text-gray-400 text-sm">
            <div className="h-5 w-5 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
            Loading India map…
          </div>
        )}
        {geoError && (
          <div className="flex items-center justify-center h-[520px] text-red-500 text-sm">
            {geoError} — check your network connection.
          </div>
        )}
        {!geoLoading && !geoError && traces.length === 0 && (
          <div className="flex items-center justify-center h-[520px] text-gray-400 text-sm">
            No data matches the selected filters.
          </div>
        )}
        {!geoLoading && !geoError && traces.length > 0 && (
          <Plot
            data={traces}
            layout={{
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor:  'rgba(0,0,0,0)',
              font: { color: '#6b7280', family: 'Inter, sans-serif', size: 11 },
              geo: {
                fitbounds:      false,
                lataxis:        { range: [6, 38] },
                lonaxis:        { range: [67, 98] },
                bgcolor:        '#f0f9ff',
                showframe:      false,
                showcoastlines: true,
                coastlinecolor: '#94a3b8',
                coastlinewidth: 0.8,
                showland:       true,
                landcolor:      '#f8fafc',
                showocean:      true,
                oceancolor:     '#dbeafe',
                showlakes:      true,
                lakecolor:      '#dbeafe',
                showcountries:  true,
                countrycolor:   '#94a3b8',
                countrywidth:   1,
                showsubunits:   true,
                subunitcolor:   '#cbd5e1',
                projection:     { type: 'mercator' },
              },
              margin: { l: 0, r: 0, t: 0, b: 0 },
              height: 520,
            } as any}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
            onClick={(evt: any) => {
              const pt = evt?.points?.[0]
              if (!pt) return
              const entry = stateMetrics.find(m => m.geoName === pt.location)
              if (entry) setSelectedState(p => p === entry.ourState ? null : entry.ourState)
            }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-2">
        {LEGEND_CATS.map(cat => (
          <span key={cat.label} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span
              className="h-3 w-3 rounded-sm shrink-0"
              style={{ backgroundColor: cat.color }}
            />
            {cat.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px] text-gray-400 ml-2">
          <span className="h-3 w-3 rounded-full border border-gray-400 shrink-0" />
          Bubble size = store count · colour = direction
        </span>
      </div>
    </motion.div>
  )
}
