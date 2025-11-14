import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { formatCurrency } from '../../lib/utils'

interface IncomeExpensePoint {
  month: string
  income: number
  expenses: number
  net_savings: number
  cumulative_savings: number
}

interface CashflowProjection {
  current_balance: number
  average_monthly_income: number
  average_monthly_expenses: number
  projections: Array<{
    month: string
    projected_balance: number
  }>
}

interface GamifiedMilestonesProps {
  incomeExpenseData?: IncomeExpensePoint[]
  cashflow?: CashflowProjection | null
  wantsTarget?: number
  currentWants?: number
}

export function GamifiedMilestones({
  incomeExpenseData,
  cashflow,
  wantsTarget = 25000,
  currentWants = 0
}: GamifiedMilestonesProps) {
  const { underBudgetStreak, wantsProgress, savingsStreak } = useMemo(() => {
    const data = incomeExpenseData || []
    const recentThree = data.slice(-3)
    const underBudget = recentThree.length === 3 && recentThree.every((point) => point.net_savings >= 0)
    const savings = data.slice(-6).filter((point) => point.net_savings >= 0).length

    const wantsPct = wantsTarget > 0 ? Math.min(100, Math.max(0, (wantsTarget - currentWants) / wantsTarget * 100 + (currentWants < wantsTarget ? 50 : 0))) : 0

    return {
      underBudgetStreak: underBudget,
      wantsProgress: Math.round(wantsPct),
      savingsStreak: savings
    }
  }, [incomeExpenseData, wantsTarget, currentWants])

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
        <span>🏅</span> Gamified Milestones
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          whileHover={{ y: -6, rotate: -1 }}
          className="p-4 rounded-lg border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-yellow-500/5"
        >
          <div className="text-2xl mb-2">{underBudgetStreak ? '🏆' : '🎯'}</div>
          <div className="text-white font-semibold">3 Months Under Budget</div>
          <p className="text-xs text-gray-400 mt-1">
            {underBudgetStreak
              ? 'Amazing! You have stayed under budget for the last 3 months.'
              : 'Stay consistent for 3 consecutive months to unlock this badge.'}
          </p>
        </motion.div>

        <motion.div
          whileHover={{ y: -6, rotate: 1 }}
          className="p-4 rounded-lg border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-white font-semibold">Reduce Wants Spending</div>
            <span className="text-sm font-bold text-emerald-400">{wantsProgress}%</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Goal: keep monthly Wants below {formatCurrency(wantsTarget)}.
          </p>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-emerald-400 transition-all"
              style={{ width: `${Math.min(wantsProgress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {wantsProgress >= 100 ? 'Target achieved — keep it up!' : 'You are on track. Small tweaks can close the gap.'}
          </p>
        </motion.div>

        <motion.div
          whileHover={{ y: -6, rotate: -1 }}
          className="p-4 rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5"
        >
          <div className="text-white font-semibold mb-2">Savings Streak</div>
          <p className="text-3xl font-bold text-blue-300">{savingsStreak}</p>
          <p className="text-xs text-gray-400">Positive cash-flow months out of the last 6.</p>
          {cashflow && cashflow.projections.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              Projected balance next month:{' '}
              <span className="text-blue-300 font-semibold">
                {formatCurrency(cashflow.projections[0]?.projected_balance || 0)}
              </span>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  )
}

