import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface CategoryTrend {
  category: string
  category_name: string
  change_percentage: number
  trend: string
  data: Array<{
    month: string
    spend: number
  }>
}

interface CategoryTrendChartProps {
  trends: CategoryTrend[]
  loading?: boolean
}

export function CategoryTrendChart({ trends, loading }: CategoryTrendChartProps) {
  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse h-64 bg-gray-700 rounded"></div>
      </div>
    )
  }

  if (!trends || trends.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-yellow-400 mb-4">Category Trends</h3>
        <p className="text-gray-400">No trend data available yet.</p>
      </div>
    )
  }

  // Prepare data for Recharts (group by month)
  const monthMap = new Map<string, Record<string, number>>()
  
  trends.forEach(trend => {
    trend.data.forEach(({ month, spend }) => {
      if (!monthMap.has(month)) {
        monthMap.set(month, { month })
      }
      monthMap.get(month)![trend.category_name] = spend
    })
  })

  const chartData = Array.from(monthMap.values()).sort((a, b) => 
    a.month.localeCompare(b.month)
  )

  // Color palette
  const colors = [
    '#fbbf24', '#f59e0b', '#ef4444', '#10b981', '#3b82f6',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16'
  ]

  return (
    <motion.div
      className="bg-gray-800 rounded-xl p-6 border border-gray-700"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-lg font-bold text-yellow-400 mb-4">Category Trends Over Time</h3>
      
      {/* Trend Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {trends.slice(0, 4).map((trend, idx) => (
          <motion.div
            key={idx}
            className="bg-gray-700/50 rounded-lg p-3"
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <div className="text-sm text-gray-400 mb-1">{trend.category_name}</div>
            <div className={`text-lg font-bold ${trend.change_percentage > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {trend.trend} {Math.abs(trend.change_percentage).toFixed(1)}%
            </div>
          </motion.div>
        ))}
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
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
            {trends.slice(0, 6).map((trend, idx) => (
              <Line
                key={trend.category}
                type="monotone"
                dataKey={trend.category_name}
                stroke={colors[idx % colors.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}

