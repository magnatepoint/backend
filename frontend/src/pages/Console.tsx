import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '../lib/api'
import { formatCurrency } from '../lib/utils'

interface SpendingStats {
  period: string
  total_spending: number
  total_income: number
  net_flow: number
  cumulative_balance?: number
  transaction_count: number
  top_category: string | null
  top_merchant: string | null
  avg_transaction: number
}

interface CategoryData {
  category: string
  amount: number
  percentage: number
  transaction_count: number
}

interface TrendData {
  period: string
  spending: number
  date: string
}

interface MerchantData {
  merchant: string
  total_spending: number
  transaction_count: number
}

export default function Console() {
  const [stats, setStats] = useState<SpendingStats | null>(null)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [trends, setTrends] = useState<TrendData[]>([])
  const [merchants, setMerchants] = useState<MerchantData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<string>('month')

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const [statsData, categoriesData, trendsData, merchantsData] = await Promise.all([
        apiClient.getSpendingStats(period),
        apiClient.getSpendingByCategory(period),
        apiClient.getSpendingTrends('3months'),
        apiClient.getTopMerchants(5, period)
      ])
      
      setStats(statsData)
      setCategories(categoriesData.categories || [])
      setTrends(trendsData.trends || [])
      setMerchants(merchantsData.merchants || [])
    } catch (err: unknown) {
      console.error('Error loading data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load statistics'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Monytix Console</h1>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
            <p className="mt-4 text-gray-400">Loading statistics...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Monytix Console</h1>
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={loadAllData}
              className="mt-4 px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Helper function to format Indian number system (lakhs/crores)
  const formatIndianNumber = (num: number): string => {
    if (num >= 10000000) {
      return (num / 10000000).toFixed(2) + ' Cr'
    } else if (num >= 100000) {
      return (num / 100000).toFixed(2) + ' L'
    }
    return num.toLocaleString('en-IN')
  }

  // Calculate max spending for trend visualization
  const maxTrendSpending = trends.length > 0 
    ? Math.max(...trends.map(t => t.spending))
    : 0

  // Calculate max category amount for visualization
  const maxCategoryAmount = categories.length > 0
    ? Math.max(...categories.map(c => c.amount))
    : 0

  const periodOptions = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' }
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Period Selector */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 md:mb-0 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            Monytix Console
          </h1>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={`px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm sm:text-base transition-all ${
                  period === option.value
                    ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/50'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 md:mb-8">
            {/* Total Balance */}
            <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 transition-all duration-300 shadow-lg ${
              (stats.cumulative_balance || 0) >= 0 
                ? 'hover:border-green-500 hover:shadow-green-500/20' 
                : 'hover:border-red-500 hover:shadow-red-500/20'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Total Balance</h3>
                <span className={`text-lg sm:text-xl ${(stats.cumulative_balance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(stats.cumulative_balance || 0) >= 0 ? '💵' : '💸'}
                </span>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold mb-1 ${(stats.cumulative_balance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(stats.cumulative_balance || 0)}
              </p>
              <p className="text-xs text-gray-500">
                {formatIndianNumber(Math.abs(stats.cumulative_balance || 0))}
              </p>
            </div>
            
            {/* Monthly Spend */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-red-500 transition-all duration-300 shadow-lg hover:shadow-red-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Monthly Spend</h3>
                <span className="text-red-400 text-lg sm:text-xl">💸</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-red-400 mb-1">
                {formatCurrency(stats.total_spending || 0)}
              </p>
              <p className="text-xs text-gray-500">
                {formatIndianNumber(stats.total_spending || 0)}
              </p>
            </div>
            
            {/* Income */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-green-500 transition-all duration-300 shadow-lg hover:shadow-green-500/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Income</h3>
                <span className="text-green-400 text-lg sm:text-xl">💰</span>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-green-400 mb-1">
                {formatCurrency(stats.total_income || 0)}
              </p>
              <p className="text-xs text-gray-500">
                {formatIndianNumber(stats.total_income || 0)}
              </p>
            </div>
            
            {/* Net Flow */}
            <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 transition-all duration-300 shadow-lg ${
              (stats.net_flow || 0) >= 0 
                ? 'hover:border-green-500 hover:shadow-green-500/20' 
                : 'hover:border-red-500 hover:shadow-red-500/20'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Net Flow</h3>
                <span className={`text-lg sm:text-xl ${(stats.net_flow || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(stats.net_flow || 0) >= 0 ? '📈' : '📉'}
                </span>
              </div>
              <p className={`text-2xl sm:text-3xl font-bold mb-1 ${(stats.net_flow || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(stats.net_flow || 0)}
              </p>
              <p className="text-xs text-gray-500">
                {formatIndianNumber(Math.abs(stats.net_flow || 0))}
              </p>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* Spending Trends */}
          {trends.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
                <span>📈</span> Spending Trends (3 Months)
              </h2>
              <div className="space-y-3 sm:space-y-4">
                {trends.slice(-6).map((trend, idx) => {
                  const width = maxTrendSpending > 0 ? (trend.spending / maxTrendSpending) * 100 : 0
                  return (
                    <div key={idx} className="flex items-end gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">
                            {new Date(trend.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-sm font-semibold text-white">
                            {formatCurrency(trend.spending)}
                          </span>
                        </div>
                        <div className="h-8 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-full transition-all duration-500"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top Merchants */}
          {merchants.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
                <span>🏪</span> Top Merchants
              </h2>
              <div className="space-y-3 sm:space-y-4">
                {merchants.map((merchant, idx) => (
                  <div key={idx} className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white">{merchant.merchant}</span>
                      <span className="text-yellow-400 font-bold">
                        {formatCurrency(merchant.total_spending)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{merchant.transaction_count} transactions</span>
                      <span>•</span>
                      <span>Avg: {formatCurrency(merchant.total_spending / merchant.transaction_count)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        {categories.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mb-6">
            <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📂</span> Spending by Category
            </h2>
            <div className="space-y-3 sm:space-y-4">
              {categories.slice(0, 6).map((category, idx) => {
                const width = maxCategoryAmount > 0 ? (category.amount / maxCategoryAmount) * 100 : 0
                return (
                  <div key={idx} className="bg-gray-700/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white">{category.category}</span>
                      <div className="text-right">
                        <span className="text-yellow-400 font-bold block">
                          {formatCurrency(category.amount)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {category.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 rounded-full transition-all duration-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {category.transaction_count} transactions
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
