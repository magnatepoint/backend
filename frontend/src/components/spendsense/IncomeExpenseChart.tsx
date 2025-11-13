import React from 'react'
import { LineChart, Line, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface IncomeExpenseData {
  month: string
  income: number
  expenses: number
  net_savings: number
  cumulative_savings: number
}

interface IncomeExpenseChartProps {
  data: IncomeExpenseData[]
  loading?: boolean
}

export function IncomeExpenseChart({ data, loading }: IncomeExpenseChartProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse h-64 bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4">Income vs Expenses</h3>
        <p className="text-gray-400">No data available yet.</p>
      </div>
    )
  }

  return (
    <motion.div
      className="bg-gray-800 rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-lg font-bold text-yellow-400 mb-4">Income vs Expenses Overlay</h3>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Avg Monthly Income</div>
          <div className="text-lg font-bold text-green-400">
            {formatCurrency(data.reduce((sum, d) => sum + d.income, 0) / data.length)}
          </div>
        </motion.div>
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Avg Monthly Expenses</div>
          <div className="text-lg font-bold text-red-400">
            {formatCurrency(data.reduce((sum, d) => sum + d.expenses, 0) / data.length)}
          </div>
        </motion.div>
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Cumulative Savings</div>
          <div className="text-lg font-bold text-yellow-400">
            {formatCurrency(data[data.length - 1]?.cumulative_savings || 0)}
          </div>
        </motion.div>
      </div>

      {/* Dual-axis Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="month" 
              stroke="#9ca3af"
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
              }}
            />
            <YAxis 
              yAxisId="left"
              stroke="#9ca3af"
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
            />
            <YAxis 
              yAxisId="right"
              orientation="right"
              stroke="#9ca3af"
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend wrapperStyle={{ color: '#d1d5db', fontSize: '12px' }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="expenses"
              stroke="#ef4444"
              fillOpacity={1}
              fill="url(#colorExpenses)"
              name="Expenses"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="income"
              stroke="#fbbf24"
              strokeWidth={3}
              dot={{ r: 4 }}
              name="Income"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative_savings"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="Cumulative Savings"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

