import { motion } from 'framer-motion'

interface CategoryProgress {
  category: string
  spent: number
  plan: number
  icon?: string
}

interface CategoryMicrocardsProps {
  items: CategoryProgress[]
  band: 'needs' | 'wants' | 'assets'
}

const getBandIcon = (band: string) => {
  switch (band) {
    case 'needs':
      return '🛒'
    case 'wants':
      return '🎯'
    case 'assets':
      return '💰'
    default:
      return '📊'
  }
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, string> = {
    'Groceries': '🛒',
    'Transport': '🚗',
    'Dining': '🍽️',
    'Entertainment': '🎬',
    'Shopping': '🛍️',
    'Utilities': '⚡',
    'Housing': '🏠',
    'Medical': '🏥',
    'Education': '📚',
    'Savings': '💰',
    'Investments': '📈'
  }
  return icons[category] || '📊'
}

export default function CategoryMicrocards({ items, band }: CategoryMicrocardsProps) {
  if (!items || items.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{getBandIcon(band)}</span>
        <h4 className="text-xs font-semibold text-gray-400 uppercase">{band}</h4>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => {
          const pct = item.plan > 0 ? Math.round((item.spent / item.plan) * 100) : 0
          const over = item.spent > item.plan
          const icon = item.icon || getCategoryIcon(item.category)

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={`px-3 py-2 rounded-lg text-xs font-medium ${
                over
                  ? 'bg-red-900/20 border border-red-500/50 text-red-300'
                  : pct > 80
                  ? 'bg-yellow-900/20 border border-yellow-500/50 text-yellow-300'
                  : 'bg-gray-700/30 border border-gray-600/50 text-gray-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span>{icon}</span>
                <span className="font-semibold">{item.category}</span>
                <span className={over ? 'text-red-400' : pct > 80 ? 'text-yellow-400' : 'text-gray-400'}>
                  {pct}%
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

