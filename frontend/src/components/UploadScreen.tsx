import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Target,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { loadDemoData, uploadSales, uploadTargets } from '@/lib/api'
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
type ZonePhase =
  | { kind: 'idle' }
  | { kind: 'dragging' }
  | { kind: 'uploading'; progress: number }
  | ZoneSuccess
  | ZoneError

// ── UploadZone ────────────────────────────────────────────────────────────────

interface UploadZoneProps {
  title: string
  subtitle: string
  icon: React.ReactNode
  hints: string[]
  isOptional: boolean
  phase: ZonePhase
  onFile: (file: File) => void
  onRetry: () => void
}

function UploadZone({
  title, subtitle, icon, hints, isOptional, phase, onFile, onRetry,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (phase.kind === 'idle') onFile // just mark dragging via state
  }, [phase.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDraggingCapable = phase.kind === 'idle' || phase.kind === 'dragging'

  const handleZoneDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDraggingCapable) return
    dragCounter.current++
    if (dragCounter.current === 1) {
      // signal parent-level — handled via zone local state trick below
    }
  }
  const handleZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDraggingCapable) return
    dragCounter.current--
  }
  const handleZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
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

  const borderStyle = cn(
    'rounded-xl border-2 border-dashed transition-all duration-200 relative overflow-hidden',
    phase.kind === 'idle' && 'border-white/10 bg-white/[0.025] hover:border-blue-500/40 hover:bg-blue-500/5 cursor-pointer',
    phase.kind === 'dragging' && 'border-blue-500/70 bg-blue-500/10 ring-2 ring-blue-500/25 cursor-copy',
    phase.kind === 'uploading' && 'border-blue-400/30 bg-blue-500/5 cursor-default',
    phase.kind === 'success' && 'border-emerald-500/40 bg-emerald-500/5 cursor-default',
    phase.kind === 'error' && 'border-red-500/40 bg-red-500/5 cursor-pointer',
  )

  return (
    <div
      className={borderStyle}
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

      <div className="p-6 min-h-[260px] flex flex-col">
        {/* Zone header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-blue-400/70">{icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white/90">{title}</h3>
                {isOptional && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                    optional
                  </span>
                )}
              </div>
              <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
            </div>
          </div>
        </div>

        {/* Phase content */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {/* ── Idle / Dragging ── */}
            {(phase.kind === 'idle' || phase.kind === 'dragging') && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <div className={cn(
                  'h-12 w-12 rounded-xl flex items-center justify-center transition-all',
                  phase.kind === 'dragging'
                    ? 'bg-blue-500/20 ring-2 ring-blue-500/40 scale-110'
                    : 'bg-white/5',
                )}>
                  <UploadCloud className={cn(
                    'h-6 w-6 transition-colors',
                    phase.kind === 'dragging' ? 'text-blue-400' : 'text-white/30',
                  )} />
                </div>
                <div>
                  <p className="text-sm text-white/60">
                    {phase.kind === 'dragging' ? 'Drop to upload' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-xs text-white/25 mt-0.5">.xlsx / .xls</p>
                </div>

                {/* Column hints */}
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {hints.map(h => (
                    <span
                      key={h}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/35 font-mono"
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
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-3 w-full"
              >
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
                <p className="text-sm text-white/60">Uploading… {phase.progress}%</p>
                <div className="w-full max-w-[180px] h-1 rounded-full bg-white/10 overflow-hidden">
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
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.05 }}
                >
                  <CheckCircle2 className="h-12 w-12 text-emerald-400" strokeWidth={1.5} />
                </motion.div>
                <div>
                  <p className="text-sm font-semibold text-emerald-300">Uploaded successfully</p>
                  <p className="text-xs text-white/50 mt-1">
                    {phase.storeCount} store{phase.storeCount !== 1 ? 's' : ''} detected
                    {phase.months.length > 0 && (
                      <> &middot; {phase.months.length} month{phase.months.length !== 1 ? 's' : ''}</>
                    )}
                  </p>
                  {phase.months.length > 0 && (
                    <p className="text-[10px] text-white/30 mt-1">
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
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: [0, -10, 10, -7, 7, -3, 3, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <XCircle className="h-10 w-10 text-red-400" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-semibold text-red-300">Upload failed</p>
                  <p className="text-xs text-white/45 mt-1 max-w-[200px] leading-relaxed">
                    {phase.message}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onRetry() }}
                  className="mt-1 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                >
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── UploadScreen ──────────────────────────────────────────────────────────────

interface UploadScreenProps {
  onReady: () => void
}

const IDLE: ZonePhase = { kind: 'idle' }

export default function UploadScreen({ onReady }: UploadScreenProps) {
  const [salesPhase, setSalesPhase] = useState<ZonePhase>(IDLE)
  const [targetsPhase, setTargetsPhase] = useState<ZonePhase>(IDLE)
  const [isDemoLoading, setIsDemoLoading] = useState(false)

  const salesReady = salesPhase.kind === 'success'

  // ── File handlers ──

  const handleSalesFile = useCallback(async (file: File) => {
    setSalesPhase({ kind: 'uploading', progress: 0 })
    try {
      const { data } = await uploadSales(file, pct =>
        setSalesPhase({ kind: 'uploading', progress: pct }),
      )
      setSalesPhase({ kind: 'success', storeCount: data.stores, months: data.months })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })
          .response?.data?.detail ?? 'Upload failed. Check the file format.'
      setSalesPhase({ kind: 'error', message: msg })
    }
  }, [])

  const handleTargetsFile = useCallback(async (file: File) => {
    setTargetsPhase({ kind: 'uploading', progress: 0 })
    try {
      const { data } = await uploadTargets(file, pct =>
        setTargetsPhase({ kind: 'uploading', progress: pct }),
      )
      setTargetsPhase({ kind: 'success', storeCount: data.stores, months: [] })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })
          .response?.data?.detail ?? 'Upload failed. Check the file format.'
      setTargetsPhase({ kind: 'error', message: msg })
    }
  }, [])

  // ── Demo data ──

  const handleLoadDemo = useCallback(async () => {
    setIsDemoLoading(true)
    setSalesPhase({ kind: 'uploading', progress: 60 })
    setTargetsPhase({ kind: 'uploading', progress: 60 })
    try {
      const { data } = await loadDemoData()
      setSalesPhase({ kind: 'success', storeCount: data.stores, months: data.months })
      setTargetsPhase({ kind: 'success', storeCount: data.stores, months: [] })
    } catch {
      setSalesPhase({ kind: 'error', message: 'Could not reach the backend. Is it running?' })
      setTargetsPhase(IDLE)
    } finally {
      setIsDemoLoading(false)
    }
  }, [])

  return (
    /* Full-screen dark navy gradient */
    <div className="fixed inset-0 bg-[#080f20] overflow-y-auto">
      {/* Ambient light blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-16 h-[500px] w-[500px] rounded-full bg-blue-700/10 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-16 h-[400px] w-[400px] rounded-full bg-cyan-600/8 blur-[100px]" />
        <div className="absolute top-2/3 left-1/3 h-[300px] w-[300px] rounded-full bg-indigo-700/6 blur-[80px]" />
      </div>

      <div className="relative z-10 flex min-h-full items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-3xl"
        >
          {/* ── Header ── */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center justify-center px-5 h-11 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 text-white text-base font-bold tracking-wide shadow-lg shadow-blue-500/20">
              SW
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Welcome to StoreWise
            </h1>
            <p className="mt-1.5 text-sm text-white/45">
              Upload your sales and target files to unlock the full analytics dashboard
            </p>
          </div>

          {/* ── Glass card ── */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">

            {/* Upload zones */}
            <div className="grid grid-cols-2 gap-4">
              <UploadZone
                title="Sales Data"
                subtitle="Required · .xlsx"
                icon={<FileSpreadsheet className="h-5 w-5" />}
                hints={['Store_ID', 'Store_Name', 'State', 'Category', 'Jan-2024', 'Feb-2024', '…']}
                isOptional={false}
                phase={salesPhase}
                onFile={handleSalesFile}
                onRetry={() => setSalesPhase(IDLE)}
              />
              <UploadZone
                title="Target File"
                subtitle="Optional · .xlsx"
                icon={<Target className="h-5 w-5" />}
                hints={['Store_ID', 'Monthly_Target']}
                isOptional={true}
                phase={targetsPhase}
                onFile={handleTargetsFile}
                onRetry={() => setTargetsPhase(IDLE)}
              />
            </div>

            {/* ── Action row ── */}
            <div className="mt-5 flex items-center justify-between">
              {/* Load Sample Data */}
              <button
                onClick={handleLoadDemo}
                disabled={isDemoLoading}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  'border border-white/10 bg-white/[0.04] text-white/60',
                  'hover:border-white/20 hover:bg-white/[0.07] hover:text-white/80',
                  isDemoLoading && 'opacity-60 cursor-not-allowed',
                )}
              >
                {isDemoLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Sparkles className="h-3.5 w-3.5 text-amber-400" />}
                {isDemoLoading ? 'Loading sample data…' : 'Load Sample Data'}
              </button>

              {/* Enter Dashboard — appears when sales is ready */}
              <AnimatePresence>
                {salesReady && (
                  <motion.button
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    onClick={onReady}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    Enter Dashboard
                    <span className="text-base leading-none">→</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Helper text */}
            {!salesReady && (
              <p className="mt-4 text-center text-xs text-white/20">
                Don't have your files yet?{' '}
                <button
                  onClick={handleLoadDemo}
                  className="text-blue-400/60 hover:text-blue-300 underline underline-offset-2 transition-colors"
                >
                  Load sample data
                </button>{' '}
                to explore the dashboard with demo data.
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
