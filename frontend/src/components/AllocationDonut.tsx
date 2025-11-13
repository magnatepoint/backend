import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import { motion } from 'framer-motion'

interface AllocationData {
  name: string
  value: number
  color: string
}

interface AllocationDonutProps {
  data: AllocationData[]
  title?: string
}

const COLORS = {
  needs: '#3b82f6',
  wants: '#d4af37',
  assets: '#22c55e'
}

export default function AllocationDonut({ data, title = 'Budget Allocation' }: AllocationDonutProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">{title}</h3>
        <p className="text-xs text-gray-500">No allocation data</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700/50"
    >
      <h3 className="text-sm font-semibold text-gray-300 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data as any}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(props: PieLabelRenderProps) => {
              const { name, percent } = props
              if (!name) return ''
              return `${name} ${(((percent ?? 0)) * 100).toFixed(0)}%`
            }}
            outerRadius={70}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
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
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  )
}

export { COLORS as AllocationColors }

