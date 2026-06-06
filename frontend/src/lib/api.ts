import axios from 'axios'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000',
})

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
