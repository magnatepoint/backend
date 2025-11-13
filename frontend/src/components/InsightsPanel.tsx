import { motion } from 'framer-motion'

interface Insight {
  type: 'warning' | 'success' | 'info' | 'danger'
  icon: string
  title: string
  message: string
  value?: string
  action?: string
}

interface InsightsPanelProps {
  insights: Insight[]
}

export default function InsightsPanel({ insights }: InsightsPanelProps) {
  if (!insights || insights.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">AI Insights</h3>
        <p className="text-xs text-gray-500">No insights available yet</p>
      </div>
    )
  }

  const getColorClasses = (type: Insight['type']) => {
    switch (type) {
      case 'warning':
        return 'bg-yellow-900/20 border-yellow-500/50 text-yellow-300'
      case 'success':
        return 'bg-green-900/20 border-green-500/50 text-green-300'
      case 'danger':
        return 'bg-red-900/20 border-red-500/50 text-red-300'
      default:
        return 'bg-blue-900/20 border-blue-500/50 text-blue-300'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700/50"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🧠</span>
        <h3 className="text-sm font-semibold text-gray-300">AI Insights</h3>
      </div>
      <div className="space-y-3">
        {insights.map((insight, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`p-3 rounded-lg border ${getColorClasses(insight.type)}`}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{insight.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-sm mb-1">{insight.title}</div>
                <div className="text-xs opacity-90">{insight.message}</div>
                {insight.value && (
                  <div className="text-xs font-semibold mt-1">{insight.value}</div>
                )}
                {insight.action && (
                  <div className="text-xs mt-2 opacity-75">💡 {insight.action}</div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

