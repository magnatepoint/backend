import { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { apiClient } from '../lib/api'
import { formatCurrency } from '../lib/utils'

interface BudgetRecommendation {
  reco_id: string
  plan_code: string
  plan_name: string
  needs_budget_pct: number
  wants_budget_pct: number
  savings_budget_pct: number
  score: number
  recommendation_reason: string
}

interface BudgetCommit {
  user_id: string
  month: string
  plan_code: string
  alloc_needs_pct: number
  alloc_wants_pct: number
  alloc_assets_pct: number
  notes?: string
  committed_at: string
}

interface MonthlyAggregate {
  user_id: string
  month: string
  income_amt: number
  needs_amt: number
  planned_needs_amt: number
  variance_needs_amt: number
  wants_amt: number
  planned_wants_amt: number
  variance_wants_amt: number
  assets_amt: number
  planned_assets_amt: number
  variance_assets_amt: number
}

interface GoalAllocation {
  goal_id: string
  goal_name: string
  weight_pct: number
  planned_amount: number
}

export default function BudgetPilot() {
  const [recommendations, setRecommendations] = useState<BudgetRecommendation[]>([])
  const [commit, setCommit] = useState<BudgetCommit | null>(null)
  const [monthlyAggregate, setMonthlyAggregate] = useState<MonthlyAggregate | null>(null)
  const [goalAllocations, setGoalAllocations] = useState<GoalAllocation[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [committing, setCommitting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [notes, setNotes] = useState<{ [key: string]: string }>({})

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [recommendationsData, commitData, aggregateData, allocationsData] = await Promise.all([
        apiClient.getBudgetRecommendations(selectedMonth).catch(() => []),
        apiClient.getBudgetCommit(selectedMonth).catch(() => null),
        apiClient.getMonthlyAggregate(selectedMonth).catch(() => null),
        apiClient.getGoalAllocations(selectedMonth).catch(() => [])
      ])
      
      setRecommendations(recommendationsData)
      setCommit(commitData)
      setMonthlyAggregate(aggregateData)
      setGoalAllocations(allocationsData)
    } catch (err: unknown) {
      console.error('Error loading budget data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load budget data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleGenerateRecommendations = async () => {
    try {
      setGenerating(true)
      setError(null)
      await apiClient.generateBudgetRecommendations(selectedMonth)
      // Reload data after generating
      await loadData()
    } catch (err: unknown) {
      console.error('Error generating recommendations:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate recommendations'
      setError(errorMessage)
    } finally {
      setGenerating(false)
    }
  }

  const handleCommitToPlan = async (planCode: string) => {
    try {
      setCommitting(planCode)
      setError(null)
      const planNotes = notes[planCode] || ''
      await apiClient.commitToPlan(selectedMonth, planCode, planNotes)
      // Reload data after committing
      await loadData()
      // Clear notes for this plan
      setNotes({ ...notes, [planCode]: '' })
    } catch (err: unknown) {
      console.error('Error committing to plan:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to commit to plan'
      setError(errorMessage)
    } finally {
      setCommitting(null)
    }
  }

  // Helper to format month for display
  const formatMonthDisplay = (monthStr: string) => {
    const date = new Date(monthStr)
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })
  }

  // Helper to get budget status (on track, warning, exceeded)
  const getBudgetStatus = (variance: number, planned: number) => {
    if (planned === 0) return 'neutral'
    const utilization = ((planned + variance) / planned) * 100
    if (utilization >= 100) return 'exceeded'
    if (utilization >= 80) return 'warning'
    return 'on_track'
  }

  // Calculate chart data for pie chart
  const getPieChartData = () => {
    if (!monthlyAggregate) return []
    return [
      { name: 'Needs', value: monthlyAggregate.needs_amt, planned: monthlyAggregate.planned_needs_amt },
      { name: 'Wants', value: monthlyAggregate.wants_amt, planned: monthlyAggregate.planned_wants_amt },
      { name: 'Assets', value: monthlyAggregate.assets_amt, planned: monthlyAggregate.planned_assets_amt }
    ]
  }

  // Calculate comparison chart data
  const getComparisonData = () => {
    if (!monthlyAggregate) return []
    return [
      {
        category: 'Needs',
        actual: monthlyAggregate.needs_amt,
        planned: monthlyAggregate.planned_needs_amt
      },
      {
        category: 'Wants',
        actual: monthlyAggregate.wants_amt,
        planned: monthlyAggregate.planned_wants_amt
      },
      {
        category: 'Assets',
        actual: monthlyAggregate.assets_amt,
        planned: monthlyAggregate.planned_assets_amt
      }
    ]
  }

  const COLORS = ['#fbbf24', '#ef4444', '#10b981'] // yellow, red, green

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            BudgetPilot
          </h1>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
            <p className="mt-4 text-gray-400">Loading budget data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Month Selector */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 md:mb-0 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            BudgetPilot
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="month"
              value={selectedMonth.substring(0, 7)}
              onChange={(e) => {
                const yearMonth = e.target.value
                setSelectedMonth(`${yearMonth}-01`)
              }}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-yellow-500"
            />
            <button
              onClick={handleGenerateRecommendations}
              disabled={generating}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black rounded-lg font-semibold transition-colors"
            >
              {generating ? '⏳ Generating...' : '✨ Generate Recommendations'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={loadData}
              className="mt-4 px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Current Budget Status */}
        {monthlyAggregate && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📊</span> Current Budget Status - {formatMonthDisplay(selectedMonth)}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
              {/* Needs Card */}
              <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border transition-all duration-300 ${
                getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'exceeded' 
                  ? 'border-red-500 hover:border-red-400' 
                  : getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'warning'
                  ? 'border-yellow-500 hover:border-yellow-400'
                  : 'border-blue-500 hover:border-blue-400'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Needs</h3>
                  <span className={`text-lg sm:text-xl ${
                    getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'exceeded' 
                      ? 'text-red-400' 
                      : getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'warning'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`}>
                    {getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'exceeded' ? '⚠️' : 
                     getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'warning' ? '⚡' : '✅'}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-blue-400 mb-1">
                  {formatCurrency(monthlyAggregate.needs_amt || 0)}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Planned: {formatCurrency(monthlyAggregate.planned_needs_amt || 0)}
                </p>
                {monthlyAggregate.variance_needs_amt !== undefined && (
                  <p className={`text-sm font-semibold ${
                    monthlyAggregate.variance_needs_amt >= 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {monthlyAggregate.variance_needs_amt >= 0 ? '+' : ''}
                    {formatCurrency(monthlyAggregate.variance_needs_amt)} variance
                  </p>
                )}
                {/* Progress Bar */}
                {monthlyAggregate.planned_needs_amt > 0 && (
                  <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'exceeded'
                          ? 'bg-red-500'
                          : getBudgetStatus(monthlyAggregate.variance_needs_amt, monthlyAggregate.planned_needs_amt) === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, ((monthlyAggregate.needs_amt || 0) / monthlyAggregate.planned_needs_amt) * 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Wants Card */}
              <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border transition-all duration-300 ${
                getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'exceeded' 
                  ? 'border-red-500 hover:border-red-400' 
                  : getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'warning'
                  ? 'border-yellow-500 hover:border-yellow-400'
                  : 'border-purple-500 hover:border-purple-400'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Wants</h3>
                  <span className={`text-lg sm:text-xl ${
                    getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'exceeded' 
                      ? 'text-red-400' 
                      : getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'warning'
                      ? 'text-yellow-400'
                      : 'text-purple-400'
                  }`}>
                    {getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'exceeded' ? '⚠️' : 
                     getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'warning' ? '⚡' : '✅'}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-purple-400 mb-1">
                  {formatCurrency(monthlyAggregate.wants_amt || 0)}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Planned: {formatCurrency(monthlyAggregate.planned_wants_amt || 0)}
                </p>
                {monthlyAggregate.variance_wants_amt !== undefined && (
                  <p className={`text-sm font-semibold ${
                    monthlyAggregate.variance_wants_amt >= 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {monthlyAggregate.variance_wants_amt >= 0 ? '+' : ''}
                    {formatCurrency(monthlyAggregate.variance_wants_amt)} variance
                  </p>
                )}
                {/* Progress Bar */}
                {monthlyAggregate.planned_wants_amt > 0 && (
                  <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'exceeded'
                          ? 'bg-red-500'
                          : getBudgetStatus(monthlyAggregate.variance_wants_amt, monthlyAggregate.planned_wants_amt) === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-purple-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, ((monthlyAggregate.wants_amt || 0) / monthlyAggregate.planned_wants_amt) * 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Assets Card */}
              <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border transition-all duration-300 ${
                getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'exceeded' 
                  ? 'border-red-500 hover:border-red-400' 
                  : getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'warning'
                  ? 'border-yellow-500 hover:border-yellow-400'
                  : 'border-green-500 hover:border-green-400'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Assets</h3>
                  <span className={`text-lg sm:text-xl ${
                    getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'exceeded' 
                      ? 'text-red-400' 
                      : getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'warning'
                      ? 'text-yellow-400'
                      : 'text-green-400'
                  }`}>
                    {getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'exceeded' ? '⚠️' : 
                     getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'warning' ? '⚡' : '✅'}
                  </span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-green-400 mb-1">
                  {formatCurrency(monthlyAggregate.assets_amt || 0)}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Planned: {formatCurrency(monthlyAggregate.planned_assets_amt || 0)}
                </p>
                {monthlyAggregate.variance_assets_amt !== undefined && (
                  <p className={`text-sm font-semibold ${
                    monthlyAggregate.variance_assets_amt >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {monthlyAggregate.variance_assets_amt >= 0 ? '+' : ''}
                    {formatCurrency(monthlyAggregate.variance_assets_amt)} variance
                  </p>
                )}
                {/* Progress Bar */}
                {monthlyAggregate.planned_assets_amt > 0 && (
                  <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'exceeded'
                          ? 'bg-red-500'
                          : getBudgetStatus(monthlyAggregate.variance_assets_amt, monthlyAggregate.planned_assets_amt) === 'warning'
                          ? 'bg-yellow-500'
                          : 'bg-green-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, ((monthlyAggregate.assets_amt || 0) / monthlyAggregate.planned_assets_amt) * 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
              {/* Pie Chart - Actual Spending */}
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h3 className="text-lg sm:text-xl font-bold mb-4 text-yellow-400">Actual Spending Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getPieChartData()}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getPieChartData().map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend
                      wrapperStyle={{ color: '#d1d5db', fontSize: '12px' }}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Comparison Chart - Actual vs Planned */}
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h3 className="text-lg sm:text-xl font-bold mb-4 text-yellow-400">Actual vs Planned</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getComparisonData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="category" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
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
                    <Bar dataKey="actual" fill="#fbbf24" name="Actual" />
                    <Bar dataKey="planned" fill="#10b981" name="Planned" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Budget Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>💡</span> Budget Recommendations
            </h2>
            <div className="space-y-4">
              {recommendations.map((rec, idx) => {
                const isCommitted = commit?.plan_code === rec.plan_code
                return (
                  <div
                    key={rec.reco_id}
                    className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border transition-all duration-300 ${
                      isCommitted
                        ? 'border-green-500 ring-2 ring-green-500/50'
                        : idx === 0
                        ? 'border-yellow-500 hover:border-yellow-400'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg sm:text-xl font-bold text-white">
                            {rec.plan_name}
                          </h3>
                          {isCommitted && (
                            <span className="px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded">
                              ✓ Committed
                            </span>
                          )}
                          {idx === 0 && !isCommitted && (
                            <span className="px-2 py-1 bg-yellow-500 text-black text-xs font-semibold rounded">
                              ⭐ Top Pick
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mb-4">{rec.recommendation_reason}</p>
                        
                        {/* Budget Split */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          <div className="bg-gray-700/50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-1">Needs</p>
                            <p className="text-sm font-bold text-blue-400">{rec.needs_budget_pct.toFixed(1)}%</p>
                          </div>
                          <div className="bg-gray-700/50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-1">Wants</p>
                            <p className="text-sm font-bold text-purple-400">{rec.wants_budget_pct.toFixed(1)}%</p>
                          </div>
                          <div className="bg-gray-700/50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 mb-1">Savings</p>
                            <p className="text-sm font-bold text-green-400">{rec.savings_budget_pct.toFixed(1)}%</p>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Match Score:</span>
                          <div className="flex-1 bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-yellow-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${rec.score * 10}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-yellow-400">
                            {(rec.score * 10).toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {!isCommitted && (
                        <div className="flex flex-col gap-2 sm:w-48">
                          <textarea
                            placeholder="Add notes (optional)"
                            value={notes[rec.plan_code] || ''}
                            onChange={(e) => setNotes({ ...notes, [rec.plan_code]: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500 resize-none"
                            rows={2}
                          />
                          <button
                            onClick={() => handleCommitToPlan(rec.plan_code)}
                            disabled={committing === rec.plan_code}
                            className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black rounded-lg font-semibold transition-colors"
                          >
                            {committing === rec.plan_code ? '⏳ Committing...' : '✓ Commit to Plan'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Current Commitment */}
        {commit && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📋</span> Current Commitment
            </h2>
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-xl p-4 sm:p-6 border border-green-500/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">{commit.plan_code}</h3>
                  <p className="text-sm text-gray-400 mb-3">
                    Committed on {new Date(commit.committed_at).toLocaleDateString('en-IN', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Needs</p>
                      <p className="text-sm font-bold text-blue-400">{commit.alloc_needs_pct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Wants</p>
                      <p className="text-sm font-bold text-purple-400">{commit.alloc_wants_pct.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Assets</p>
                      <p className="text-sm font-bold text-green-400">{commit.alloc_assets_pct.toFixed(1)}%</p>
                    </div>
                  </div>
                  {commit.notes && (
                    <p className="text-sm text-gray-300 mt-3 italic">"{commit.notes}"</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Goal Allocations */}
        {goalAllocations.length > 0 && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>🎯</span> Goal Allocations
            </h2>
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
              <div className="space-y-3">
                {goalAllocations.map((goal) => (
                  <div key={goal.goal_id} className="bg-gray-700/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white">{goal.goal_name}</span>
                      <div className="text-right">
                        <span className="text-yellow-400 font-bold block">
                          {formatCurrency(goal.planned_amount)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {goal.weight_pct.toFixed(1)}% weight
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-500"
                        style={{ width: `${goal.weight_pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No Data Message */}
        {!monthlyAggregate && !recommendations.length && !commit && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <p className="text-gray-400 mb-4">No budget data available for {formatMonthDisplay(selectedMonth)}.</p>
            <button
              onClick={handleGenerateRecommendations}
              disabled={generating}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black rounded-lg font-semibold transition-colors"
            >
              {generating ? '⏳ Generating...' : '✨ Generate Recommendations'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
