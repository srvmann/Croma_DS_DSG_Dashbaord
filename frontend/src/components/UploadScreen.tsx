import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  UploadCloud,
  XCircle,
  AlertCircle,
  BarChart2,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { loadDemoData, uploadSales, type SalesFileMeta } from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZoneSuccess {
  kind: 'success'
  storeCount: number
  months: string[]
}
interface ZoneError {
  kind: 'error'
  message: string
}
interface ZoneConfirm {
  kind: 'confirm'
  existing: SalesFileMeta
}
type ZonePhase =
  | { kind: 'idle' }
  | { kind: 'dragging' }
  | { kind: 'uploading'; progress: number }
  | ZoneSuccess
  | ZoneError
  | ZoneConfirm

// ── UploadZone ────────────────────────────────────────────────────────────────

interface UploadZoneProps {
  phase: ZonePhase
  onFile: (file: File) => void
  onRetry: () => void
  onConfirmReplace?: () => void
}

function UploadZone({ phase, onFile, onRetry, onConfirmReplace }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const isDraggingCapable = phase.kind === 'idle' || phase.kind === 'dragging' || phase.kind === 'error'

  const handleZoneDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDraggingCapable) return
    dragCounter.current++
  }
  const handleZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDraggingCapable) return
    dragCounter.current--
  }
  const handleZoneDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleZoneDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }
  const handleClick = () => {
    if (phase.kind === 'success') return
    inputRef.current?.click()
  }
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  const hints = ['Store_ID', 'Store_Name', 'State', 'Category', 'Jan-2024', 'Feb-2024', '…']

  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden',
        phase.kind === 'idle' &&
          'border-gray-200 bg-gray-50/60 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer group',
        phase.kind === 'dragging' &&
          'border-blue-500 bg-blue-50/80 ring-4 ring-blue-400/15 cursor-copy',
        phase.kind === 'uploading' && 'border-blue-300 bg-blue-50/40 cursor-default',
        phase.kind === 'success' && 'border-emerald-300 bg-emerald-50/50 cursor-default',
        phase.kind === 'error' && 'border-red-300 bg-red-50/50 cursor-pointer',
        phase.kind === 'confirm' && 'border-amber-300 bg-amber-50/50 cursor-default',
      )}
      onClick={handleClick}
      onDragEnter={handleZoneDragEnter}
      onDragLeave={handleZoneDragLeave}
      onDragOver={handleZoneDragOver}
      onDrop={handleZoneDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleInputChange}
      />

      <div className="px-8 py-10 flex flex-col items-center justify-center min-h-[260px] text-center">
        <AnimatePresence mode="wait">

          {/* ── Idle / Dragging ── */}
          {(phase.kind === 'idle' || phase.kind === 'dragging') && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col items-center gap-4"
            >
              <div className={cn(
                'h-16 w-16 rounded-2xl flex items-center justify-center transition-all duration-200',
                phase.kind === 'dragging'
                  ? 'bg-blue-500 scale-110 shadow-lg shadow-blue-500/30'
                  : 'bg-gradient-to-br from-blue-100 to-cyan-100 group-hover:from-blue-200 group-hover:to-cyan-200',
              )}>
                <UploadCloud className={cn(
                  'h-8 w-8 transition-colors',
                  phase.kind === 'dragging' ? 'text-white' : 'text-blue-500',
                )} />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-800">
                  {phase.kind === 'dragging' ? 'Drop to upload' : 'Drag & drop your file here'}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  or <span className="text-blue-600 font-medium group-hover:underline underline-offset-2">browse from computer</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">.xlsx / .xls files only</p>
              </div>

              {/* Expected columns */}
              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                {hints.map(h => (
                  <span
                    key={h}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono border border-gray-200"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Uploading ── */}
          {phase.kind === 'uploading' && (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-4 w-full"
            >
              <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-800">Parsing your file…</p>
                <p className="text-sm text-gray-500 mt-0.5">{phase.progress}% complete</p>
              </div>
              <div className="w-full max-w-[240px] h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${phase.progress}%` }}
                  transition={{ ease: 'linear', duration: 0.1 }}
                />
              </div>
            </motion.div>
          )}

          {/* ── Success ── */}
          {phase.kind === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="flex flex-col items-center gap-4"
            >
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.05 }}
                className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center"
              >
                <CheckCircle2 className="h-9 w-9 text-emerald-500" strokeWidth={1.75} />
              </motion.div>
              <div>
                <p className="text-base font-semibold text-emerald-700">File parsed successfully</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-medium text-gray-700">{phase.storeCount} stores</span> across{' '}
                  <span className="font-medium text-gray-700">{phase.months.length} months</span> detected
                </p>
                {phase.months.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {phase.months[0]} → {phase.months[phase.months.length - 1]}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Error ── */}
          {phase.kind === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: [0, -8, 8, -5, 5, -2, 2, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
                <XCircle className="h-9 w-9 text-red-500" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-base font-semibold text-red-700">Upload failed</p>
                <p className="text-sm text-gray-500 mt-1 max-w-[280px] leading-relaxed">{phase.message}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onRetry() }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
              >
                Try again
              </button>
            </motion.div>
          )}

          {/* ── Confirm replace ── */}
          {phase.kind === 'confirm' && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center">
                <AlertCircle className="h-9 w-9 text-amber-500" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-base font-semibold text-amber-700">Data already loaded</p>
                <p className="text-sm text-gray-500 mt-1">{phase.existing.filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {phase.existing.record_count} stores loaded this session
                </p>
              </div>
              <p className="text-sm text-gray-600">Replace with the new file?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); onRetry() }}
                  className="px-4 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onConfirmReplace?.() }}
                  className="px-4 py-1.5 rounded-lg text-sm bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium shadow-sm"
                >
                  Replace
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

// ── UploadScreen ──────────────────────────────────────────────────────────────

interface UploadScreenProps {
  onReady: () => void
}

const IDLE: ZonePhase = { kind: 'idle' }

const FEATURES = [
  { icon: BarChart2, label: 'Revenue Trends', desc: 'Month-on-month performance across all stores' },
  { icon: Zap, label: 'Store Rankings', desc: 'Rising stars, fallen stores, top movers' },
  { icon: ShieldCheck, label: 'Target Tracking', desc: 'DS & DSG achievement vs monthly budgets' },
]

export default function UploadScreen({ onReady }: UploadScreenProps) {
  const [salesPhase, setSalesPhase] = useState<ZonePhase>(IDLE)
  const [isDemoLoading, setIsDemoLoading] = useState(false)
  const pendingSalesFile = useRef<File | null>(null)

  const salesReady = salesPhase.kind === 'success'

  const handleSalesFile = useCallback(async (file: File, force = false) => {
    setSalesPhase({ kind: 'uploading', progress: 0 })
    try {
      const { data } = await uploadSales(file, pct =>
        setSalesPhase({ kind: 'uploading', progress: pct }), force,
      )
      if (data.needs_confirm && data.existing) {
        pendingSalesFile.current = file
        setSalesPhase({ kind: 'confirm', existing: data.existing })
        return
      }
      setSalesPhase({ kind: 'success', storeCount: data.stores, months: data.months })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })
          .response?.data?.detail ?? 'Upload failed. Check the file format.'
      setSalesPhase({ kind: 'error', message: msg })
    }
  }, [])

  const handleConfirmReplace = useCallback(async () => {
    const file = pendingSalesFile.current
    if (!file) return
    pendingSalesFile.current = null
    await handleSalesFile(file, true)
  }, [handleSalesFile])

  const handleLoadDemo = useCallback(async () => {
    setIsDemoLoading(true)
    setSalesPhase({ kind: 'uploading', progress: 60 })
    try {
      const { data } = await loadDemoData()
      setSalesPhase({ kind: 'success', storeCount: data.stores, months: data.months })
    } catch {
      setSalesPhase({ kind: 'error', message: 'Could not reach the backend. Is it running?' })
    } finally {
      setIsDemoLoading(false)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 overflow-y-auto">

      {/* Subtle gradient backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-blue-400/8 blur-[100px]" />
        <div className="absolute top-1/2 -left-40 h-[400px] w-[400px] rounded-full bg-cyan-400/6 blur-[90px]" />
        <div className="absolute bottom-0 right-1/3 h-[300px] w-[300px] rounded-full bg-indigo-400/5 blur-[80px]" />
      </div>

      {/* Top nav strip — same as dashboard */}
      <header className="sticky top-0 z-50 h-14 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="flex items-center h-full px-6 max-w-screen-2xl mx-auto gap-3">
          <span className="shrink-0 inline-flex items-center justify-center px-3 h-8 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 text-white text-sm font-bold tracking-wide select-none shadow-sm">
            CR
          </span>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-none">Croma Analytics</p>
            <p className="text-[10px] text-gray-400 leading-tight mt-0.5 tracking-wide">DS · DSG Store Intelligence</p>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-14 min-h-[calc(100vh-56px)]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-2xl"
        >

          {/* ── Hero ── */}
          <div className="text-center mb-10">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.05 }}
              className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold tracking-wide shadow-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              Session-based · Data clears on refresh
            </motion.div>

            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-tight">
              Upload Sales Data<br />
              <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                to Begin Analysis
              </span>
            </h1>
            <p className="mt-3 text-base text-gray-500 max-w-sm mx-auto leading-relaxed">
              Load your DS &amp; DSG sales file to unlock the full intelligence dashboard
            </p>
          </div>

          {/* ── Upload card ── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl shadow-gray-200/60 p-6">

            {/* Upload zone header */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-sm">
                <FileSpreadsheet className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Sales File</p>
                <p className="text-xs text-gray-400">Required to proceed · .xlsx / .xls</p>
              </div>
            </div>

            <UploadZone
              phase={salesPhase}
              onFile={handleSalesFile}
              onRetry={() => setSalesPhase(IDLE)}
              onConfirmReplace={handleConfirmReplace}
            />

            {/* Action row */}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={handleLoadDemo}
                disabled={isDemoLoading}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
                  'border border-gray-200 bg-white text-gray-600',
                  'hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 shadow-sm',
                  isDemoLoading && 'opacity-60 cursor-not-allowed',
                )}
              >
                {isDemoLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  : <Sparkles className="h-3.5 w-3.5 text-amber-500" />}
                {isDemoLoading ? 'Loading sample data…' : 'Load Sample Data'}
              </button>

              <AnimatePresence>
                {salesReady && (
                  <motion.button
                    initial={{ opacity: 0, x: 12, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    onClick={onReady}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:brightness-105 hover:shadow-blue-500/35 active:scale-[0.98] transition-all"
                  >
                    Enter Dashboard
                    <span className="text-base leading-none">→</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {!salesReady && (
              <p className="mt-4 text-center text-xs text-gray-400">
                No files yet?{' '}
                <button
                  onClick={handleLoadDemo}
                  className="text-blue-500 hover:text-blue-600 font-medium underline underline-offset-2 transition-colors"
                >
                  Load sample data
                </button>{' '}
                to explore with demo data. Target files are managed in{' '}
                <span className="text-gray-500 font-medium">Target Tracker</span>.
              </p>
            )}
          </div>

          {/* ── Feature teaser cards ── */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {FEATURES.map(({ icon: Icon, label, desc }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 + i * 0.07, ease: 'easeOut' }}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 shadow-sm"
              >
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 flex items-center justify-center mb-2">
                  <Icon className="h-4 w-4 text-blue-500" />
                </div>
                <p className="text-xs font-semibold text-gray-800">{label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>

        </motion.div>
      </div>

      {/* Footer strip — same as dashboard */}
      <footer className="fixed bottom-0 inset-x-0 z-20 h-9 flex items-center justify-center border-t border-gray-200 bg-white/95 backdrop-blur-sm">
        <span className="text-[10px] font-medium tracking-[0.18em] uppercase text-gray-400 select-none">
          Croma Analytics · DS &amp; DSG Store Intelligence Platform
        </span>
      </footer>
    </div>
  )
}
