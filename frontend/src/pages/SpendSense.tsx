import { useEffect, useState, useCallback, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts'
import { apiClient } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { PageSkeleton } from '../components/LoadingSkeleton'
import { Tooltip } from '../components/Tooltip'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { SwipeableRow } from '../components/SwipeableRow'

interface SpendingStats {
  period: string
  total_spending: number
  total_income: number
  net_flow: number
  transaction_count: number
  top_category: string | null
  top_merchant: string | null
  avg_transaction: number
}

interface TrendData {
  period: string
  spending: number
  date: string
}

interface CategoryData {
  category: string
  amount: number
  percentage: number
  transaction_count: number
}

interface Transaction {
  id?: string
  txn_id?: string
  merchant?: string
  merchant_name_norm?: string
  amount?: number | string
  direction?: 'credit' | 'debit'
  transaction_type?: 'credit' | 'debit'
  category?: string
  category_code?: string
  transaction_date?: string
  txn_date?: string
}

interface InsightData {
  type: string
  category: string
  change_percentage: number
  message: string
}

export default function SpendSense() {
  const { showToast } = useToast()
  const [stats, setStats] = useState<SpendingStats | null>(null)
  const [trends, setTrends] = useState<TrendData[]>([])
  const [byCategory, setByCategory] = useState<CategoryData[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [insights, setInsights] = useState<InsightData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState('month')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'date' | 'merchant' | 'category' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [editForm, setEditForm] = useState<{
    merchant: string
    category: string
    amount: string
    date: string
  } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Array<{ category_code: string; category_name: string }>>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState<{
    merchant: string
    category: string
    subcategory: string
    amount: string
    date: string
    transaction_type: 'credit' | 'debit'
  }>({
    merchant: '',
    category: '',
    subcategory: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    transaction_type: 'debit'
  })
  const [subcategories, setSubcategories] = useState<Array<{ subcategory_code: string; subcategory_name: string }>>([])

  // Load categories for edit form
  useEffect(() => {
    apiClient.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
  }, [])

  // Load subcategories when category changes in add form
  useEffect(() => {
    if (addForm.category && showAddModal) {
      apiClient.getSubcategories(addForm.category)
        .then(subs => setSubcategories(subs))
        .catch(() => setSubcategories([]))
    } else {
      setSubcategories([])
    }
  }, [addForm.category, showAddModal])

  const handleEdit = (txn: Transaction) => {
    const txnId = txn.txn_id || txn.id
    if (!txnId) return
    
    // Format date for input field (YYYY-MM-DD)
    const txnDate = txn.transaction_date || txn.txn_date
    let dateStr = ''
    if (txnDate) {
      if (typeof txnDate === 'string') {
        dateStr = txnDate.split('T')[0]
      } else {
        dateStr = new Date(txnDate).toISOString().split('T')[0]
      }
    } else {
      dateStr = new Date().toISOString().split('T')[0]
    }
    
    setEditingTransaction(txn)
    setEditForm({
      merchant: txn.merchant_name_norm || txn.merchant || '',
      category: txn.category_code || txn.category || '',
      amount: String(Math.abs(Number(txn.amount) || 0)),
      date: dateStr
    })
  }

  const handleSaveEdit = async () => {
    if (!editingTransaction || !editForm) return
    
    const txnId = editingTransaction.txn_id || editingTransaction.id
    if (!txnId) return

    try {
      // Format date as ISO string for API
      const dateISO = new Date(editForm.date).toISOString()
      
      // Amount should be positive - backend uses direction/transaction_type to determine credit/debit
      const amount = Math.abs(parseFloat(editForm.amount))
      
      await apiClient.updateTransaction(txnId, {
        merchant: editForm.merchant,
        category: editForm.category,
        amount: amount,
        transaction_date: dateISO
      })
      
      setEditingTransaction(null)
      setEditForm(null)
      // Reload transactions
      loadData()
      showToast('Transaction updated successfully', 'success')
    } catch (err) {
      console.error('Failed to update transaction:', err)
      showToast('Failed to update transaction. Please try again.', 'error')
    }
  }

  const handleDelete = async (txn: Transaction) => {
    const txnId = txn.txn_id || txn.id
    if (!txnId) return

    if (!confirm(`Are you sure you want to delete this transaction?\n${txn.merchant_name_norm || txn.merchant || 'N/A'} - ${formatCurrency(Math.abs(Number(txn.amount) || 0))}`)) {
      return
    }

    try {
      setDeletingId(txnId)
      await apiClient.deleteTransaction(txnId)
      // Reload transactions
      loadData()
      showToast('Transaction deleted successfully', 'success')
    } catch (err) {
      console.error('Failed to delete transaction:', err)
      showToast('Failed to delete transaction. Please try again.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleAddTransaction = async () => {
    if (!addForm.merchant || !addForm.amount || !addForm.date) {
      showToast('Please fill in all required fields (Merchant, Amount, Date)', 'warning')
      return
    }

    try {
      // Format date as ISO string for API
      const dateISO = new Date(addForm.date).toISOString()
      
      // Amount should be positive - backend uses transaction_type to determine credit/debit
      const amount = Math.abs(parseFloat(addForm.amount))
      
      await apiClient.createTransaction({
        amount: amount,
        transaction_date: dateISO,
        description: addForm.merchant,
        merchant: addForm.merchant,
        category: addForm.category || undefined,
        subcategory: addForm.subcategory || undefined,
        transaction_type: addForm.transaction_type
      })
      
      // Reset form and close modal
      setAddForm({
        merchant: '',
        category: '',
        subcategory: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        transaction_type: 'debit'
      })
      setSubcategories([])
      setShowAddModal(false)
      // Reload transactions
      loadData()
      showToast('Transaction added successfully', 'success')
    } catch (err) {
      console.error('Failed to create transaction:', err)
      showToast('Failed to create transaction. Please try again.', 'error')
    }
  }

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load all data in parallel, with individual error handling for each request
      // This ensures that if one request fails (e.g., CORS), others can still succeed
      const [statsData, trendsData, categoryData, txnData, insightsData] = await Promise.all([
        apiClient.getSpendingStats(period).catch((err) => {
          console.warn('Failed to load spending stats:', err)
          return null
        }),
        apiClient.getSpendingTrends('3months').catch((err) => {
          console.warn('Failed to load spending trends:', err)
          return { trends: [] }
        }),
        apiClient.getSpendingByCategory(period).catch((err) => {
          console.warn('Failed to load spending by category:', err)
          return { categories: [] }
        }),
        apiClient.getTransactions(0, 20).catch(() => {
          // Silently handle transaction loading errors (often CORS-related)
          // Transactions are optional for the page to function
          return []
        }),
        apiClient.getInsights().catch((err) => {
          console.warn('Failed to load insights:', err)
          return { insights: [] }
        })
      ])
      
      setStats(statsData)
      setTrends(trendsData.trends || [])
      setByCategory(categoryData.categories || [])
      setTransactions(Array.isArray(txnData) ? txnData : [])
      setInsights(insightsData.insights || [])
      
      // Only show error if critical data (stats) failed to load
      if (!statsData) {
        setError('Failed to load spending statistics. Please try again.')
      }
    } catch (err: unknown) {
      console.error('Unexpected error loading data:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Listen for auth state changes to reload data when user changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Clear all state and reload data when user changes
        setStats(null)
        setTrends([])
        setByCategory([])
        setTransactions([])
        setInsights([])
        loadData()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [loadData])

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    // First, filter by search query
    let filtered = transactions
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = transactions.filter((txn) => {
        const merchant = (txn.merchant_name_norm || txn.merchant || '').toLowerCase()
        const category = (txn.category_code || txn.category || '').toLowerCase()
        const amount = String(txn.amount || '').toLowerCase()
        
        return merchant.includes(query) || category.includes(query) || amount.includes(query)
      })
    }
    
    // Then, sort
    const sorted = [...filtered].sort((a, b) => {
      let aValue: string | number = ''
      let bValue: string | number = ''
      
      switch (sortField) {
        case 'date':
          aValue = new Date(a.transaction_date || a.txn_date || 0).getTime()
          bValue = new Date(b.transaction_date || b.txn_date || 0).getTime()
          break
        case 'merchant':
          aValue = (a.merchant_name_norm || a.merchant || '').toLowerCase()
          bValue = (b.merchant_name_norm || b.merchant || '').toLowerCase()
          break
        case 'category':
          aValue = (a.category_code || a.category || '').toLowerCase()
          bValue = (b.category_code || b.category || '').toLowerCase()
          break
        case 'amount':
          aValue = Math.abs(Number(a.amount) || 0)
          bValue = Math.abs(Number(b.amount) || 0)
          break
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    
    return sorted
  }, [transactions, searchQuery, sortField, sortDirection])

  // Paginate transactions
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredAndSortedTransactions.slice(startIndex, endIndex)
  }, [filteredAndSortedTransactions, currentPage, itemsPerPage])

  const totalPages = Math.ceil(filteredAndSortedTransactions.length / itemsPerPage)

  // Handle column sorting
  const handleSort = (field: 'date' | 'merchant' | 'category' | 'amount') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setCurrentPage(1) // Reset to first page when sorting
  }

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredAndSortedTransactions.length === 0) {
      showToast('No transactions to export', 'warning')
      return
    }

    const headers = ['Date', 'Merchant', 'Category', 'Amount', 'Type']
    const rows = filteredAndSortedTransactions.map((txn) => {
      const date = formatDate(txn.transaction_date || txn.txn_date || new Date())
      const merchant = txn.merchant_name_norm || txn.merchant || 'N/A'
      const category = txn.category_code || txn.category || 'Uncategorized'
      const amount = Math.abs(Number(txn.amount) || 0)
      const type = (txn.direction || txn.transaction_type) === 'credit' ? 'Credit' : 'Debit'
      
      return [date, merchant, category, amount.toString(), type]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `transactions_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    showToast(`Exported ${filteredAndSortedTransactions.length} transactions to CSV`, 'success')
  }

  // Calculate max values for visualizations
  const maxTrendSpending = trends.length > 0 
    ? Math.max(...trends.map(t => t.spending || 0))
    : 0

  const periodOptions = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' }
  ]

  // Pull to refresh
  const { isRefreshing, pullProgress, elementRef } = usePullToRefresh({
    onRefresh: loadData,
    enabled: true,
  })

  if (loading) {
    return <PageSkeleton />
  }

  return (
    <div 
      ref={elementRef as React.RefObject<HTMLDivElement>}
      className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8 relative"
    >
      {/* Pull to Refresh Indicator */}
      {isRefreshing && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in">
          <svg className="w-5 h-5 animate-spin text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm text-white">Refreshing...</span>
        </div>
      )}
      
      {pullProgress > 0 && !isRefreshing && (
        <div 
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-gray-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-opacity"
          style={{ opacity: Math.min(pullProgress, 1) }}
        >
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span className="text-sm text-white">Pull to refresh</span>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        {/* Header with Period Selector */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 md:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 md:mb-0 bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            SpendSense
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

        {/* Quick Insights Section */}
        {stats && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Quick Insights
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              {/* Top Category Card */}
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">TOP CATEGORY</h3>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {stats.top_category || 'N/A'}
                </p>
              </div>

              {/* Top Merchant Card */}
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">TOP MERCHANT</h3>
                <p className="text-xl sm:text-2xl font-bold text-white">
                  {stats.top_merchant || 'N/A'}
                </p>
              </div>

              {/* Avg Transaction Card */}
              <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">AVG TRANSACTION</h3>
                <p className="text-xl sm:text-2xl font-bold text-yellow-400">
                  {formatCurrency(stats.avg_transaction || 0)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Two Column Layout: Trends and Categories Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* Enhanced Monthly Trend Chart */}
          {trends.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-slide-up hover:border-yellow-500/30 transition-all duration-300">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-yellow-400 flex items-center gap-2">
                  <span>📈</span> Spending Trends (3 Months)
                </h2>
                <Tooltip content="Your spending pattern over the last 3 months" position="right">
                  <svg className="w-5 h-5 text-gray-400 hover:text-gray-300 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </div>
              <div className="h-48 sm:h-64 flex items-end gap-1 sm:gap-2 overflow-x-auto">
                {trends.map((trend, idx) => {
                  const height = maxTrendSpending > 0 ? ((trend.spending || 0) / maxTrendSpending) * 100 : 0
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center group">
                      <div className="w-full relative h-full flex items-end">
                        <div
                          className="w-full bg-gradient-to-t from-yellow-600 via-yellow-500 to-yellow-400 rounded-t transition-all duration-500 hover:from-yellow-500 hover:via-yellow-400 hover:to-yellow-300"
                          style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                        />
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                          {formatCurrency(trend.spending || 0)}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-2 text-center">
                        {new Date(trend.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Spending by Category Pie Chart */}
          {byCategory.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-slide-up hover:border-yellow-500/30 transition-all duration-300">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-yellow-400 flex items-center gap-2">
                  <span>📂</span> Spending by Category
                </h2>
                <Tooltip content="Breakdown of your spending by category" position="right">
                  <svg className="w-5 h-5 text-gray-400 hover:text-gray-300 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Tooltip>
              </div>
              <div className="w-full">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={byCategory.map(cat => ({
                        name: cat.category,
                        value: cat.amount,
                        percentage: cat.percentage
                      }))}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {byCategory.map((_, index) => {
                        // Color palette for categories
                        const colors = [
                          '#fbbf24', // yellow-400
                          '#f59e0b', // amber-500
                          '#ef4444', // red-500
                          '#10b981', // green-500
                          '#3b82f6', // blue-500
                          '#8b5cf6', // purple-500
                          '#ec4899', // pink-500
                          '#06b6d4', // cyan-500
                          '#f97316', // orange-500
                          '#84cc16', // lime-500
                        ]
                        return (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={colors[index % colors.length]} 
                          />
                        )
                      })}
                    </Pie>
                    <RechartsTooltip
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
            </div>
          )}
        </div>

        {/* Insights Banner - Less Prominent, Below Main Content */}
        {insights.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3 text-gray-400">Key Insights</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {insights.slice(0, 2).map((insight, idx) => {
                const isSignificantChange = Math.abs(insight.change_percentage) > 50
                
                return (
                  <div
                    key={idx}
                    className={`bg-gradient-to-r rounded-lg p-4 border ${
                      insight.change_percentage > 0
                        ? 'from-red-900/20 to-red-800/10 border-red-500/30'
                        : 'from-green-900/20 to-green-800/10 border-green-500/30'
                    } ${isSignificantChange ? 'ring-2 ring-opacity-50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`text-xl ${insight.change_percentage > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {insight.change_percentage > 0 ? '⚠️' : '✅'}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-white text-sm">{insight.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {insight.category.replace(/_/g, ' ').toUpperCase()} • {Math.abs(insight.change_percentage).toFixed(1)}% {insight.change_percentage > 0 ? 'increase' : 'decrease'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Enhanced Recent Transactions */}
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-4">
            <h2 className="text-lg sm:text-xl font-bold text-yellow-400 flex items-center gap-2">
              <span>💳</span> Recent Transactions
            </h2>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              {/* Search Input */}
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1) // Reset to first page when searching
                  }}
                  placeholder="Search transactions..."
                  className="w-full px-4 py-2 pl-10 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500 text-sm"
                />
                <svg
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="flex gap-2">
                <Tooltip content="Export all filtered transactions to CSV file">
                  <button
                    onClick={handleExportCSV}
                    className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 hover:scale-105 active:scale-95 text-sm sm:text-base flex items-center gap-2 justify-center whitespace-nowrap shadow-md"
                    title="Export to CSV"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                </Tooltip>
                <Tooltip content="Add a new transaction manually">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold transition-all duration-200 hover:scale-105 active:scale-95 text-sm sm:text-base flex items-center gap-2 justify-center whitespace-nowrap shadow-lg shadow-yellow-500/20"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Transaction
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
          {filteredAndSortedTransactions.length > 0 ? (
            <>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="inline-block min-w-full align-middle">
                  <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th 
                          className="text-left py-3 px-2 sm:px-4 text-gray-400 font-semibold uppercase text-xs sm:text-sm cursor-pointer hover:text-yellow-400 transition-colors"
                          onClick={() => handleSort('date')}
                        >
                          <div className="flex items-center gap-2">
                            Date
                            {sortField === 'date' && (
                              <span className="text-yellow-400">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <Tooltip content="Click to sort by merchant name">
                          <th 
                            className="text-left py-3 px-2 sm:px-4 text-gray-400 font-semibold uppercase text-xs sm:text-sm cursor-pointer hover:text-yellow-400 transition-all duration-200"
                            onClick={() => handleSort('merchant')}
                          >
                            <div className="flex items-center gap-2">
                              Merchant
                              {sortField === 'merchant' && (
                                <span className="text-yellow-400 animate-fade-in">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                        </Tooltip>
                        <Tooltip content="Click to sort by category">
                          <th 
                            className="text-left py-3 px-2 sm:px-4 text-gray-400 font-semibold uppercase text-xs sm:text-sm hidden sm:table-cell cursor-pointer hover:text-yellow-400 transition-all duration-200"
                            onClick={() => handleSort('category')}
                          >
                            <div className="flex items-center gap-2">
                              Category
                              {sortField === 'category' && (
                                <span className="text-yellow-400 animate-fade-in">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                        </Tooltip>
                        <Tooltip content="Click to sort by amount">
                          <th 
                            className="text-right py-3 px-2 sm:px-4 text-gray-400 font-semibold uppercase text-xs sm:text-sm cursor-pointer hover:text-yellow-400 transition-all duration-200"
                            onClick={() => handleSort('amount')}
                          >
                            <div className="flex items-center justify-end gap-2">
                              Amount
                              {sortField === 'amount' && (
                                <span className="text-yellow-400 animate-fade-in">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                        </Tooltip>
                        <th className="text-center py-3 px-2 sm:px-4 text-gray-400 font-semibold uppercase text-xs sm:text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTransactions.map((txn, idx) => {
                      const isCredit = (txn.direction || txn.transaction_type) === 'credit'
                      return (
                        <SwipeableRow
                          key={idx}
                          onSwipeLeft={() => handleDelete(txn)}
                          onSwipeRight={() => handleEdit(txn)}
                          leftAction={
                            <div className="flex items-center gap-2 text-white">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span className="font-semibold">Delete</span>
                            </div>
                          }
                          rightAction={
                            <div className="flex items-center gap-2 text-white">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span className="font-semibold">Edit</span>
                            </div>
                          }
                          enabled={typeof window !== 'undefined' && window.innerWidth < 640}
                          className="sm:block hidden"
                        >
                          <tr 
                            className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
                          >
                          <td className="py-3 px-2 sm:px-4 text-gray-400 text-xs sm:text-sm whitespace-nowrap">
                            {formatDate(txn.transaction_date || txn.txn_date || new Date())}
                          </td>
                          <td className="py-3 px-2 sm:px-4 font-medium text-white text-xs sm:text-sm">
                            <div className="max-w-[120px] sm:max-w-none truncate sm:truncate-none">
                              {txn.merchant_name_norm || txn.merchant || 'N/A'}
                            </div>
                            <div className="sm:hidden mt-1">
                              <span className="inline-block bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded text-xs">
                                {txn.category_code || txn.category || 'Uncategorized'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                            <span className="inline-block bg-gray-700/50 text-gray-300 px-2 py-1 rounded text-sm">
                              {txn.category_code || txn.category || 'Uncategorized'}
                            </span>
                          </td>
                          <td className={`py-3 px-2 sm:px-4 text-right font-bold text-xs sm:text-sm ${
                            isCredit ? 'text-green-400' : 'text-red-400'
                          }`}>
                            <span className="flex items-center justify-end gap-1 whitespace-nowrap">
                              {isCredit ? '+' : '-'}
                              {formatCurrency(Math.abs(Number(txn.amount) || 0))}
                            </span>
                          </td>
                          <td className="py-3 px-2 sm:px-4">
                            <div className="flex items-center justify-center gap-2 sm:gap-3">
                            <button
                              onClick={() => handleEdit(txn)}
                              className="text-blue-400 hover:text-blue-300 transition-colors p-1"
                              title="Edit transaction"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(txn)}
                              disabled={deletingId === (txn.txn_id || txn.id)}
                              className="text-red-400 hover:text-red-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors p-1"
                              title="Delete transaction"
                            >
                              {deletingId === (txn.txn_id || txn.id) ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                        </SwipeableRow>
                      )
                    })}
                </tbody>
              </table>
              </div>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>Showing</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-yellow-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>of {filteredAndSortedTransactions.length} transactions</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                            currentPage === pageNum
                              ? 'bg-yellow-500 text-black font-semibold'
                              : 'bg-gray-700 hover:bg-gray-600 text-white'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">
              {searchQuery ? (
                <>
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-lg font-medium mb-2">No transactions found</p>
                  <p className="text-sm">Try adjusting your search query</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                  >
                    Clear Search
                  </button>
                </>
              ) : (
                <>
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-lg font-medium mb-2">No transactions yet</p>
                  <p className="text-sm mb-4">Get started by adding your first transaction</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold transition-colors"
                  >
                    Add Transaction
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Add Transaction Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400">Add Transaction</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Merchant *</label>
                  <input
                    type="text"
                    value={addForm.merchant}
                    onChange={(e) => setAddForm({ ...addForm, merchant: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                    placeholder="Enter merchant name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                  <select
                    value={addForm.category}
                    onChange={(e) => setAddForm({ ...addForm, category: e.target.value, subcategory: '' })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.category_code} value={cat.category_code}>
                        {cat.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                {addForm.category && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Subcategory</label>
                    <select
                      value={addForm.subcategory}
                      onChange={(e) => setAddForm({ ...addForm, subcategory: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                      disabled={subcategories.length === 0}
                    >
                      <option value="">Select subcategory (optional)</option>
                      {subcategories.map((sub) => (
                        <option key={sub.subcategory_code} value={sub.subcategory_code}>
                          {sub.subcategory_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Transaction Type *</label>
                  <select
                    value={addForm.transaction_type}
                    onChange={(e) => setAddForm({ ...addForm, transaction_type: e.target.value as 'credit' | 'debit' })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  >
                    <option value="debit">Debit (Expense)</option>
                    <option value="credit">Credit (Income)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹) *</label>
                  <input
                    type="number"
                    value={addForm.amount}
                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                    min="0"
                    step="0.01"
                    placeholder="Enter amount"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Date *</label>
                  <input
                    type="date"
                    value={addForm.date}
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  onClick={handleAddTransaction}
                  className="flex-1 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold transition-colors text-sm sm:text-base"
                >
                  Add Transaction
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setAddForm({
                      merchant: '',
                      category: '',
                      subcategory: '',
                      amount: '',
                      date: new Date().toISOString().split('T')[0],
                      transaction_type: 'debit'
                    })
                    setSubcategories([])
                  }}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors text-sm sm:text-base"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Transaction Modal */}
        {editingTransaction && editForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400">Edit Transaction</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Merchant</label>
                  <input
                    type="text"
                    value={editForm.merchant}
                    onChange={(e) => setEditForm({ ...editForm, merchant: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat.category_code} value={cat.category_code}>
                        {cat.category_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹)</label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black rounded-lg font-semibold transition-colors text-sm sm:text-base"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingTransaction(null)
                    setEditForm(null)
                  }}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors text-sm sm:text-base"
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
