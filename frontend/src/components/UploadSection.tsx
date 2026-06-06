import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { FileSpreadsheet, Upload } from 'lucide-react'

interface Props {
  onUpload: (file: File) => void
  isLoading: boolean
}

export default function UploadSection({ onUpload, isLoading }: Props) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onUpload(file)
    },
    [onUpload],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center gap-10">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold tracking-tight text-white">
          Welcome to <span className="text-blue-400">StoreWise</span>
        </h1>
        <p className="mt-2 text-lg text-gray-400">
          Upload any Excel file to explore and visualize your data instantly
        </p>
      </motion.div>

      <motion.label
        htmlFor="file-upload"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          'flex w-full max-w-lg cursor-pointer flex-col items-center gap-5 rounded-2xl border-2 border-dashed p-14 text-center transition-all duration-200',
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-700 bg-gray-900/50 hover:border-gray-500',
          isLoading ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input
          id="file-upload"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleChange}
          disabled={isLoading}
        />

        <motion.div
          animate={{ y: isDragging ? -6 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="rounded-full bg-gray-800 p-4">
            {isLoading ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
            ) : isDragging ? (
              <FileSpreadsheet className="h-8 w-8 text-blue-400" />
            ) : (
              <Upload className="h-8 w-8 text-gray-400" />
            )}
          </div>
          <div>
            <p className="font-medium text-white">
              {isLoading ? 'Uploading…' : 'Drop your Excel file here'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {isLoading ? 'Please wait' : 'or click to browse — .xlsx and .xls supported'}
            </p>
          </div>
        </motion.div>
      </motion.label>
    </div>
  )
}
