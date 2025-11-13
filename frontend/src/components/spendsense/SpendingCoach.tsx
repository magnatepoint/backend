import React from 'react'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface AdviceItem {
  category: string
  category_name: string
  change_percentage: number
  current_spend: number
  message: string
  potential_savings: number
  severity: 'high' | 'medium'
}

interface SpendingCoachProps {
  advice: AdviceItem[]
  loading?: boolean
}

export function SpendingCoach({ advice, loading }: SpendingCoachProps) {
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

  if (!advice || advice.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
          <span>🤖</span> AI Spending Coach
        </h3>
        <p className="text-gray-400">No spending insights available yet. Keep tracking your expenses!</p>
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
        <span>🤖</span> AI Spending Coach
      </h3>
      <div className="space-y-4">
        {advice.map((item, idx) => (
          <motion.div
            key={idx}
            className={`p-4 rounded-lg border ${
              item.severity === 'high'
                ? 'bg-red-900/20 border-red-500/30'
                : 'bg-orange-900/20 border-orange-500/30'
            }`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <div className="flex items-start gap-3">
              <div className={`text-2xl ${item.severity === 'high' ? 'text-red-400' : 'text-orange-400'}`}>
                {item.severity === 'high' ? '⚠️' : '💡'}
              </div>
              <div className="flex-1">
                <p className="text-white font-medium mb-1">{item.message}</p>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-gray-400">
                    Change: <span className="text-red-400 font-semibold">+{item.change_percentage.toFixed(1)}%</span>
                  </span>
                  <span className="text-gray-400">
                    Potential Savings: <span className="text-green-400 font-semibold">{formatCurrency(item.potential_savings)}</span>
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

