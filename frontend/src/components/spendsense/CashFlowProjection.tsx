import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface Projection {
  month: string
  projected_income: number
  projected_expenses: number
  projected_balance: number
  net_flow: number
}

interface CashFlowProjectionProps {
  current_balance: number
  average_monthly_income: number
  average_monthly_expenses: number
  projections: Projection[]
  loading?: boolean
  message?: string
}

export function CashFlowProjection({
  current_balance,
  average_monthly_income,
  average_monthly_expenses,
  projections,
  loading,
  message
}: CashFlowProjectionProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse h-64 bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (message || !projections || projections.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
          <span>📈</span> Cash Flow Projection
        </h3>
        <p className="text-gray-400">{message || 'Insufficient data for projection.'}</p>
      </div>
    )
  }

  const netFlow = average_monthly_income - average_monthly_expenses

  return (
    <motion.div
      className="bg-gray-800 rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
        <span>📈</span> Cash Flow Projection
      </h3>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Current Balance</div>
          <div className={`text-lg font-bold ${current_balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(current_balance)}
          </div>
        </motion.div>
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Avg Monthly Income</div>
          <div className="text-lg font-bold text-green-400">
            {formatCurrency(average_monthly_income)}
          </div>
        </motion.div>
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Avg Monthly Expenses</div>
          <div className="text-lg font-bold text-red-400">
            {formatCurrency(average_monthly_expenses)}
          </div>
        </motion.div>
        <motion.div className="bg-gray-700/50 rounded-lg p-3" whileHover={{ y: -4 }}>
          <div className="text-sm text-gray-400 mb-1">Net Monthly Flow</div>
          <div className={`text-lg font-bold ${netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(netFlow)}
          </div>
        </motion.div>
      </div>

      {/* Projection Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={projections}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="month" 
              stroke="#9ca3af"
              tickFormatter={(value) => {
                const [year, month] = value.split('-')
                return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
              }}
            />
            <YAxis 
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
            <Line
              type="monotone"
              dataKey="projected_balance"
              stroke="#fbbf24"
              strokeWidth={3}
              dot={{ r: 5 }}
              name="Projected Balance"
            />
            <Line
              type="monotone"
              dataKey="projected_income"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="Projected Income"
            />
            <Line
              type="monotone"
              dataKey="projected_expenses"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              name="Projected Expenses"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Projection Table */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400">Month</th>
              <th className="text-right py-2 text-gray-400">Income</th>
              <th className="text-right py-2 text-gray-400">Expenses</th>
              <th className="text-right py-2 text-gray-400">Net Flow</th>
              <th className="text-right py-2 text-gray-400">Balance</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((proj, idx) => (
              <tr key={idx} className="border-b border-gray-700/50">
                <td className="py-2 text-gray-300">{proj.month}</td>
                <td className="py-2 text-right text-green-400">{formatCurrency(proj.projected_income)}</td>
                <td className="py-2 text-right text-red-400">{formatCurrency(proj.projected_expenses)}</td>
                <td className={`py-2 text-right font-semibold ${proj.net_flow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(proj.net_flow)}
                </td>
                <td className={`py-2 text-right font-bold ${proj.projected_balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(proj.projected_balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

