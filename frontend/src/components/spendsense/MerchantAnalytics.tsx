import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface Merchant {
  merchant: string
  total_spending: number
  transaction_count: number
}

interface MerchantAnalyticsProps {
  merchants: Merchant[]
  loading?: boolean
}

export function MerchantAnalytics({ merchants, loading }: MerchantAnalyticsProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse h-64 bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (!merchants || merchants.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4">Merchant Analytics</h3>
        <p className="text-gray-400">No merchant data available yet.</p>
      </div>
    )
  }

  const top5 = merchants.slice(0, 5)
  const totalSpending = top5.reduce((sum, m) => sum + m.total_spending, 0)
  
  const chartData = top5.map(m => ({
    name: m.merchant,
    value: m.total_spending,
    percentage: (m.total_spending / totalSpending) * 100
  }))

  const colors = ['#fbbf24', '#f59e0b', '#ef4444', '#10b981', '#3b82f6']

  return (
    <motion.div
      className="bg-gray-800 rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-lg font-bold text-yellow-400 mb-4">Top 5 Merchants</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <motion.div
          className="h-64"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value: number) => formatCurrency(value)}
              />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Merchant List */}
        <div className="space-y-3">
          {top5.map((merchant, idx) => {
            const avgTicket = merchant.total_spending / merchant.transaction_count
            const percentage = (merchant.total_spending / totalSpending) * 100
            
            return (
              <motion.div
                key={idx}
                className="p-3 bg-gray-700/50 rounded-lg"
                whileHover={{ y: -4, rotate: idx % 2 === 0 ? -1 : 1 }}
                transition={{ type: 'spring', stiffness: 250, damping: 20 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-white">{merchant.merchant}</div>
                  <div className="text-lg font-bold text-yellow-400">
                    {formatCurrency(merchant.total_spending)}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>{merchant.transaction_count} transactions</span>
                  <span>Avg: {formatCurrency(avgTicket)}</span>
                  <span className="text-yellow-400 font-semibold">{percentage.toFixed(1)}%</span>
                </div>
                <div className="mt-2 w-full bg-gray-600 rounded-full h-1.5">
                  <div
                    className="bg-yellow-500 h-1.5 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

