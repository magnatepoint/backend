import { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { apiClient } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/utils'

interface GoalCoachQuickAction {
  type: string
  goal_id: string
  goal_name: string
  month: string
  recommended_extra: number
}

interface GoalCoachResponse {
  month: string
  summary: string
  tips: string[]
  quick_actions: GoalCoachQuickAction[]
}

interface GoalSimulationResult {
  goal_id: string
  remaining_amount: number
  simulated_months_remaining: number
  simulated_target_date: string | null
  acceleration_months: number | null
  suggested_monthly_need: number
  monthly_contribution: number
}

interface GoalProgress {
  goal_id: string
  goal_name: string
  goal_category: string
  goal_type: string
  progress_pct: number
  progress_amount: number
  remaining_amount: number
  months_remaining: number | null
  suggested_monthly_need: number
  on_track_flag: boolean
  risk_level: 'low' | 'medium' | 'high'
  commentary: string
  estimated_cost: number
  target_date: string | null
}

interface DashboardData {
  month: string
  active_goals_count: number
  avg_progress_pct: number
  total_remaining_amount: number
  goals_on_track_count: number
  goals_high_risk_count: number
}

interface Milestone {
  milestone_id: string
  threshold_pct: number
  label: string
  description: string | null
  achieved_flag: boolean
  achieved_at: string | null
  progress_pct_at_ach: number | null
}

interface Contribution {
  gcf_id: string
  goal_id: string
  goal_name: string
  month: string
  source: string
  amount: number
  notes: string | null
  created_at: string
}

interface GoalInsight {
  goal_id: string
  name: string
  progress_pct: number
  remaining: number
  on_track: boolean
  risk: 'low' | 'medium' | 'high'
  suggested_monthly: number
}

interface CatalogItem {
  goal_category: string
  goal_name: string
  default_horizon: string
  policy_linked_txn_type: 'needs' | 'wants' | 'assets'
  auto_suggest?: string | null
  recommended?: boolean
  context_hint?: string | null
}

// Client helpers for Goal Coach
async function fetchGoalCoach(month?: string): Promise<GoalCoachResponse> {
  const res = await apiClient.getGoalCoach(month)
  return res
}

// Simple helper using fetch so we don't touch apiClient
async function runGoalSimulation(
  goal_id: string,
  monthly_contribution: number,
  as_of_date: string
): Promise<GoalSimulationResult> {
  // Get auth token
  const { supabase } = await import('../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('No authentication token available')
  }

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://backend.mallaapp.org'
  const res = await fetch(`${API_BASE_URL}/api/goalcoach/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ goal_id, monthly_contribution, as_of_date })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to simulate')
  }
  return res.json()
}

export default function GoalCompass() {
  const [goalProgress, setGoalProgress] = useState<GoalProgress[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [_insights, setInsights] = useState<GoalInsight[]>([])
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all')
  const [trackFilter, setTrackFilter] = useState<'all' | 'on_track' | 'at_risk'>('all')
  const [sortBy, setSortBy] = useState<'progress' | 'risk' | 'name' | 'remaining'>('risk')
  const [refreshing, setRefreshing] = useState(false)
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set())
  const [showAddGoalModal, setShowAddGoalModal] = useState(false)
  const [goalCatalog, setGoalCatalog] = useState<{ short: CatalogItem[]; medium: CatalogItem[]; long: CatalogItem[] } | null>(null)
  const [selectedTerm, setSelectedTerm] = useState<'short' | 'medium' | 'long'>('short')
  const [goalForm, setGoalForm] = useState<{
    goal_category: string
    goal_name: string
    goal_type: 'short_term' | 'medium_term' | 'long_term'
    estimated_cost: string
    target_date: string
    current_savings: string
    notes: string
  }>({
    goal_category: '',
    goal_name: '',
    goal_type: 'short_term',
    estimated_cost: '',
    target_date: '',
    current_savings: '0',
    notes: ''
  })
  const [creating, setCreating] = useState(false)

  // coach
  const [coachData, setCoachData] = useState<GoalCoachResponse | null>(null)
  const [coachLoading, setCoachLoading] = useState(false)
  const [coachError, setCoachError] = useState<string | null>(null)

  // what-if simulator
  const [simGoal, setSimGoal] = useState<GoalSimulationResult | null>(null)
  const [simGoalId, setSimGoalId] = useState<string | null>(null)
  const [simInput, setSimInput] = useState<string>('') // monthly amount as text
  const [simLoading, setSimLoading] = useState(false)

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const results = await Promise.allSettled([
        apiClient.getGoalProgress(undefined, selectedMonth).catch(() => ({ goals: [] })),
        apiClient.getGoalDashboard(selectedMonth).catch(() => null),
        apiClient.getGoalInsights(selectedMonth).catch(() => ({ goal_cards: [] }))
      ])

      if (results[0].status === 'fulfilled') {
        const progress = results[0].value
        const goals = (progress?.goals || []).map((g) => ({
          ...g,
          target_date: g.target_date || null
        })) as GoalProgress[]
        setGoalProgress(goals)
      }
      if (results[1].status === 'fulfilled') {
        setDashboard(results[1].value)
      }
      if (results[2].status === 'fulfilled') {
        setInsights(results[2].value?.goal_cards || [])
      }
    } catch (err: any) {
      console.error('Error loading goal data:', err)
      setError(err.message || 'Failed to load goal data')
    } finally {
      setLoading(false)
    }
  }, [selectedMonth])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // Load Coach data whenever month changes
  useEffect(() => {
    let mounted = true
    setCoachLoading(true)
    setCoachError(null)
    fetchGoalCoach(selectedMonth)
      .then((res) => {
        if (!mounted) return
        setCoachData(res)
      })
      .catch((err: any) => {
        if (!mounted) return
        setCoachError(err?.message || 'Failed to load coach insights')
      })
      .finally(() => mounted && setCoachLoading(false))

    return () => {
      mounted = false
    }
  }, [selectedMonth])

  // Load goal catalog when modal opens
  useEffect(() => {
    if (showAddGoalModal && !goalCatalog) {
      apiClient.getGoalsCatalog()
        .then(catalog => {
          // Map catalog items to ensure type compatibility
          const mappedCatalog = {
            short: (catalog.short || []).map(item => ({
              ...item,
              default_horizon: item.default_horizon as string
            })),
            medium: (catalog.medium || []).map(item => ({
              ...item,
              default_horizon: item.default_horizon as string
            })),
            long: (catalog.long || []).map(item => ({
              ...item,
              default_horizon: item.default_horizon as string
            }))
          }
          setGoalCatalog(mappedCatalog)
        })
        .catch(() => setGoalCatalog({ short: [], medium: [], long: [] }))
    }
  }, [showAddGoalModal, goalCatalog])

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await apiClient.refreshGoalCompass(selectedMonth)
      await loadAllData()
      alert('GoalCompass refreshed successfully!')
    } catch (err: any) {
      alert(`Failed to refresh: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const handleAddGoal = async () => {
    if (!goalForm.goal_category || !goalForm.goal_name || !goalForm.estimated_cost) {
      alert('Please fill in all required fields (Category, Name, Estimated Cost)')
      return
    }

    try {
      setCreating(true)
      await apiClient.createGoal({
        goal_category: goalForm.goal_category,
        goal_name: goalForm.goal_name,
        goal_type: goalForm.goal_type,
        estimated_cost: parseFloat(goalForm.estimated_cost),
        target_date: goalForm.target_date || undefined,
        current_savings: parseFloat(goalForm.current_savings) || 0,
        notes: goalForm.notes || undefined
      })
      
      setShowAddGoalModal(false)
      setGoalForm({
        goal_category: '',
        goal_name: '',
        goal_type: 'short_term',
        estimated_cost: '',
        target_date: '',
        current_savings: '0',
        notes: ''
      })
      
      // Refresh data and refresh GoalCompass
      await loadAllData()
      await apiClient.refreshGoalCompass(selectedMonth)
      await loadAllData()
      
      alert('Goal created successfully!')
    } catch (err: any) {
      alert(`Failed to create goal: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  const handleCatalogGoalSelect = (item: CatalogItem) => {
    setGoalForm({
      ...goalForm,
      goal_category: item.goal_category,
      goal_name: item.goal_name,
      goal_type: item.default_horizon as 'short_term' | 'medium_term' | 'long_term'
    })
  }

  const triggerSimulation = async (goalId: string, amount: number) => {
    if (!amount || amount <= 0) {
      alert('Enter a monthly amount > 0')
      return
    }
    try {
      setSimLoading(true)
      const result = await runGoalSimulation(goalId, amount, selectedMonth)
      setSimGoal(result)
      setSimGoalId(goalId)
    } catch (err: any) {
      console.error('Simulation error', err)
      alert(err?.message || 'Failed to run simulation')
    } finally {
      setSimLoading(false)
    }
  }

  const handleCoachQuickAction = async (action: GoalCoachQuickAction) => {
    const goal = goalProgress.find((g) => g.goal_id === action.goal_id)
    if (!goal) return

    // focus this goal and prefill simulator
    setSelectedGoal(action.goal_id)
    const base = goal.suggested_monthly_need || 0
    const monthly = base + action.recommended_extra
    setSimInput(String(Math.round(monthly)))
    setSimGoalId(action.goal_id)
    await triggerSimulation(action.goal_id, monthly)
  }

  const handleGoalClick = async (goalId: string) => {
    if (expandedGoals.has(goalId)) {
      // Collapse
      setExpandedGoals(prev => {
        const next = new Set(prev)
        next.delete(goalId)
        return next
      })
      setSelectedGoal(null)
      setMilestones([])
      setContributions([])
    } else {
      // Expand
      setExpandedGoals(prev => new Set(prev).add(goalId))
      setSelectedGoal(goalId)
      
      try {
        const [milestonesData, contributionsData] = await Promise.all([
          apiClient.getGoalMilestones(goalId).catch(() => ({ milestones: [] })),
          apiClient.getGoalContributions(goalId).catch(() => ({ contributions: [] }))
        ])
        setMilestones(milestonesData?.milestones || [])
        setContributions(contributionsData?.contributions || [])
      } catch (err) {
        console.error('Error loading goal details:', err)
      }
    }
  }

  // Filter and sort goals
  const filteredAndSortedGoals = goalProgress
    .filter(goal => {
      if (riskFilter !== 'all' && goal.risk_level !== riskFilter) return false
      if (trackFilter === 'on_track' && !goal.on_track_flag) return false
      if (trackFilter === 'at_risk' && goal.on_track_flag) return false
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'progress':
          return b.progress_pct - a.progress_pct
        case 'risk':
          const riskOrder = { high: 3, medium: 2, low: 1 }
          return riskOrder[b.risk_level] - riskOrder[a.risk_level]
        case 'name':
          return a.goal_name.localeCompare(b.goal_name)
        case 'remaining':
          return b.remaining_amount - a.remaining_amount
        default:
          return 0
      }
    })

  // Prepare data for pie chart (goal distribution by category)
  const categoryData = goalProgress.reduce((acc, goal) => {
    const category = goal.goal_category || 'Other'
    if (!acc[category]) {
      acc[category] = { name: category, value: 0, count: 0 }
    }
    acc[category].value += goal.remaining_amount
    acc[category].count += 1
    return acc
  }, {} as Record<string, { name: string; value: number; count: number }>)

  const pieChartData = Object.values(categoryData)

  // Risk level distribution
  const riskData = goalProgress.reduce((acc, goal) => {
    acc[goal.risk_level] = (acc[goal.risk_level] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const riskChartData = [
    { name: 'Low Risk', value: riskData.low || 0, color: '#10b981' },
    { name: 'Medium Risk', value: riskData.medium || 0, color: '#f59e0b' },
    { name: 'High Risk', value: riskData.high || 0, color: '#ef4444' }
  ].filter(item => item.value > 0)

  // Contribution breakdown by source
  const contributionBySource = contributions.reduce((acc, contrib) => {
    const source = contrib.source || 'unknown'
    acc[source] = (acc[source] || 0) + contrib.amount
    return acc
  }, {} as Record<string, number>)

  const contributionChartData = Object.entries(contributionBySource).map(([source, amount]) => ({
    name: source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: amount
  }))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">GoalCompass</h1>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
            <p className="mt-4 text-gray-400">Loading goal data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">GoalCompass</h1>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <button
              onClick={() => setShowAddGoalModal(true)}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-semibold flex items-center gap-2"
            >
              <span>+</span> Add Goal
            </button>
            <input
              type="month"
              value={selectedMonth.substring(0, 7)}
              onChange={(e) => setSelectedMonth(`${e.target.value}-01`)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
            />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 text-sm font-semibold disabled:opacity-50"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={loadAllData}
              className="mt-4 px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Goal Coach – inline on GoalCompass page */}
        <div className="mb-6">
          <div className="bg-gray-800 rounded-xl p-4 sm:p-5 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm sm:text-base font-semibold text-yellow-400 flex items-center gap-2">
                <span>🧭</span> Goal Coach
              </h2>
              <span className="text-[11px] text-gray-400">{selectedMonth}</span>
            </div>

            {coachLoading && (
              <p className="text-xs text-gray-400">Analysing your goals for this month…</p>
            )}

            {coachError && (
              <p className="text-xs text-red-400">Error: {coachError}</p>
            )}

            {!coachLoading && !coachError && coachData && (
              <>
                <p className="text-xs text-gray-400 mb-3">{coachData.summary}</p>
                <ul className="space-y-2 mb-4">
                  {coachData.tips.map((tip, idx) => (
                    <li key={idx} className="text-xs text-gray-200 flex gap-2">
                      <span className="mt-0.5 text-yellow-400">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>

                {coachData.quick_actions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">
                      Quick actions
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {coachData.quick_actions.map((a) => (
                        <button
                          key={`${a.goal_id}-${a.month}`}
                          onClick={() => handleCoachQuickAction(a)}
                          className="text-left text-xs px-3 py-2 bg-yellow-500/10 border border-yellow-500/40 rounded-lg hover:bg-yellow-500/20 transition-colors"
                        >
                          Boost <span className="font-semibold">{a.goal_name}</span> by{' '}
                          <span className="font-semibold">
                            {formatCurrency(a.recommended_extra)}
                          </span>{' '}
                          per month
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {coachData.quick_actions.length === 0 && (
                  <p className="text-[11px] text-gray-400">
                    No urgent changes needed. Stay consistent with your current plan.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Dashboard Stats */}
        {dashboard && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-6 md:mb-8">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-blue-500 transition-all duration-300 shadow-lg hover:shadow-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Active Goals</h3>
                <span className="text-blue-400 text-lg sm:text-xl">🎯</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-blue-400 mb-1">
                {dashboard.active_goals_count || 0}
              </p>
            </div>

            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-green-500 transition-all duration-300 shadow-lg hover:shadow-green-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Avg Progress</h3>
                <span className="text-green-400 text-lg sm:text-xl">📊</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-green-400 mb-1">
                {(dashboard.avg_progress_pct || 0).toFixed(1)}%
              </p>
            </div>

            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-yellow-500 transition-all duration-300 shadow-lg hover:shadow-yellow-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Remaining</h3>
                <span className="text-yellow-400 text-lg sm:text-xl">💰</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-1">
                {formatCurrency(dashboard.total_remaining_amount || 0)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-green-500 transition-all duration-300 shadow-lg hover:shadow-green-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">On Track</h3>
                <span className="text-green-400 text-lg sm:text-xl">✅</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-green-400 mb-1">
                {dashboard.goals_on_track_count || 0}
              </p>
            </div>

            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-red-500 transition-all duration-300 shadow-lg hover:shadow-red-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">High Risk</h3>
                <span className="text-red-400 text-lg sm:text-xl">⚠️</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-red-400 mb-1">
                {dashboard.goals_high_risk_count || 0}
              </p>
            </div>
          </div>
        )}

        {/* Visualizations */}
        {goalProgress.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 md:mb-8">
            {/* Goal Distribution by Category */}
            {pieChartData.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
                  <span>📂</span> Goal Distribution by Category
                </h2>
                <div className="w-full" style={{ minHeight: '300px', height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={(props: any) => {
                          const data = props.payload || {}
                          return `${data.name || ''} (${data.count || 0})`
                        }}
                      >
                        {pieChartData.map((_, index) => {
                          const colors = ['#fbbf24', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b']
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                        })}
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
                      <Legend wrapperStyle={{ color: '#d1d5db', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Risk Level Distribution */}
            {riskChartData.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
                  <span>⚠️</span> Risk Level Distribution
                </h2>
                <div className="w-full" style={{ minHeight: '300px', height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%" minHeight={300}>
                    <PieChart>
                      <Pie
                        data={riskChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {riskChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                      />
                      <Legend wrapperStyle={{ color: '#d1d5db', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters and Sort */}
        {goalProgress.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mb-6 md:mb-8">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Risk:</label>
                <select
                  value={riskFilter}
                  onChange={(e) => setRiskFilter(e.target.value as any)}
                  className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                >
                  <option value="all">All</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Status:</label>
                <select
                  value={trackFilter}
                  onChange={(e) => setTrackFilter(e.target.value as any)}
                  className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                >
                  <option value="all">All</option>
                  <option value="on_track">On Track</option>
                  <option value="at_risk">At Risk</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Sort by:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                >
                  <option value="risk">Risk Level</option>
                  <option value="progress">Progress</option>
                  <option value="remaining">Remaining Amount</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Goal Progress Cards */}
        {filteredAndSortedGoals.length > 0 ? (
          <div className="space-y-4 sm:space-y-6">
            {filteredAndSortedGoals.map((goal) => {
              const isExpanded = expandedGoals.has(goal.goal_id)
              const goalMilestones = selectedGoal === goal.goal_id ? milestones : []
              const goalContributions = selectedGoal === goal.goal_id ? contributions : []
              
              return (
                <div
                  key={goal.goal_id}
                  className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-yellow-500 transition-all duration-300"
                >
                  {/* Goal Header */}
                  <div
                    className="cursor-pointer"
                    onClick={() => handleGoalClick(goal.goal_id)}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 sm:gap-4 mb-2">
                          <h3 className="font-semibold text-lg sm:text-xl">{goal.goal_name}</h3>
                          <span className={`text-xs px-2 py-1 rounded ${
                            goal.risk_level === 'high' ? 'bg-red-900/30 text-red-400' :
                            goal.risk_level === 'medium' ? 'bg-yellow-900/30 text-yellow-400' :
                            'bg-green-900/30 text-green-400'
                          }`}>
                            {goal.risk_level.toUpperCase()} RISK
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            goal.on_track_flag ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                          }`}>
                            {goal.on_track_flag ? 'ON TRACK' : 'AT RISK'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400">{goal.goal_category} • {goal.goal_type}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl sm:text-2xl font-bold text-yellow-400 mb-1">
                          {goal.progress_pct.toFixed(1)}%
                        </p>
                        <p className="text-xs sm:text-sm text-gray-400">
                          {formatCurrency(goal.progress_amount)} / {formatCurrency(goal.estimated_cost || (goal.progress_amount + goal.remaining_amount))}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-700 rounded-full h-3 mb-4">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          goal.risk_level === 'high' ? 'bg-red-500' :
                          goal.risk_level === 'medium' ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(goal.progress_pct, 100)}%` }}
                      />
                    </div>

                    {/* Goal Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400 mb-1">Remaining</p>
                        <p className="font-semibold text-yellow-400">{formatCurrency(goal.remaining_amount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Monthly Need</p>
                        <p className="font-semibold text-blue-400">{formatCurrency(goal.suggested_monthly_need)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Months Left</p>
                        <p className="font-semibold">{goal.months_remaining !== null ? goal.months_remaining : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-1">Target Date</p>
                        <p className="font-semibold">{goal.target_date ? formatDate(goal.target_date) : 'N/A'}</p>
                      </div>
                    </div>

                    {goal.commentary && (
                      <p className="text-sm text-gray-300 mt-4 italic">💡 {goal.commentary}</p>
                    )}

                    <p className="text-xs text-gray-500 mt-2">
                      {isExpanded ? 'Click to collapse' : 'Click to expand for milestones and contributions'}
                    </p>
                  </div>

                  {/* Quick what-if trigger (keeps everything on GoalCompass page) */}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button
                      className="px-3 py-1 rounded-full border border-yellow-500/60 text-yellow-300 hover:bg-yellow-500/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedGoal(goal.goal_id)
                        // default to suggested monthly need if available
                        const suggested = goal.suggested_monthly_need || 0
                        const defaultAmount = suggested > 0 ? Math.round(suggested) : 0
                        setSimInput(defaultAmount ? String(defaultAmount) : '')
                        setSimGoal(null)
                        setSimGoalId(goal.goal_id)
                      }}
                    >
                      ⚙️ What-if: monthly amount
                    </button>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-6 pt-6 border-t border-gray-700 space-y-6">
                      {/* What-if simulator lives INSIDE GoalCompass, per goal */}
                      {simGoalId === goal.goal_id && (
                        <div className="mb-6 p-4 rounded-lg bg-gray-900/60 border border-gray-700">
                          <h4 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
                            <span>🧮</span> What-if simulator
                          </h4>
                          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end mb-3">
                            <div className="flex-1">
                              <label className="block text-[11px] text-gray-400 mb-1">
                                Monthly contribution for this goal (₹)
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={simInput}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setSimInput(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm"
                                placeholder={
                                  goal.suggested_monthly_need
                                    ? `Suggested ~${formatCurrency(goal.suggested_monthly_need)}`
                                    : 'Enter an amount'
                                }
                              />
                            </div>
                            <button
                              disabled={simLoading || !simInput}
                              onClick={(e) => {
                                e.stopPropagation()
                                const amt = Number(simInput || 0)
                                triggerSimulation(goal.goal_id, amt)
                              }}
                              className="px-4 py-2 bg-yellow-500 text-black rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                              {simLoading ? 'Simulating…' : 'Run Simulation'}
                            </button>
                          </div>

                          {simGoal && simGoal.goal_id === goal.goal_id && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-gray-300">
                              <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                                <p className="text-gray-400 mb-1">Simulated months to finish</p>
                                <p className="text-lg font-bold text-yellow-400">
                                  {simGoal.simulated_months_remaining}
                                </p>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                                <p className="text-gray-400 mb-1">New target (approx)</p>
                                <p className="text-sm font-semibold">
                                  {simGoal.simulated_target_date
                                    ? formatDate(simGoal.simulated_target_date)
                                    : '—'}
                                </p>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                                <p className="text-gray-400 mb-1">Time saved vs current</p>
                                <p className="text-sm font-semibold text-green-400">
                                  {simGoal.acceleration_months != null
                                    ? `${simGoal.acceleration_months} month(s)`
                                    : '—'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Milestones */}
                      {goalMilestones.length > 0 && (
                        <div>
                          <h4 className="text-lg font-bold mb-4 text-yellow-400 flex items-center gap-2">
                            <span>🏆</span> Milestones
                          </h4>
                          <div className="space-y-3">
                            {goalMilestones.map((milestone) => (
                              <div
                                key={milestone.milestone_id}
                                className={`flex items-center gap-4 p-3 rounded-lg border ${
                                  milestone.achieved_flag
                                    ? 'bg-green-900/20 border-green-500'
                                    : 'bg-gray-700/50 border-gray-600'
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  milestone.achieved_flag ? 'bg-green-500' : 'bg-gray-600'
                                }`}>
                                  {milestone.achieved_flag ? '✓' : '○'}
                                </div>
                                <div className="flex-1">
                                  <p className="font-semibold">{milestone.label}</p>
                                  <p className="text-xs text-gray-400">
                                    {milestone.threshold_pct}% threshold
                                    {milestone.achieved_flag && milestone.achieved_at && (
                                      <span> • Achieved on {formatDate(milestone.achieved_at)}</span>
                                    )}
                                  </p>
                                  {milestone.description && (
                                    <p className="text-sm text-gray-300 mt-1">{milestone.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Contributions */}
                      {goalContributions.length > 0 && (
                        <div>
                          <h4 className="text-lg font-bold mb-4 text-yellow-400 flex items-center gap-2">
                            <span>💸</span> Contribution History
                          </h4>
                          
                          {/* Contribution Breakdown Chart */}
                          {contributionChartData.length > 0 && (
                            <div className="mb-6" style={{ minHeight: '200px', height: '200px' }}>
                              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                <PieChart>
                                  <Pie
                                    data={contributionChartData}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                  >
                                    {contributionChartData.map((_, index) => {
                                      const colors = ['#10b981', '#3b82f6', '#f59e0b']
                                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    })}
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
                                  <Legend wrapperStyle={{ color: '#d1d5db', fontSize: '12px' }} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          <div className="space-y-2">
                            {goalContributions.map((contrib) => (
                              <div
                                key={contrib.gcf_id}
                                className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 bg-gray-700/50 rounded-lg"
                              >
                                <div className="flex-1">
                                  <p className="font-semibold">{formatCurrency(contrib.amount)}</p>
                                  <p className="text-xs text-gray-400">
                                    {contrib.source.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} • {formatDate(contrib.month)}
                                  </p>
                                  {contrib.notes && (
                                    <p className="text-sm text-gray-300 mt-1">{contrib.notes}</p>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{formatDate(contrib.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-6">
            <p className="text-gray-400">
              {goalProgress.length === 0
                ? 'No goals found. Create goals to get started.'
                : 'No goals match the selected filters.'}
            </p>
          </div>
        )}

        {/* Add Goal Modal */}
        {showAddGoalModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Add New Goal</h2>
              
              {/* Goal Catalog Tabs */}
              {goalCatalog && (
                <div className="mb-6">
                  <div className="flex gap-2 mb-4 border-b border-gray-700">
                    <button
                      onClick={() => setSelectedTerm('short')}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        selectedTerm === 'short'
                          ? 'border-yellow-500 text-yellow-400'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Short Term
                    </button>
                    <button
                      onClick={() => setSelectedTerm('medium')}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        selectedTerm === 'medium'
                          ? 'border-yellow-500 text-yellow-400'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Medium Term
                    </button>
                    <button
                      onClick={() => setSelectedTerm('long')}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        selectedTerm === 'long'
                          ? 'border-yellow-500 text-yellow-400'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Long Term
                    </button>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {goalCatalog[selectedTerm].map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleCatalogGoalSelect(item)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          goalForm.goal_category === item.goal_category && goalForm.goal_name === item.goal_name
                            ? 'bg-yellow-500/20 border-yellow-500'
                            : 'bg-gray-700/50 border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{item.goal_name}</p>
                            <p className="text-xs text-gray-400">{item.goal_category}</p>
                            {item.recommended && (
                              <span className="text-xs text-green-400 mt-1 inline-block">⭐ Recommended</span>
                            )}
                            {item.context_hint && (
                              <p className="text-xs text-yellow-400 mt-1">{item.context_hint}</p>
                            )}
                          </div>
                          {goalForm.goal_category === item.goal_category && goalForm.goal_name === item.goal_name && (
                            <span className="text-yellow-400">✓</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {goalCatalog[selectedTerm].length === 0 && (
                      <p className="text-gray-400 text-sm text-center py-4">No goals available in this category</p>
                    )}
                  </div>
                </div>
              )}

              {/* Goal Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Goal Category *</label>
                  <input
                    type="text"
                    value={goalForm.goal_category}
                    onChange={(e) => setGoalForm({ ...goalForm, goal_category: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="e.g., Emergency, Travel, Education"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Goal Name *</label>
                  <input
                    type="text"
                    value={goalForm.goal_name}
                    onChange={(e) => setGoalForm({ ...goalForm, goal_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="e.g., Emergency Fund, Europe Trip, Child Education"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Goal Type *</label>
                  <select
                    value={goalForm.goal_type}
                    onChange={(e) => setGoalForm({ ...goalForm, goal_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="short_term">Short Term</option>
                    <option value="medium_term">Medium Term</option>
                    <option value="long_term">Long Term</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Estimated Cost (₹) *</label>
                  <input
                    type="number"
                    value={goalForm.estimated_cost}
                    onChange={(e) => setGoalForm({ ...goalForm, estimated_cost: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="e.g., 500000"
                    min="0"
                    step="1000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Target Date</label>
                  <input
                    type="date"
                    value={goalForm.target_date}
                    onChange={(e) => setGoalForm({ ...goalForm, target_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Current Savings (₹)</label>
                  <input
                    type="number"
                    value={goalForm.current_savings}
                    onChange={(e) => setGoalForm({ ...goalForm, current_savings: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="0"
                    min="0"
                    step="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">Notes</label>
                  <textarea
                    value={goalForm.notes}
                    onChange={(e) => setGoalForm({ ...goalForm, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    rows={3}
                    placeholder="Additional notes about this goal..."
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleAddGoal}
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-semibold disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Goal'}
                </button>
                <button
                  onClick={() => {
                    setShowAddGoalModal(false)
                    setGoalForm({
                      goal_category: '',
                      goal_name: '',
                      goal_type: 'short_term',
                      estimated_cost: '',
                      target_date: '',
                      current_savings: '0',
                      notes: ''
                    })
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
