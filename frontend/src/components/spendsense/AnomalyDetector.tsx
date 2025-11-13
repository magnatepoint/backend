import React from 'react'
import { motion } from 'framer-motion'
import { formatCurrency, formatDate } from '../../lib/utils'

interface Anomaly {
  txn_id: string
  merchant: string
  amount: number
  date: string
  category: string
  category_name: string
  zscore: number
  message: string
}

interface AnomalyDetectorProps {
  anomalies: Anomaly[]
  loading?: boolean
}

export function AnomalyDetector({ anomalies, loading }: AnomalyDetectorProps) {
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

  if (!anomalies || anomalies.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
          <span>🔍</span> Anomaly Detection
        </h3>
        <p className="text-gray-400">No unusual spending patterns detected. All transactions look normal!</p>
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
        <span>🔍</span> Anomaly Detection
      </h3>
      <div className="space-y-3">
        {anomalies.map((anomaly, idx) => (
          <motion.div
            key={idx}
            className="p-4 rounded-lg bg-red-900/20 border border-red-500/30"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-white font-medium mb-1">{anomaly.message}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                  <span>{formatDate(anomaly.date)}</span>
                  <span className="px-2 py-0.5 bg-gray-700/50 rounded text-xs">
                    {anomaly.category_name}
                  </span>
                  <span className="text-red-400 font-semibold">
                    Z-score: {anomaly.zscore.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-red-400">
                  {formatCurrency(anomaly.amount)}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

