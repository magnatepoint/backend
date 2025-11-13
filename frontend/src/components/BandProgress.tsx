import { motion } from 'framer-motion'
import { formatCurrency } from '../lib/utils'

interface BandProgressProps {
  label: string
  spent: number
  plan: number
}

export function BandProgress({ label, spent, plan }: BandProgressProps) {
  const pct = plan > 0 ? Math.min(100, Math.round((spent / plan) * 100)) : 0
  const over = spent > plan

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50 hover:border-yellow-500/30 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-300">{label}</span>
        <span className={`text-sm font-bold ${over ? 'text-red-400' : 'text-green-400'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2.5 w-full bg-gray-700 rounded-full overflow-hidden mb-2">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-2.5 rounded-full ${
            over
              ? 'bg-red-500'
              : 'bg-gradient-to-r from-yellow-500 to-yellow-600'
          }`}
          style={{
            boxShadow: over ? 'none' : '0 0 10px rgba(212, 175, 55, 0.5)'
          }}
        />
      </div>
      <div className="text-xs text-gray-400">
        {formatCurrency(spent)} / {formatCurrency(plan)}
      </div>
    </motion.div>
  )
}

