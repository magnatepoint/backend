import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { motion } from 'framer-motion'

interface TrendData {
  period: string
  spent: number
  plan: number
  savings?: number
}

interface TrendChartProps {
  data: TrendData[]
  title?: string
  showSavings?: boolean
}

export default function TrendChart({ data, title = 'Spending Trend', showSavings = false }: TrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">{title}</h3>
        <p className="text-xs text-gray-500">No trend data available</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700/50"
    >
      <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#d4af37" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorPlan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#555" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#555" stopOpacity={0} />
            </linearGradient>
            {showSavings && (
              <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            )}
          </defs>
          <XAxis
            dataKey="period"
            tick={{ fill: '#a3a3a3', fontSize: 10 }}
            axisLine={{ stroke: '#555' }}
          />
          <YAxis
            tick={{ fill: '#a3a3a3', fontSize: 10 }}
            axisLine={{ stroke: '#555' }}
            tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#e5e7eb'
            }}
            formatter={(value: number) => `₹${value.toLocaleString()}`}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#a3a3a3' }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="spent"
            stroke="#d4af37"
            fillOpacity={1}
            fill="url(#colorSpent)"
            name="Spent"
          />
          <Area
            type="monotone"
            dataKey="plan"
            stroke="#555"
            fillOpacity={1}
            fill="url(#colorPlan)"
            name="Planned"
          />
          {showSavings && (
            <Area
              type="monotone"
              dataKey="savings"
              stroke="#22c55e"
              fillOpacity={1}
              fill="url(#colorSavings)"
              name="Savings"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  )
}

