import { motion } from 'framer-motion'

export type PaymentMode = 'UPI' | 'Card' | 'Bank Transfer' | 'Cash' | 'All'
export type MerchantType = 'Online' | 'Offline' | 'All'
export type Location = 'All'

interface FilterOption {
  label: string
  value: string
  count?: number
}

export interface FilterChipsProps {
  title: string
  options: FilterOption[]
  selected: string[]
  onToggle: (value: string) => void
}

export function FilterChips({
  title,
  options,
  selected,
  onToggle
}: FilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-400 font-medium">{title}:</span>
      {options.map((option) => {
        const isSelected = selected.includes(option.value)
        return (
          <motion.button
            key={option.value}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onToggle(option.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              isSelected
                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-75">({option.count})</span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
