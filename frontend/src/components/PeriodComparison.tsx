import { motion } from 'framer-motion'

interface ComparisonData {
  needsChange: number
  wantsChange: number
  assetsChange: number
  periodLabel: string
  previousPeriodLabel: string
}

interface PeriodComparisonProps {
  comparison: ComparisonData | null
}

export default function PeriodComparison({ comparison }: PeriodComparisonProps) {
  if (!comparison) {
    return null
  }

  const formatChange = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    const color = value >= 0 ? 'text-green-400' : 'text-red-400'
    const arrow = value >= 0 ? '↑' : '↓'
    return <span className={color}>{arrow} {sign}{Math.abs(value).toFixed(1)}%</span>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700/50"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📊</span>
        <h3 className="text-sm font-semibold text-gray-300">Period Comparison</h3>
      </div>
      <div className="text-xs text-gray-400 mb-3">
        {comparison.periodLabel} vs {comparison.previousPeriodLabel}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Needs</span>
          {formatChange(comparison.needsChange)}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Wants</span>
          {formatChange(comparison.wantsChange)}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Savings</span>
          {formatChange(comparison.assetsChange)}
        </div>
      </div>
    </motion.div>
  )
}

