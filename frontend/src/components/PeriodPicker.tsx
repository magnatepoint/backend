import { useState } from 'react'

type PeriodType = 'monthly' | 'quarterly' | 'custom'

interface PeriodPickerProps {
  onPeriodChange: (type: PeriodType, start: string, end: string) => void
  defaultType?: PeriodType
}

export default function PeriodPicker({ onPeriodChange, defaultType = 'monthly' }: PeriodPickerProps) {
  const [periodType, setPeriodType] = useState<PeriodType>(defaultType)
  const [customStart, setCustomStart] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [customEnd, setCustomEnd] = useState<string>(() => {
    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
  })

  const handleTypeChange = (type: PeriodType) => {
    setPeriodType(type)
    const now = new Date()
    let start = ''
    let end = ''

    if (type === 'monthly') {
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    } else if (type === 'quarterly') {
      const quarter = Math.floor(now.getMonth() / 3)
      const quarterStartMonth = quarter * 3
      start = `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`
      const quarterEndMonth = quarterStartMonth + 3
      const lastDay = new Date(now.getFullYear(), quarterEndMonth, 0)
      end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    } else {
      start = customStart
      end = customEnd
    }

    onPeriodChange(type, start, end)
  }

  const handleCustomDateChange = () => {
    if (periodType === 'custom') {
      onPeriodChange('custom', customStart, customEnd)
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50">
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-300 mb-2">Period Type</label>
        <div className="flex gap-2">
          {(['monthly', 'quarterly', 'custom'] as PeriodType[]).map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                periodType === type
                  ? 'bg-yellow-500 text-black'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {periodType === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start Date</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value)
                setTimeout(handleCustomDateChange, 100)
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">End Date</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value)
                setTimeout(handleCustomDateChange, 100)
              }}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500"
            />
          </div>
        </div>
      )}

      {periodType !== 'custom' && (
        <div className="text-xs text-gray-400 mt-2">
          {periodType === 'monthly' && 'Current month period'}
          {periodType === 'quarterly' && 'Current quarter period'}
        </div>
      )}
    </div>
  )
}

