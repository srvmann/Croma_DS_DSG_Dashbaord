import { motion } from 'framer-motion'
// @ts-expect-error — react-plotly.js/factory lacks bundled types
import createPlotlyComponent from 'react-plotly.js/factory'
// @ts-expect-error — plotly.js-dist-min does not ship its own .d.ts
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

const BASE_LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: { color: '#9ca3af', family: 'Inter, sans-serif', size: 11 },
  xaxis: {
    gridcolor: '#1f2937',
    linecolor: '#374151',
    tickcolor: '#374151',
    automargin: true,
  },
  yaxis: {
    gridcolor: '#1f2937',
    linecolor: '#374151',
    tickcolor: '#374151',
    automargin: true,
  },
  margin: { l: 50, r: 16, t: 16, b: 56 },
  height: 280,
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
          transition={{ delay: i * 0.06 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-3 text-sm font-medium text-gray-300">{chart.title}</h3>
          <Plot
            data={[
              {
                type: 'bar',
                x: chart.x,
                y: chart.y,
                marker: { color: '#3b82f6', opacity: 0.85 },
              },
            ]}
            layout={{
              ...BASE_LAYOUT,
              xaxis: {
                ...BASE_LAYOUT.xaxis,
                title: { text: chart.x_label },
              },
              yaxis: {
                ...BASE_LAYOUT.yaxis,
                title: { text: chart.y_label },
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
          transition={{ delay: (barCharts.length + i) * 0.06 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <h3 className="mb-3 text-sm font-medium text-gray-300">{dist.title}</h3>
          <Plot
            data={[
              {
                type: 'histogram',
                x: dist.data,
                marker: { color: '#8b5cf6', opacity: 0.8 },
                nbinsx: 30,
              },
            ]}
            layout={{
              ...BASE_LAYOUT,
              xaxis: {
                ...BASE_LAYOUT.xaxis,
                title: { text: dist.column },
              },
              yaxis: {
                ...BASE_LAYOUT.yaxis,
                title: { text: 'Count' },
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
