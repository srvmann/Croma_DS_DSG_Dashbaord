import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { getDashboardData, type StoreRecord } from '@/lib/api'

// ── Month-split logic ─────────────────────────────────────────────────────────
//
// Splits a chronologically sorted month array into early / recent halves for
// period-over-period comparison.
//
// Even count N  → earlyMonths = first N/2,  recentMonths = last N/2,  midMonth = null
// Odd  count N  → earlyMonths = first ⌊N/2⌋, midMonth = months[⌊N/2⌋],
//                 recentMonths = last ⌊N/2⌋
//
// Edge cases:
//   0 months → all empty, midMonth = null
//   1 month  → earlyMonths = [], recentMonths = [months[0]], midMonth = null

function splitMonths(months: string[]): {
  earlyMonths: string[]
  recentMonths: string[]
  midMonth: string | null
} {
  const n = months.length
  if (n === 0) return { earlyMonths: [], recentMonths: [], midMonth: null }
  if (n === 1) return { earlyMonths: [], recentMonths: [months[0]], midMonth: null }

  const half = Math.floor(n / 2)
  const isEven = n % 2 === 0

  return {
    earlyMonths: months.slice(0, half),
    recentMonths: isEven ? months.slice(half) : months.slice(half + 1),
    midMonth: isEven ? null : months[half],
  }
}

// ── Context shape ─────────────────────────────────────────────────────────────

export interface DataContextValue {
  // Raw data mirrored from /api/data
  stores: StoreRecord[]
  months: string[]
  states: string[]
  categories: string[]
  hasTargets: boolean
  warnings: string[]

  // Loading / error state
  isLoading: boolean
  error: string | null

  // Derived — true once stores have been uploaded and parsed
  hasData: boolean

  // Computed period split (derived from months[])
  earlyMonths: string[]    // first half of the time range
  recentMonths: string[]   // second half of the time range
  midMonth: string | null  // centre month when month count is odd, else null

  // Actions
  refetchData: () => Promise<void>
}

// ── Context + hook ────────────────────────────────────────────────────────────

const DataContext = createContext<DataContextValue | null>(null)

export function useDataContext(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useDataContext must be called inside <DataProvider>')
  return ctx
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [stores, setStores] = useState<StoreRecord[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [states, setStates] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [hasTargets, setHasTargets] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await getDashboardData()
      if (data.no_data) {
        // Reset to empty — triggers upload screen
        setStores([])
        setMonths([])
        setStates([])
        setCategories([])
        setHasTargets(false)
        setWarnings([])
      } else {
        setStores(data.stores)
        setMonths(data.months)
        setStates(data.states)
        setCategories(data.categories)
        setHasTargets(data.has_targets)
        setWarnings(data.warnings)
      }
    } catch {
      setError('Could not reach the backend. Make sure the server is running.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => { refetchData() }, [refetchData])

  const hasData = stores.length > 0

  // Memoised period split — only recomputed when months changes
  const { earlyMonths, recentMonths, midMonth } = useMemo(
    () => splitMonths(months),
    [months],
  )

  const value: DataContextValue = {
    stores,
    months,
    states,
    categories,
    hasTargets,
    warnings,
    isLoading,
    error,
    hasData,
    earlyMonths,
    recentMonths,
    midMonth,
    refetchData,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
