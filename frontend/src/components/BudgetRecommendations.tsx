import { useState } from 'react'
import { apiClient } from '../lib/api'

interface Recommendation {
  plan_code: string
  score: number
  needs_budget_pct: number
  wants_budget_pct: number
  savings_budget_pct: number
  recommendation_reason: string
  period_id: string | null
}

interface BudgetRecommendationsProps {
  items: Recommendation[]
  periodId: string
  onCommit?: () => void
}

export default function BudgetRecommendations({ items, periodId, onCommit }: BudgetRecommendationsProps) {
  const [committing, setCommitting] = useState<string | null>(null)

  const handleCommit = async (planCode: string) => {
    try {
      setCommitting(planCode)
      await apiClient.commitFromRecommendation(periodId, planCode)
      if (onCommit) onCommit()
    } catch (error) {
      console.error('Failed to commit plan:', error)
    } finally {
      setCommitting(null)
    }
  }

  if (!items || items.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50">
        <h3 className="font-semibold text-white mb-3">AI Plan Recommendations</h3>
        <p className="text-gray-400 text-sm">No recommendations available. Generate recommendations first.</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white">AI Plan Recommendations</h3>
      </div>
      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.plan_code} className="p-3 rounded-lg bg-gray-700/30 flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="font-medium text-white mb-1">
                {r.plan_code} <span className="text-gray-400 text-xs">(score {r.score.toFixed(2)})</span>
              </div>
              <div className="text-gray-400 text-xs mb-2">
                N/W/A: {(r.needs_budget_pct * 100).toFixed(0)}% / {(r.wants_budget_pct * 100).toFixed(0)}% / {(r.savings_budget_pct * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500">{r.recommendation_reason}</div>
            </div>
            <button
              className="px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              onClick={() => handleCommit(r.plan_code)}
              disabled={committing === r.plan_code}
            >
              {committing === r.plan_code ? 'Committing...' : 'Commit'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

