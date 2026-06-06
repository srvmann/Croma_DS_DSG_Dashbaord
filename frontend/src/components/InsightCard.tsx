import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type InsightVariant = 'info' | 'good' | 'warn' | 'note' | 'meta'

const BORDER_COLOR: Record<InsightVariant, string> = {
  info: '#3b82f6',
  good: '#10b981',
  warn: '#ef4444',
  note: '#f59e0b',
  meta: '#8b5cf6',
}

const TAG_CLS: Record<InsightVariant, string> = {
  info: 'bg-blue-500/15 text-blue-400',
  good: 'bg-emerald-500/15 text-emerald-400',
  warn: 'bg-red-500/15 text-red-400',
  note: 'bg-amber-500/15 text-amber-400',
  meta: 'bg-purple-500/15 text-purple-400',
}

interface InsightCardProps {
  variant?: InsightVariant
  tag: string
  tagCls?: string
  title: string
  body: string
  delay?: number
}

export function InsightCard({
  variant = 'info',
  tag,
  tagCls,
  title,
  body,
  delay = 0,
}: InsightCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, ease: 'easeOut' }}
      className="rounded-xl border border-l-4 border-white/10 p-5 flex flex-col gap-3"
      style={{
        borderLeftColor: BORDER_COLOR[variant],
        background: 'rgba(17, 24, 39, 0.60)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full',
            tagCls ?? TAG_CLS[variant],
          )}
        >
          {tag}
        </span>
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </div>
      <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
    </motion.div>
  )
}
