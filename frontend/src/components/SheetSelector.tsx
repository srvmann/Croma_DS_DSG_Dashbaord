import { motion } from 'framer-motion'
import { Sheet } from 'lucide-react'

interface Props {
  sheets: string[]
  selected: string | null
  onSelect: (sheet: string) => void
  isLoading: boolean
}

export default function SheetSelector({ sheets, selected, onSelect, isLoading }: Props) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500">
        Select a sheet
      </p>
      <div className="flex flex-wrap gap-2">
        {sheets.map((sheet, i) => (
          <motion.button
            key={sheet}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => !isLoading && onSelect(sheet)}
            disabled={isLoading}
            className={[
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              selected === sheet
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white',
              isLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ].join(' ')}
          >
            <Sheet className="h-3.5 w-3.5" />
            {sheet}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
