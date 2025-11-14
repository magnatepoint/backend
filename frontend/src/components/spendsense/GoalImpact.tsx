import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface Goal {
  goal_id: string
  goal_name: string
  target_amount: number
  current_amount: number
  progress_percentage: number
  target_date: string | null
  impact_message: string
}

interface GoalImpactProps {
  goals: Goal[]
  loading?: boolean
  message?: string
}

export function GoalImpact({ goals, loading, message }: GoalImpactProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/3"></div>
          <div className="h-20 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (message || !goals || goals.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
          <span>🎯</span> Goal Impact
        </h3>
        <p className="text-gray-400">{message || 'No active goals found. Create goals in GoalCompass to see their impact on your spending.'}</p>
      </div>
    )
  }

  return (
    <motion.div
      className="bg-gray-800 rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
        <span>🎯</span> Goal Impact
      </h3>
      <div className="space-y-4">
        {goals.map((goal) => {
          const progress = Math.min(goal.progress_percentage, 100)
          const isOnTrack = progress >= 80
          
          return (
            <motion.div
              key={goal.goal_id}
              className="p-4 rounded-lg bg-gray-700/30 border border-gray-600"
              whileHover={{ y: -4 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <div className="font-semibold text-white mb-1">{goal.goal_name}</div>
                  {goal.target_date && (
                    <div className="text-xs text-gray-400">
                      Target: {new Date(goal.target_date).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </div>
                  )}
                </div>
                <div className={`text-lg font-bold ${isOnTrack ? 'text-green-400' : 'text-yellow-400'}`}>
                  {progress.toFixed(1)}%
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Current: {formatCurrency(goal.current_amount)}</span>
                  <span>Target: {formatCurrency(goal.target_amount)}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      isOnTrack ? 'bg-green-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              <p className="text-sm text-gray-300">{goal.impact_message}</p>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

