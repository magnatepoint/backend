import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface ForecastItem {
  category: string
  category_name: string
  predicted_amount: number
  last_amount: number
  change_percentage: number
  method: string
  confidence: number
  data_points: number
}

interface ForecastPanelProps {
  forecasts: ForecastItem[]
  nextMonthLabel?: string | null
  loading?: boolean
}

export function ForecastPanel({ forecasts, nextMonthLabel, loading }: ForecastPanelProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/4" />
          <div className="h-24 bg-gray-700 rounded" />
        </div>
      </div>
    )
  }

  if (!forecasts || forecasts.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-2 flex items-center gap-2">
          <span>🔮</span> Next-Month Forecast
        </h3>
        <p className="text-gray-400 text-sm">Not enough data yet to generate a forecast. Keep logging your transactions!</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-yellow-400 flex items-center gap-2">
          <span>🔮</span> Next-Month Forecast
        </h3>
        {nextMonthLabel && (
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            Target Month: {new Date(nextMonthLabel).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
        )}
      </div>
      <div className="space-y-3">
        {forecasts.slice(0, 6).map((item, idx) => {
          const isRising = item.change_percentage >= 0
          return (
            <motion.div
              key={item.category}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-4 bg-gray-700/40 rounded-lg border border-gray-700 hover:border-yellow-500/40 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-white font-semibold">{item.category_name}</div>
                <div className={`text-sm font-bold ${isRising ? 'text-red-400' : 'text-green-400'}`}>
                  {isRising ? '▲' : '▼'} {Math.abs(item.change_percentage).toFixed(1)}%
                </div>
              </div>
              <div className="flex items-end justify-between text-sm text-gray-300">
                <div>
                  <div className="text-xs text-gray-400">Predicted</div>
                  <div className="text-lg font-bold text-yellow-400">{formatCurrency(item.predicted_amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 text-right">Last Month</div>
                  <div className="text-right text-white">{formatCurrency(item.last_amount)}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400 flex items-center justify-between">
                <span>Confidence: {(item.confidence * 100).toFixed(0)}%</span>
                <span>Data points: {item.data_points}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

