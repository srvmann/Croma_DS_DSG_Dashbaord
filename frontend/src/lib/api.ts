import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000',
})

export interface StoreRecord {
  store_id: string
  store_name?: string
  state?: string
  category?: string                          // store tier: A+ / A / B / C / D
  monthly_sales: Record<string, number>      // DS + DSG combined
  monthly_sales_ds?: Record<string, number>  // Device Secure only
  monthly_sales_dsg?: Record<string, number> // Device Secure Gold only
  target?: number | null                     // OOW budget for the target month
  zonal_manager?: string
  cluster_manager?: string
}

export interface DashboardData {
  no_data: boolean
  stores: StoreRecord[]
  months: string[]
  states: string[]
  categories: string[]
  has_targets: boolean
  target_month?: string | null  // e.g. 'Jun-2026' — the month the target file covers
  warnings: string[]
}

export const getDashboardData = () => api.get<DashboardData>('/api/data')

export interface UploadSalesResult {
  ok: boolean
  stores: number
  months: string[]
}
export interface UploadTargetsResult {
  ok: boolean
  stores: number
}

export const uploadSales = (
  file: File,
  onProgress?: (pct: number) => void,
) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<UploadSalesResult>('/api/upload/sales', form, {
    onUploadProgress: e =>
      onProgress?.(Math.round((e.loaded * 100) / (e.total ?? 1))),
  })
}

export const uploadTargets = (
  file: File,
  onProgress?: (pct: number) => void,
) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<UploadTargetsResult>('/api/upload/targets', form, {
    onUploadProgress: e =>
      onProgress?.(Math.round((e.loaded * 100) / (e.total ?? 1))),
  })
}

export const loadDemoData = () =>
  api.post<UploadSalesResult>('/api/demo/load')

// ── Target management ─────────────────────────────────────────────────────────

export interface TargetFileRecord {
  month: string
  filename: string
  store_count: number
  uploaded_at: string
  file_size_kb: number
  status: 'active' | 'inactive' | 'archived'
}

export const listTargets = () =>
  api.get<{ targets: TargetFileRecord[] }>('/api/targets/list')

export const uploadManagedTarget = (
  file: File,
  monthLabel: string,
  onProgress?: (pct: number) => void,
) => {
  const form = new FormData()
  form.append('file', file)
  form.append('month_label', monthLabel)
  return api.post<TargetFileRecord>('/api/targets/upload', form, {
    onUploadProgress: e =>
      onProgress?.(Math.round((e.loaded * 100) / (e.total ?? 1))),
  })
}

export const setActiveTarget = (month: string) =>
  api.post<TargetFileRecord>('/api/targets/set-active', { month })

export const archiveTarget = (month: string) =>
  api.post<TargetFileRecord>('/api/targets/archive', { month })

export const uploadFile = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<{ filename: string; sheets: string[] }>('/api/upload', form)
}

export const getSheetData = (sheet: string) =>
  api.get<{
    columns: string[]
    rows: Record<string, unknown>[]
    shape: { rows: number; columns: number }
  }>(`/api/data/${encodeURIComponent(sheet)}`)

export const getAnalysis = (sheet: string) =>
  api.get<{
    numeric_columns: string[]
    categorical_columns: string[]
    shape: { rows: number; columns: number }
    kpis: Record<string, { sum: number; mean: number; min: number; max: number }>
    bar_charts: Array<{ title: string; x: string[]; y: number[]; x_label: string; y_label: string }>
    distributions: Array<{ title: string; column: string; data: number[] }>
  }>(`/api/analysis/${encodeURIComponent(sheet)}`)
