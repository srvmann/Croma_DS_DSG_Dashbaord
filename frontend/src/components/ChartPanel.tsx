import { motion } from 'framer-motion'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-ignore — plotly.js-dist-min does not ship its own .d.ts
import Plotly from 'plotly.js-dist-min'

const Plot = createPlotlyComponent(Plotly)

interface BarChart {
  title: string
  x: string[]
  y: number[]
  x_label: string
  y_label: string
}

interface Distribution {
  title: string
  column: string
  data: number[]
}

interface Props {
  barCharts: BarChart[]
  distributions: Distribution[]
}

const HOVER_STYLE = {
  bgcolor: '#1e293b',
  bordercolor: '#334155',
  font: { family: 'Inter, sans-serif', size: 12, color: '#e2e8f0' },
}

const BASE_LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
  xaxis: {
    gridcolor: '#1f2937',
    linecolor: '#374151',
    tickcolor: '#374151',
    automargin: true,
    tickfont: { family: 'Inter, sans-serif', size: 10 },
  },
  yaxis: {
    gridcolor: '#1f2937',
    linecolor: '#374151',
    tickcolor: '#374151',
    automargin: true,
    tickfont: { family: 'Inter, sans-serif', size: 10 },
  },
  margin: { l: 50, r: 16, t: 16, b: 56 },
  height: 280,
  hoverlabel: HOVER_STYLE,
}

export default function ChartPanel({ barCharts, distributions }: Props) {
  if (!barCharts.length && !distributions.length) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-600">
        No chartable columns found in this sheet.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {barCharts.map((chart, i) => (
        <motion.div
          key={chart.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, ease: 'easeOut' }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-3 text-sm font-medium text-gray-300">{chart.title}</h3>
          <Plot
            data={[
              {
                type: 'bar',
                x: chart.x,
                y: chart.y,
                marker: {
                  color: chart.y.map(v => v >= 0 ? '#1d4ed8' : '#ef4444'),
                  opacity: 0.9,
                },
                hovertemplate: '<b>%{x}</b><br>%{y:,.2f}<extra></extra>',
              },
            ]}
            layout={{
              ...BASE_LAYOUT,
              xaxis: {
                ...BASE_LAYOUT.xaxis,
                title: { text: chart.x_label, font: { color: '#6b7280', size: 11 } },
              },
              yaxis: {
                ...BASE_LAYOUT.yaxis,
                title: { text: chart.y_label, font: { color: '#6b7280', size: 11 } },
              },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>
      ))}

      {distributions.map((dist, i) => (
        <motion.div
          key={dist.title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (barCharts.length + i) * 0.06, ease: 'easeOut' }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-3 text-sm font-medium text-gray-300">{dist.title}</h3>
          <Plot
            data={[
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              {
                type: 'histogram',
                x: dist.data,
                marker: { color: '#0d9488', opacity: 0.85 },
                nbinsx: 30,
                hovertemplate: '%{x}: %{y} records<extra></extra>',
              } as any,
            ]}
            layout={{
              ...BASE_LAYOUT,
              xaxis: {
                ...BASE_LAYOUT.xaxis,
                title: { text: dist.column, font: { color: '#6b7280', size: 11 } },
              },
              yaxis: {
                ...BASE_LAYOUT.yaxis,
                title: { text: 'Count', font: { color: '#6b7280', size: 11 } },
              },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%' }}
          />
        </motion.div>
      ))}
    </div>
  )
}
