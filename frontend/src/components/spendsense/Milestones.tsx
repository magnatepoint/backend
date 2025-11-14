import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface Milestone {
  id: string
  title: string
  description: string
  icon: string
  progress: number
  target: number
  achieved: boolean
  badge?: string
}

interface MilestonesProps {
  milestones: Milestone[]
  loading?: boolean
}

export function Milestones({ milestones, loading }: MilestonesProps) {
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

  if (!milestones || milestones.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
          <span>🏆</span> Milestones
        </h3>
        <p className="text-gray-400">Keep tracking to unlock milestones!</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
        <span>🏆</span> Milestones & Achievements
      </h3>
      <div className="space-y-4">
        {milestones.map((milestone, idx) => {
          const progressPercent = Math.min((milestone.progress / milestone.target) * 100, 100)
          const isAchieved = milestone.achieved || progressPercent >= 100

          return (
            <motion.div
              key={milestone.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-4 rounded-lg border ${
                isAchieved
                  ? 'bg-gradient-to-r from-yellow-900/30 to-yellow-800/20 border-yellow-500/50'
                  : 'bg-gray-700/30 border-gray-600'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">{milestone.icon}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-white flex items-center gap-2">
                        {milestone.title}
                        {isAchieved && milestone.badge && (
                          <span className="text-yellow-400">{milestone.badge}</span>
                        )}
                      </h4>
                      <p className="text-sm text-gray-400 mt-1">{milestone.description}</p>
                    </div>
                    {isAchieved && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-2xl"
                      >
                        ✅
                      </motion.div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>
                        {isAchieved ? 'Achieved!' : `${progressPercent.toFixed(0)}% complete`}
                      </span>
                      <span>
                        {formatCurrency(milestone.progress)} / {formatCurrency(milestone.target)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 1, delay: idx * 0.1 }}
                        className={`h-full rounded-full ${
                          isAchieved
                            ? 'bg-gradient-to-r from-yellow-500 to-yellow-400'
                            : 'bg-gradient-to-r from-blue-500 to-blue-400'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

