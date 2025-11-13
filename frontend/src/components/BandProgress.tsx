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
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400 uppercase tracking-wide">{label}</span>
        <span className={`text-sm font-semibold ${over ? 'text-red-400' : 'text-green-400'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full bg-gray-700/50 rounded-full overflow-hidden mb-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${over ? 'bg-red-500' : 'bg-yellow-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {formatCurrency(spent)} / {formatCurrency(plan)}
      </div>
    </div>
  )
}

