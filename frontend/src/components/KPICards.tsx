import { useEffect, useRef, useState } from 'react'
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

const PALETTE = ['#3b82f6', '#14b8a6', '#10b981', '#f59e0b', '#8b5cf6']

function getAccent(col: string, idx: number): string {
  const lower = col.toLowerCase()
  if (/rev|sale|amount|value|price/.test(lower)) return '#3b82f6'
  if (/growth|pct|rate|margin/.test(lower)) return '#10b981'
  if (/target|forecast|plan|budget/.test(lower)) return '#f59e0b'
  if (/decline|loss|drop|risk/.test(lower)) return '#ef4444'
  return PALETTE[idx % PALETTE.length]
}

function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2)
}

/** Formats `current` using the scale of `target` so the unit stays stable during animation. */
function fmtScaled(current: number, target: number): string {
  const abs = Math.abs(target)
  if (abs >= 1_000_000_000) return `${(current / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(current / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(current / 1_000).toFixed(1)}K`
  return target % 1 === 0 ? String(Math.round(current)) : current.toFixed(2)
}

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    setValue(0)
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // cubic ease-out
      setValue(eased * target)
      if (progress < 1) frameRef.current = requestAnimationFrame(tick)
      else setValue(target)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, duration])

  return value
}

function AnimatedValue({ value }: { value: number }) {
  const animated = useCountUp(value)
  return <>{fmtScaled(animated, value)}</>
}

function KPICard({
  label,
  value,
  sub,
  accent,
  delay,
}: {
  label: string
  value: number
  sub: string
  accent: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ease: 'easeOut' }}
      className="rounded-xl border border-gray-800 border-l-4 bg-gray-900 p-4 cursor-default
                 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
      style={{ borderLeftColor: accent }}
    >
      <p className="truncate text-xs font-medium uppercase tracking-widest text-gray-500" title={label}>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-bold text-white tabular-nums">
        <AnimatedValue value={value} />
      </p>
      <p className="mt-0.5 text-xs text-gray-600">{sub}</p>
    </motion.div>
  )
}

export default function KPICards({ kpis, shape }: Props) {
  const entries = Object.entries(kpis)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KPICard
        label="Rows"
        value={shape.rows}
        sub={`${shape.columns} columns`}
        accent="#3b82f6"
        delay={0}
      />
      {entries.slice(0, 4).map(([col, stats], i) => (
        <KPICard
          key={col}
          label={col}
          value={stats.sum}
          sub={`avg ${fmt(stats.mean)}`}
          accent={getAccent(col, i + 1)}
          delay={(i + 1) * 0.05}
        />
      ))}
    </div>
  )
}
