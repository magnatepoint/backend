import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../lib/api'
import { formatCurrency } from '../lib/utils'
import Metric from '../components/Metric'
import { BandProgress } from '../components/BandProgress'
import BudgetRecommendations from '../components/BudgetRecommendations'
import CategoryTable from '../components/CategoryTable'
import PeriodPicker from '../components/PeriodPicker'
import TrendChart from '../components/TrendChart'
import InsightsPanel from '../components/InsightsPanel'
import AllocationDonut, { AllocationColors } from '../components/AllocationDonut'
import CategoryMicrocards from '../components/CategoryMicrocards'
import PeriodComparison from '../components/PeriodComparison'
import WhatIfSimulator from '../components/WhatIfSimulator'

type PeriodType = 'monthly' | 'quarterly' | 'custom'

const STORAGE_KEY = 'budgetpilot:period-state'

const computeCurrentMonthRange = () => {
  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
  return { start, end }
}

const readStoredPeriod = (): {
  periodId: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
} => {
  if (typeof window === 'undefined') {
    const { start, end } = computeCurrentMonthRange()
    return { periodId: '', periodType: 'monthly', periodStart: start, periodEnd: end }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const { start, end } = computeCurrentMonthRange()
      return { periodId: '', periodType: 'monthly', periodStart: start, periodEnd: end }
    }
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'periodType' in parsed &&
      'periodStart' in parsed &&
      'periodEnd' in parsed
    ) {
      return {
        periodId: typeof parsed.periodId === 'string' ? parsed.periodId : '',
        periodType: parsed.periodType as PeriodType,
        periodStart: parsed.periodStart as string,
        periodEnd: parsed.periodEnd as string
      }
    }
  } catch (err) {
    console.warn('Failed to read stored BudgetPilot period state', err)
  }
  const { start, end } = computeCurrentMonthRange()
  return { periodId: '', periodType: 'monthly', periodStart: start, periodEnd: end }
}

const persistPeriod = (state: {
  periodId: string
  periodType: PeriodType
  periodStart: string
  periodEnd: string
}) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('Failed to persist BudgetPilot period state', err)
  }
}

interface Overview {
  user_id: string
  period_id: string
  period_label: string
  income: number
  needs_spent: number
  wants_spent: number
  assets_spent: number
  needs_plan: number
  wants_plan: number
  assets_plan: number
  needs_variance: number
  wants_variance: number
  assets_variance: number
  plan_code: string | null
  plan_name: string | null
}

interface Recommendation {
  plan_code: string
  score: number
  needs_budget_pct: number
  wants_budget_pct: number
  savings_budget_pct: number
  recommendation_reason: string
  period_id: string | null
}

interface CategoryItem {
  band: 'needs' | 'wants' | 'assets'
  category: string
  planned_pct: number
  planned_amount: number
}

export default function BudgetPilot() {
  const initial = readStoredPeriod()

  const [periodId, setPeriodId] = useState<string>(initial.periodId)
  const [periodType, setPeriodType] = useState<PeriodType>(initial.periodType)
  const [periodStart, setPeriodStart] = useState<string>(initial.periodStart)
  const [periodEnd, setPeriodEnd] = useState<string>(initial.periodEnd)
  
  const [overview, setOverview] = useState<Overview | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [trends, setTrends] = useState<any[]>([])
  const [insights, setInsights] = useState<any[]>([])
  const [comparison, setComparison] = useState<any>(null)
  
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'simulator'>('overview')
  const [creatingPeriod, setCreatingPeriod] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [autofilling, setAutofilling] = useState(false)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePeriodChange = (type: PeriodType, start: string, end: string) => {
    setPeriodType(type)
    setPeriodStart(start)
    setPeriodEnd(end)
    // Reset period ID when period changes
    setPeriodId('')
    setOverview(null)
    setRecommendations([])
    setCategories([])
  }

  useEffect(() => {
    persistPeriod({
      periodId,
      periodType,
      periodStart,
      periodEnd
    })
  }, [periodId, periodType, periodStart, periodEnd])

  const handleCreatePeriod = async () => {
    try {
      setCreatingPeriod(true)
      setError(null)
      const result = await apiClient.upsertPeriod(periodType, periodStart, periodEnd)
      setPeriodId(result.period_id)
      persistPeriod({
        periodId: result.period_id,
        periodType,
        periodStart,
        periodEnd
      })
    } catch (err: unknown) {
      console.error('Error creating period:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to create period'
      setError(errorMessage)
    } finally {
      setCreatingPeriod(false)
    }
  }

  const handleGenerateRecommendations = async () => {
    if (!periodId) {
      setError('Please create a period first')
      return
    }
    try {
      setGenerating(true)
      setError(null)
      const result = await apiClient.generateRecommendationsPeriodized(periodType, periodStart, periodEnd)
      setRecommendations(result.items)
      // Update period ID if returned
      if (result.items.length > 0 && result.items[0].period_id) {
        setPeriodId(result.items[0].period_id)
        persistPeriod({
          periodId: result.items[0].period_id,
          periodType,
          periodStart,
          periodEnd
        })
      }
    } catch (err: unknown) {
      console.error('Error generating recommendations:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate recommendations'
      setError(errorMessage)
    } finally {
      setGenerating(false)
    }
  }

  const handleAutofillCategories = async () => {
    if (!periodId) {
      setError('Please create a period first')
      return
    }
    try {
      setAutofilling(true)
      setError(null)
      await apiClient.autofillCategories(periodId)
      await loadData()
    } catch (err: unknown) {
      console.error('Error autofilling categories:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to autofill categories'
      setError(errorMessage)
    } finally {
      setAutofilling(false)
    }
  }

  const handleComputeAggregate = async () => {
    if (!periodId) {
      setError('Please create a period first')
      return
    }
    try {
      setComputing(true)
      setError(null)
      await apiClient.computeAggregate(periodId)
      await loadData()
    } catch (err: unknown) {
      console.error('Error computing aggregate:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to compute aggregate'
      setError(errorMessage)
    } finally {
      setComputing(false)
    }
  }

  const loadData = useCallback(async () => {
    if (!periodId) return

    try {
      setLoading(true)
      setError(null)

      const [overviewData, categoriesData, trendsData, insightsData, comparisonData] = await Promise.all([
        apiClient.getBudgetOverview(periodId).catch(() => null),
        apiClient.getCategoryBudgets(periodId).catch(() => ({ items: [] })),
        apiClient.getBudgetTrends(periodId).catch(() => ({ items: [] })),
        apiClient.getBudgetInsights(periodId).catch(() => ({ insights: [] })),
        apiClient.getPeriodComparison(periodId).catch(() => null)
      ])

      setOverview(overviewData)
      setCategories(categoriesData.items || [])
      setTrends(trendsData.items || [])
      setInsights(insightsData.insights || [])
      setComparison(comparisonData)
    } catch (err: unknown) {
      console.error('Error loading data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [periodId])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(212,175,55,0.5)]">
            BudgetPilot
          </h1>
            <div className="text-gray-400 text-sm">Periodized Budget Planning</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              onClick={handleCreatePeriod}
              disabled={creatingPeriod || !periodStart || !periodEnd}
            >
              {creatingPeriod ? 'Creating...' : '1) Create Period'}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              onClick={handleGenerateRecommendations}
              disabled={generating || !periodId}
            >
              {generating ? 'Generating...' : '2) Generate Recos'}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              onClick={handleAutofillCategories}
              disabled={autofilling || !periodId}
            >
              {autofilling ? 'Autofilling...' : '3) Autofill Categories'}
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-black text-sm font-semibold transition-colors disabled:opacity-50"
              onClick={handleComputeAggregate}
              disabled={computing || !periodId}
            >
              {computing ? 'Computing...' : '4) Compute'}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Period Picker */}
        <div className="mb-6">
          <PeriodPicker
            onPeriodChange={handlePeriodChange}
            defaultType={periodType}
            selectedStart={periodStart}
            selectedEnd={periodEnd}
                    />
                  </div>

        {/* Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Metric
            label="Period"
            value={periodId ? 'Active' : 'Not created'}
            hint={periodId ? `${periodStart} → ${periodEnd}` : 'Create a period to start'}
          />
          <Metric
            label="Plan"
            value={overview?.plan_name || '—'}
            hint={overview?.plan_code || ''}
          />
          <Metric
            label="Income"
            value={formatCurrency(overview?.income || 0)}
          />
          <Metric
            label="Status"
            value={overview ? 'Ready' : periodId ? 'Pending' : 'Not Started'}
          />
        </section>

        {/* Band Progress */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <BandProgress
            label="Needs"
            spent={overview?.needs_spent || 0}
            plan={overview?.needs_plan || 0}
          />
          <BandProgress
            label="Wants"
            spent={overview?.wants_spent || 0}
            plan={overview?.wants_plan || 0}
          />
          <BandProgress
            label="Assets"
            spent={overview?.assets_spent || 0}
            plan={overview?.assets_plan || 0}
          />
        </section>

        {/* Tabs Navigation */}
        {periodId && (
          <div className="mb-6 flex gap-2 border-b border-gray-700">
            {(['overview', 'insights', 'simulator'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? 'text-yellow-400 border-b-2 border-yellow-400'
                    : 'text-gray-400 hover:text-gray-300'
                      }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
                  </div>
                )}

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Trend Charts & Allocation */}
            {trends.length > 0 && (
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <TrendChart
                  data={trends.map((t) => ({
                    period: t.period,
                    spent: t.needs_spent + t.wants_spent,
                    plan: t.needs_plan + t.wants_plan,
                    savings: t.assets_spent
                  }))}
                  title="Spending Trend"
                  showSavings={true}
                />
                {overview && (
                  <AllocationDonut
                    data={[
                      {
                        name: 'Needs',
                        value: overview.needs_plan,
                        color: AllocationColors.needs
                      },
                      {
                        name: 'Wants',
                        value: overview.wants_plan,
                        color: AllocationColors.wants
                      },
                      {
                        name: 'Assets',
                        value: overview.assets_plan,
                        color: AllocationColors.assets
                      }
                    ]}
                    title="Budget Allocation"
                  />
                )}
              </section>
                )}

            {/* Category Microcards */}
            {categories.length > 0 && (
              <section className="mb-6 space-y-4">
                {(['needs', 'wants', 'assets'] as const).map((band) => {
                  const bandCategories = categories.filter((c) => c.band === band)
                  if (bandCategories.length === 0) return null
                  return (
                    <CategoryMicrocards
                      key={band}
                      items={bandCategories.map((c) => ({
                        category: c.category,
                        spent: 0, // TODO: Get actual spent from transactions
                        plan: c.planned_amount
                      }))}
                      band={band}
                    />
                  )
                })}
              </section>
            )}

            {/* Main Content Grid */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="lg:col-span-2">
                <CategoryTable data={categories} />
              </div>
              <div className="space-y-4">
                <BudgetRecommendations
                  items={recommendations}
                  periodId={periodId}
                  activePlanCode={overview?.plan_code}
                  onCommit={async (_planCode) => {
                    await loadData()
                  }}
                />
                {comparison && <PeriodComparison comparison={comparison} />}
              </div>
            </section>
          </>
        )}

        {activeTab === 'insights' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InsightsPanel insights={insights} />
            {comparison && <PeriodComparison comparison={comparison} />}
            {trends.length > 0 && (
              <div className="lg:col-span-2">
                <TrendChart
                  data={trends.map((t) => ({
                    period: t.period,
                    spent: t.needs_spent + t.wants_spent + t.assets_spent,
                    plan: t.needs_plan + t.wants_plan + t.assets_plan
                  }))}
                  title="Total Spending vs Plan"
                />
                        </div>
                      )}
          </section>
        )}

        {activeTab === 'simulator' && overview && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WhatIfSimulator
              initialNeeds={(overview.needs_plan / overview.income) * 100}
              initialWants={(overview.wants_plan / overview.income) * 100}
              initialAssets={(overview.assets_plan / overview.income) * 100}
              income={overview.income}
              onUpdate={(needs, wants, assets) => {
                // Update local state for preview (not persisted until commit)
                console.log('Simulated allocation:', { needs, wants, assets })
              }}
            />
            {overview && (
              <AllocationDonut
                data={[
                  {
                    name: 'Needs',
                    value: overview.needs_plan,
                    color: AllocationColors.needs
                  },
                  {
                    name: 'Wants',
                    value: overview.wants_plan,
                    color: AllocationColors.wants
                  },
                  {
                    name: 'Assets',
                    value: overview.assets_plan,
                    color: AllocationColors.assets
                  }
                ]}
                title="Current Allocation"
              />
            )}
          </section>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mt-6 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
            <p className="mt-2 text-gray-400 text-sm">Loading data...</p>
          </div>
        )}

        {/* Empty State */}
        {!periodId && !loading && (
          <div className="mt-6 bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <p className="text-gray-400 mb-4">No period created yet. Create a period to get started.</p>
            <button
              onClick={handleCreatePeriod}
              disabled={creatingPeriod || !periodStart || !periodEnd}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black rounded-lg font-semibold transition-colors"
            >
              {creatingPeriod ? 'Creating...' : 'Create Period'}
            </button>
          </div>
        )}

        <footer className="mt-10 text-center text-gray-500 text-xs">
          BudgetPilot MVP • Adjust amounts and styles as needed
        </footer>
      </div>
    </div>
  )
}
