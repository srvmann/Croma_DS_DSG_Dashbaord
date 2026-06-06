import { motion } from 'framer-motion'

interface KPI {
  sum: number
  mean: number
  min: number
  max: number
}

interface Props {
  kpis: Record<string, KPI>
  shape: { rows: number; columns: number }
}

function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

export default function KPICards({ kpis, shape }: Props) {
  const entries = Object.entries(kpis)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">Rows</p>
        <p className="mt-1.5 text-2xl font-bold text-white">{shape.rows.toLocaleString()}</p>
        <p className="mt-0.5 text-xs text-gray-600">{shape.columns} columns</p>
      </motion.div>

      {entries.slice(0, 4).map(([col, stats], i) => (
        <motion.div
          key={col}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (i + 1) * 0.05 }}
          className="rounded-xl border border-gray-800 bg-gray-900 p-4"
        >
          <p
            className="truncate text-xs font-medium uppercase tracking-widest text-gray-500"
            title={col}
          >
            {col}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-white">{fmt(stats.sum)}</p>
          <p className="mt-0.5 text-xs text-gray-600">avg {fmt(stats.mean)}</p>
        </motion.div>
      ))}
    </div>
  )
}
