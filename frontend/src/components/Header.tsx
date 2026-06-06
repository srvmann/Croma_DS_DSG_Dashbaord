import { motion } from 'framer-motion'
import { BarChart3 } from 'lucide-react'

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <motion.div
          initial={{ rotate: -15, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <BarChart3 className="h-5 w-5 text-blue-400" />
        </motion.div>
        <motion.span
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="text-base font-bold tracking-tight text-white"
        >
          Store<span className="text-blue-400">Wise</span>
        </motion.span>
        <span className="ml-auto text-xs text-gray-600">Analytics Dashboard</span>
      </div>
    </header>
  )
}
