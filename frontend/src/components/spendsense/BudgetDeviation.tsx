import React from 'react'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface Deviation {
  band: string
  category: string
  planned: number
  actual: number
  variance: number
  variance_percentage: number
  message: string
}

interface BudgetDeviationProps {
  deviations: Deviation[]
  loading?: boolean
  message?: string
}

export function BudgetDeviation({ deviations, loading, message }: BudgetDeviationProps) {
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

  if (message || !deviations || deviations.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
          <span>📊</span> Budget Deviation
        </h3>
        <p className="text-gray-400">{message || 'No budget data available. Create a budget in BudgetPilot first.'}</p>
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
        <span>📊</span> Budget Deviation
      </h3>
      <div className="space-y-4">
        {deviations.map((dev, idx) => {
          const isOver = dev.variance > 0
          const progress = dev.planned > 0 ? (dev.actual / dev.planned) * 100 : 0
          
          return (
            <motion.div
              key={idx}
              className="p-4 rounded-lg bg-gray-700/30 border border-gray-600"
              whileHover={{ y: -4 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-white">{dev.category}</div>
                  <div className="text-xs text-gray-400 mt-1 capitalize">{dev.band}</div>
                </div>
                <div className={`text-lg font-bold ${isOver ? 'text-red-400' : 'text-green-400'}`}>
                  {isOver ? '+' : ''}{formatCurrency(dev.variance)}
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Planned: {formatCurrency(dev.planned)}</span>
                  <span>Actual: {formatCurrency(dev.actual)}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isOver ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {progress.toFixed(1)}% of planned
                </div>
              </div>
              
              <p className="text-sm text-gray-300 mt-2">{dev.message}</p>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

