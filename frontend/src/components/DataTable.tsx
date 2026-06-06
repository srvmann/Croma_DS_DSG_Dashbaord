import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  columns: string[]
  rows: Record<string, unknown>[]
}

const PAGE_SIZE = 25

export default function DataTable({ columns, rows }: Props) {
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900 table-sticky-head"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b border-gray-700"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300 w-12">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  title={col}
                  className="max-w-[160px] truncate px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-300"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  'border-b border-gray-800/50 transition-colors duration-100 hover:bg-blue-950/30',
                  i % 2 === 1 ? 'bg-white/[0.02]' : '',
                )}
              >
                <td className="px-3 py-2.5 text-gray-600 tabular-nums">
                  {page * PAGE_SIZE + i + 1}
                </td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-[200px] truncate px-3 py-2.5 text-gray-300"
                    title={String(row[col] ?? '')}
                  >
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-gray-800 px-4 py-3">
        <span className="text-xs text-gray-500">
          {rows.length.toLocaleString()} rows total — showing{' '}
          {(page * PAGE_SIZE + 1).toLocaleString()}–
          {Math.min((page + 1) * PAGE_SIZE, rows.length).toLocaleString()}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs text-gray-500">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
