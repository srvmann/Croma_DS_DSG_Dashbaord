import { useCallback, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './components/Header'
import UploadSection from './components/UploadSection'
import SheetSelector from './components/SheetSelector'
import KPICards from './components/KPICards'
import ChartPanel from './components/ChartPanel'
import DataTable from './components/DataTable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { uploadFile, getSheetData, getAnalysis } from './lib/api'

type AnalysisData = Awaited<ReturnType<typeof getAnalysis>>['data']
type SheetData = Awaited<ReturnType<typeof getSheetData>>['data']

export default function App() {
  const [filename, setFilename] = useState<string | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [sheetData, setSheetData] = useState<SheetData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await uploadFile(file)
      setFilename(res.data.filename)
      setSheets(res.data.sheets)
      setSelectedSheet(null)
      setAnalysis(null)
      setSheetData(null)
    } catch {
      setError('Upload failed. Check the file format and try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSheetSelect = useCallback(async (sheet: string) => {
    setIsLoading(true)
    setError(null)
    setSelectedSheet(sheet)
    setAnalysis(null)
    setSheetData(null)
    try {
      const [analysisRes, dataRes] = await Promise.all([getAnalysis(sheet), getSheetData(sheet)])
      setAnalysis(analysisRes.data)
      setSheetData(dataRes.data)
    } catch {
      setError('Failed to load sheet data. The sheet may be empty or malformed.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleReset = () => {
    setFilename(null)
    setSheets([])
    setSelectedSheet(null)
    setAnalysis(null)
    setSheetData(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Header />

      <main className="container mx-auto max-w-7xl px-4 py-8">
        <AnimatePresence mode="wait">
          {!filename ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
            >
              <UploadSection onUpload={handleUpload} isLoading={isLoading} />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* File bar */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{filename}</h2>
                  <p className="text-sm text-gray-500">
                    {sheets.length} sheet{sheets.length !== 1 ? 's' : ''} detected
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="shrink-0 text-sm text-gray-500 transition-colors hover:text-gray-300"
                >
                  Upload different file
                </button>
              </div>

              <SheetSelector
                sheets={sheets}
                selected={selectedSheet}
                onSelect={handleSheetSelect}
                isLoading={isLoading}
              />

              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400"
                >
                  {error}
                </motion.div>
              )}

              {isLoading && (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
                </div>
              )}

              <AnimatePresence mode="wait">
                {analysis && sheetData && !isLoading && (
                  <motion.div
                    key={selectedSheet}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    <KPICards kpis={analysis.kpis} shape={analysis.shape} />

                    <Tabs defaultValue="charts">
                      <TabsList>
                        <TabsTrigger value="charts">Charts</TabsTrigger>
                        <TabsTrigger value="table">Data Table</TabsTrigger>
                      </TabsList>
                      <TabsContent value="charts" className="mt-4">
                        <ChartPanel
                          barCharts={analysis.bar_charts}
                          distributions={analysis.distributions}
                        />
                      </TabsContent>
                      <TabsContent value="table" className="mt-4">
                        <DataTable columns={sheetData.columns} rows={sheetData.rows} />
                      </TabsContent>
                    </Tabs>
                  </motion.div>
                )}
              </AnimatePresence>

              {!isLoading && !selectedSheet && (
                <div className="flex justify-center py-12 text-sm text-gray-600">
                  Select a sheet above to begin analysis
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
