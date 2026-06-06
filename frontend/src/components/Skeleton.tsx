import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

function Pulse({ className }: { className?: string }) {
  return <div className={cn('skeleton-pulse rounded', className)} />
}

/** Returns true for at least `minMs` after `ready` becomes true. */
export function useMinSkeleton(ready: boolean, minMs = 400): boolean {
  const [showing, setShowing] = useState(!ready)

  useEffect(() => {
    if (!ready) {
      setShowing(true)
      return
    }
    const t = setTimeout(() => setShowing(false), minMs)
    return () => clearTimeout(t)
  }, [ready, minMs])

  return showing || !ready
}

export function SkeletonKPICards() {
  const accents = ['#3b82f6', '#14b8a6', '#10b981', '#f59e0b', '#8b5cf6']
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {accents.map((color, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-800 border-l-4 bg-gray-900/80 p-4 space-y-3"
          style={{ borderLeftColor: color }}
        >
          <Pulse className="h-2.5 w-20" />
          <Pulse className="h-7 w-28" />
          <Pulse className="h-2 w-16" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ tall = false }: { tall?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 space-y-4">
      <Pulse className="h-4 w-36" />
      <Pulse className={cn('w-full', tall ? 'h-80' : 'h-64')} />
    </div>
  )
}

export function SkeletonTable() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden">
      <div className="p-0">
        <div className="flex gap-3 px-4 py-3" style={{ backgroundColor: '#1e3a5f' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Pulse key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={cn('flex gap-3 px-4 py-3 border-b border-gray-800/50', i % 2 === 1 ? 'bg-white/[0.02]' : '')}
          >
            {Array.from({ length: 5 }).map((_, j) => (
              <Pulse key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function AppSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Fake header */}
      <div className="h-16 border-b border-gray-800 bg-gray-950/95 flex items-center px-4 gap-4">
        <Pulse className="h-8 w-12 rounded-full" />
        <div className="space-y-1.5">
          <Pulse className="h-4 w-24" />
          <Pulse className="h-2.5 w-36" />
        </div>
      </div>
      {/* Fake tab bar */}
      <div className="h-12 border-b border-gray-800 bg-gray-950/95 flex items-center px-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Pulse key={i} className="h-6 w-24 rounded-md" />
        ))}
      </div>
      {/* Fake filter bar */}
      <div className="h-11 border-b border-gray-800 bg-gray-950/90 flex items-center px-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-8 w-32 rounded-md" />
        ))}
      </div>
      {/* Fake content */}
      <div className="px-4 py-6 max-w-screen-2xl mx-auto space-y-4">
        <SkeletonKPICards />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
        <SkeletonTable />
      </div>
    </div>
  )
}
