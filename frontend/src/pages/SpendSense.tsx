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
import { SpendingCoach } from '../components/spendsense/SpendingCoach'
import { AnomalyDetector } from '../components/spendsense/AnomalyDetector'
import { CategoryTrendChart } from '../components/spendsense/CategoryTrendChart'
import { IncomeExpenseChart } from '../components/spendsense/IncomeExpenseChart'
import { BudgetDeviation } from '../components/spendsense/BudgetDeviation'
import { GoalImpact } from '../components/spendsense/GoalImpact'
import { CashFlowProjection } from '../components/spendsense/CashFlowProjection'
import { MerchantAnalytics } from '../components/spendsense/MerchantAnalytics'
import { FilterChips } from '../components/spendsense/FilterChips'
import { CategoryDrilldownModal } from '../components/spendsense/CategoryDrilldownModal'
import { Milestones } from '../components/spendsense/Milestones'
import { motion } from 'framer-motion'

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
  description?: string
  transaction_date?: string
  txn_date?: string
  tags?: string[]
}

interface InsightData {
  type: string
  category: string
  change_percentage: number
  message: string
}

type TransactionWithMeta = Transaction & {
  paymentMode: string
  merchantType: string
  locationLabel: string
}

const KNOWN_CITIES = [
  'bangalore',
  'bengaluru',
  'mumbai',
  'delhi',
  'gurgaon',
  'hyderabad',
  'chennai',
  'pune',
  'kolkata',
  'ahmedabad',
  'kochi',
  'jaipur'
]

const merchantTypeMap: Record<string, string> = {
  groceries: 'Essential Retail',
  food_dining: 'Food & Dining',
  dining_out: 'Food & Dining',
  entertainment: 'Lifestyle',
  shopping: 'Retail',
  transport: 'Transport & Travel',
  utilities: 'Bills & Utilities',
  housing_fixed: 'Housing',
  medical: 'Healthcare',
  fitness: 'Wellness',
  education: 'Education',
  income: 'Income',
  wants: 'Lifestyle',
  needs: 'Essentials',
  assets: 'Assets & Investing'
}

const inferPaymentMode = (txn: Transaction): string => {
  const text = `${txn.description || ''} ${txn.merchant || ''} ${txn.merchant_name_norm || ''}`.toLowerCase()
  if (text.includes('upi') || text.includes('gpay') || text.includes('phonepe') || text.includes('paytm')) {
    return 'UPI'
  }
  if (text.includes('visa') || text.includes('master') || text.includes('card') || text.includes('debit') || text.includes('credit')) {
    return 'Card'
  }
  if (text.includes('neft') || text.includes('rtgs') || text.includes('imps') || text.includes('bank transfer')) {
    return 'Bank'
  }
  if (text.includes('cash') || text.includes('atm')) {
    return 'Cash'
  }
  return 'Other'
}

const inferMerchantType = (txn: Transaction): string => {
  const categoryCode = (txn.category_code || txn.category || '').toLowerCase()
  if (merchantTypeMap[categoryCode]) {
    return merchantTypeMap[categoryCode]
  }
  if (categoryCode.includes('food') || categoryCode.includes('dining')) {
    return 'Food & Dining'
  }
  if (categoryCode.includes('travel') || categoryCode.includes('transport')) {
    return 'Transport & Travel'
  }
  if (categoryCode.includes('shopping') || categoryCode.includes('retail')) {
    return 'Retail'
  }
  return 'General'
}

const inferLocation = (txn: Transaction): string => {
  const text = `${txn.description || ''} ${txn.merchant || ''} ${txn.merchant_name_norm || ''}`.toLowerCase()
  for (const city of KNOWN_CITIES) {
    if (text.includes(city)) {
      return city
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    }
  }
  return 'Unknown'
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
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importBankCode, setImportBankCode] = useState<string>('GENERIC')
  const [importPassword, setImportPassword] = useState<string>('')
  const [importErrors, setImportErrors] = useState<Array<{ row: number; field: string | null; message: string }>>([])
  const [importing, setImporting] = useState(false)
  const [showGmailModal, setShowGmailModal] = useState(false)
  const [gmailAccounts, setGmailAccounts] = useState<Array<{ id: string; email: string; is_active: boolean }>>([])
  const [selectedGmailAccount, setSelectedGmailAccount] = useState<string>('')
  const [gmailETLMode, setGmailETLMode] = useState<string>('since_last')
  const [gmailETLFromDate, setGmailETLFromDate] = useState<string>('')
  const [gmailETLToDate, setGmailETLToDate] = useState<string>('')
  const [gmailETLStatus, setGmailETLStatus] = useState<{ batchId?: string; status?: string; loading: boolean }>({ loading: false })
  
  // Next-gen intelligence layer state
  const [activeTab, setActiveTab] = useState<'overview' | 'intelligence' | 'analytics' | 'budget' | 'goals'>('overview')
  const [aiAdvice, setAiAdvice] = useState<any[]>([])
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [categoryTrends, setCategoryTrends] = useState<any>(null)
  const [incomeExpense, setIncomeExpense] = useState<any>(null)
  const [budgetDeviation, setBudgetDeviation] = useState<any>(null)
  const [goalImpact, setGoalImpact] = useState<any>(null)
  const [cashFlowProjection, setCashFlowProjection] = useState<any>(null)
  const [merchantAnalytics, setMerchantAnalytics] = useState<any[]>([])
  const [loadingIntelligence, setLoadingIntelligence] = useState(false)
  
  // Filter and drilldown state
  const [drilldownCategory, setDrilldownCategory] = useState<{ category: string; categoryName: string } | null>(null)
  const [milestones] = useState<any[]>([])
  const [paymentModeFilter, setPaymentModeFilter] = useState<string[]>([])
  const [merchantTypeFilter, setMerchantTypeFilter] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState<string[]>([])
  const [hasShownInsightsToast, setHasShownInsightsToast] = useState(false)

  const toggleFilterValue = (value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => (prev.includes(value) ? prev.filter((entry) => entry !== value) : [...prev, value]))
  }

  const clearAllFilters = () => {
    setPaymentModeFilter([])
    setMerchantTypeFilter([])
    setLocationFilter([])
  }

  const handleCategoryDrilldown = (categoryCode: string, displayName: string) => {
    setDrilldownCategory({
      category: categoryCode,
      categoryName: displayName
    })
  }

  // Load categories for edit form
  useEffect(() => {
    apiClient.getCategories()
      .then(cats => setCategories(cats))
      .catch(() => setCategories([]))
  }, [])

  // Helper function to get category name from code
  const getCategoryName = (categoryCode?: string, category?: string): string => {
    if (!categoryCode && !category) return 'Uncategorized'
    const code = categoryCode || category
    const found = categories.find(cat => cat.category_code === code)
    return found ? found.category_name : (code || 'Uncategorized')
  }

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

  const transactionsWithMeta = useMemo<TransactionWithMeta[]>(() => {
    return transactions.map((txn) => {
      const paymentMode = inferPaymentMode(txn)
      const merchantType = inferMerchantType(txn)
      const locationLabel = inferLocation(txn)
      return { ...txn, paymentMode, merchantType, locationLabel }
    })
  }, [transactions])

  const paymentModeOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    transactionsWithMeta.forEach((txn) => {
      counts[txn.paymentMode] = (counts[txn.paymentMode] || 0) + 1
    })
    return Object.entries(counts)
      .map(([value, count]) => ({
        label: value,
        value,
        count
      }))
      .sort((a, b) => b.count - a.count)
  }, [transactionsWithMeta])

  const merchantTypeOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    transactionsWithMeta.forEach((txn) => {
      counts[txn.merchantType] = (counts[txn.merchantType] || 0) + 1
    })
    return Object.entries(counts)
      .map(([value, count]) => ({
        label: value,
        value,
        count
      }))
      .sort((a, b) => b.count - a.count)
  }, [transactionsWithMeta])

  const locationOptions = useMemo(() => {
    const counts: Record<string, number> = {}
    transactionsWithMeta.forEach((txn) => {
      counts[txn.locationLabel] = (counts[txn.locationLabel] || 0) + 1
    })
    return Object.entries(counts)
      .map(([value, count]) => ({
        label: value,
        value,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [transactionsWithMeta])

  const pieChartData = useMemo(() => {
    return byCategory.map((cat) => ({
      name: getCategoryName(cat.category, cat.category),
      categoryCode: cat.category,
      value: cat.amount,
      percentage: cat.percentage
    }))
  }, [byCategory, categories])

  // Load intelligence layer data
  const loadIntelligenceData = useCallback(async () => {
    setLoadingIntelligence(true)
    try {
      const [
        adviceData,
        anomaliesData,
        trendsData,
        incomeExpenseData,
        budgetData,
        goalsData,
        cashflowData,
        merchantMetricsData
      ] = await Promise.all([
        apiClient.getAISpendingAdvice().catch(() => ({ advice: [] })),
        apiClient.detectAnomalies().catch(() => ({ anomalies: [] })),
        apiClient.getCategoryTrends(6).catch(() => ({ categories: [] })),
        apiClient.getIncomeExpenseOverlay(6).catch(() => ({ data: [] })),
        apiClient.getBudgetDeviation().catch(() => ({ deviations: [] })),
        apiClient.getGoalImpact().catch(() => ({ goals: [] })),
        apiClient.getCashFlowProjection(3).catch(() => ({ projections: [] })),
        apiClient.getMerchantMetrics(10, 3).catch(() => ({ merchants: [] }))
      ])
      
      setAiAdvice(adviceData.advice || [])
      setAnomalies(anomaliesData.anomalies || [])
      setCategoryTrends(trendsData)
      setIncomeExpense(incomeExpenseData)
      setBudgetDeviation(budgetData)
      setGoalImpact(goalsData)
      setCashFlowProjection(cashflowData)
      setMerchantAnalytics(merchantMetricsData.merchants || [])
      if (!hasShownInsightsToast) {
        showToast('✨ AI Insights Updated!', 'success')
        setHasShownInsightsToast(true)
      }
    } catch (err) {
      console.error('Failed to load intelligence data:', err)
    } finally {
      setLoadingIntelligence(false)
    }
  }, [activeTab, hasShownInsightsToast, showToast])

  useEffect(() => {
    loadIntelligenceData()
  }, [loadIntelligenceData])

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
    // First, apply filter chips
    let filtered: TransactionWithMeta[] = transactionsWithMeta
    if (paymentModeFilter.length > 0) {
      filtered = filtered.filter((txn) => paymentModeFilter.includes(txn.paymentMode))
    }
    if (merchantTypeFilter.length > 0) {
      filtered = filtered.filter((txn) => merchantTypeFilter.includes(txn.merchantType))
    }
    if (locationFilter.length > 0) {
      filtered = filtered.filter((txn) => locationFilter.includes(txn.locationLabel))
    }
    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((txn) => {
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
  }, [transactionsWithMeta, searchQuery, sortField, sortDirection, paymentModeFilter, merchantTypeFilter, locationFilter])

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

  const handleBulkImport = async () => {
    if (!importFile) {
      showToast('Please select a file to import', 'warning')
      return
    }

    setImporting(true)
    setImportErrors([])

    try {
      const fileExt = importFile.name.toLowerCase()
      let result

      if (fileExt.endsWith('.xlsx') || fileExt.endsWith('.xls')) {
        // Use ETL endpoint for Excel with bank-specific parsing
        result = await apiClient.uploadExcelETL(importFile, importBankCode)
        showToast(`Imported ${result.records_staged || 0} records. Categorized automatically; you can edit categories in Recent Transactions.`, 'success')
        setShowImportModal(false)
        setImportFile(null)
        setImportBankCode('GENERIC')
        loadData() // Reload transactions
      } else if (fileExt.endsWith('.pdf')) {
        // Use ETL endpoint for PDF with bank-specific parsing
        result = await apiClient.uploadPDFETL(importFile, importBankCode, importPassword || undefined)
        showToast(`Imported ${result.records_staged || 0} records. Categorized automatically; you can edit categories in Recent Transactions.`, 'success')
        setShowImportModal(false)
        setImportFile(null)
        setImportBankCode('GENERIC')
        setImportPassword('')
        loadData() // Reload transactions
      } else if (fileExt.endsWith('.csv')) {
        // Use existing bulk import for CSV (or switch to ETL if preferred)
        result = await apiClient.bulkImportTransactions(importFile)
        
        if (result.success) {
          showToast(`Successfully imported ${result.imported} transaction(s)`, 'success')
          setShowImportModal(false)
          setImportFile(null)
          loadData() // Reload transactions
        } else {
          setImportErrors(result.errors)
          showToast(`Import failed: ${result.errors.length} error(s) found`, 'error')
        }
      } else {
        showToast('Unsupported file type. Please use .xlsx or .csv', 'error')
      }
    } catch (err: any) {
      console.error('Failed to import transactions:', err)
      showToast(err.message || 'Failed to import transactions. Please try again.', 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const ext = file.name.toLowerCase()
      if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv') && !ext.endsWith('.pdf')) {
        showToast('Please select a .xlsx, .xls, .csv, or .pdf file', 'warning')
        return
      }
      setImportFile(file)
      setImportErrors([])
      // Reset password when file changes
      setImportPassword('')
    }
  }

  const loadGmailAccounts = async () => {
    try {
      const accounts = await apiClient.getGmailAccounts()
      setGmailAccounts(accounts || [])
      if (accounts && accounts.length > 0 && !selectedGmailAccount) {
        setSelectedGmailAccount(accounts[0].id)
      }
    } catch (err: any) {
      console.error('Failed to load Gmail accounts:', err)
      showToast(err.message || 'Failed to load Gmail accounts', 'error')
    }
  }

  const handleGmailETL = async () => {
    if (!selectedGmailAccount) {
      showToast('Please select a Gmail account', 'warning')
      return
    }

    setGmailETLStatus({ loading: true })
    try {
      const result = await apiClient.triggerGmailETL(
        selectedGmailAccount,
        gmailETLMode,
        gmailETLFromDate || undefined,
        gmailETLToDate || undefined
      )
      
      setGmailETLStatus({ batchId: result.batch_id, status: result.status, loading: false })
      showToast(`Gmail ETL started! Batch ID: ${result.batch_id}`, 'success')
      
      // Poll for status
      if (result.batch_id) {
        pollBatchStatus(result.batch_id)
      }
    } catch (err: any) {
      console.error('Failed to trigger Gmail ETL:', err)
      showToast(err.message || 'Failed to trigger Gmail ETL', 'error')
      setGmailETLStatus({ loading: false })
    }
  }

  const pollBatchStatus = async (batchId: string) => {
    const maxAttempts = 30
    let attempts = 0
    
    const interval = setInterval(async () => {
      attempts++
      try {
        const status = await apiClient.getETLBatchStatus(batchId)
        setGmailETLStatus({ batchId, status: status.status, loading: false })
        
        if (status.status === 'categorized' || status.status === 'failed' || attempts >= maxAttempts) {
          clearInterval(interval)
          if (status.status === 'categorized') {
            showToast(`Gmail ETL completed! Processed ${status.processed || 0} transactions.`, 'success')
            loadData() // Reload transactions
          } else if (status.status === 'failed') {
            showToast(`Gmail ETL failed: ${status.error_message || 'Unknown error'}`, 'error')
          }
        }
      } catch (err) {
        console.error('Failed to poll batch status:', err)
        if (attempts >= maxAttempts) {
          clearInterval(interval)
        }
      }
    }, 2000) // Poll every 2 seconds
  }

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.downloadTransactionTemplate()
      if (typeof window === 'undefined') {
        showToast('Download is only available in the browser', 'warning')
        return
      }

      const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
      const dateStr = new Date().toISOString().split('T')[0]
      link.href = url
      link.setAttribute('download', `transaction_template_${dateStr}.xlsx`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      showToast('Template downloaded successfully', 'success')
    } catch (err) {
      console.error('Failed to download transaction template:', err)
      showToast('Failed to download template. Please try again.', 'error')
    }
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
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.01 }}
              className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-slide-up hover:border-yellow-500/30 transition-all duration-300"
            >
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
            </motion.div>
          )}

          {/* Spending by Category Pie Chart */}
          {byCategory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.01 }}
              className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-slide-up hover:border-yellow-500/30 transition-all duration-300"
            >
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
                      data={pieChartData as any}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      onClick={(data: any) => {
                        if (data && data.categoryCode) {
                          handleCategoryDrilldown(String(data.categoryCode), String(data.name || data.categoryCode))
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {pieChartData.map((_, index) => {
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
            </motion.div>
          )}
        </div>

        {/* Insights Banner - Less Prominent, Below Main Content */}
        {insights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 sm:mb-6"
          >
            <h2 className="text-base sm:text-lg font-semibold mb-3 text-gray-400">Key Insights</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {insights.slice(0, 2).map((insight, idx) => {
                const isSignificantChange = Math.abs(insight.change_percentage) > 50
                
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ scale: 1.02, y: -2 }}
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
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Milestones */}
        {milestones.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6"
          >
            <Milestones milestones={milestones} />
          </motion.div>
        )}

        {/* Next-Gen Intelligence Layer - Tabbed Interface */}
        <div className="mb-6 md:mb-8">
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            {/* Tab Navigation */}
            <div className="flex flex-wrap border-b border-gray-700">
              {[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'intelligence', label: 'AI Intelligence', icon: '🤖' },
                { id: 'analytics', label: 'Analytics', icon: '📈' },
                { id: 'budget', label: 'Budget', icon: '💰' },
                { id: 'goals', label: 'Goals', icon: '🎯' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-3 font-semibold text-sm transition-all ${
                    activeTab === tab.id
                      ? 'bg-yellow-500 text-black border-b-2 border-yellow-500'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-4 sm:p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {aiAdvice.length > 0 && <SpendingCoach advice={aiAdvice} loading={loadingIntelligence} />}
                    {anomalies.length > 0 && <AnomalyDetector anomalies={anomalies} loading={loadingIntelligence} />}
                  </div>
                  {merchantAnalytics.length > 0 && (
                    <MerchantAnalytics merchants={merchantAnalytics} loading={loadingIntelligence} />
                  )}
                </div>
              )}

              {activeTab === 'intelligence' && (
                <div className="space-y-6">
                  <SpendingCoach advice={aiAdvice} loading={loadingIntelligence} />
                  <AnomalyDetector anomalies={anomalies} loading={loadingIntelligence} />
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {categoryTrends && categoryTrends.categories && categoryTrends.categories.length > 0 && (
                    <CategoryTrendChart trends={categoryTrends.categories} loading={loadingIntelligence} />
                  )}
                  {incomeExpense && incomeExpense.data && incomeExpense.data.length > 0 && (
                    <IncomeExpenseChart data={incomeExpense.data} loading={loadingIntelligence} />
                  )}
                  {merchantAnalytics.length > 0 && (
                    <MerchantAnalytics merchants={merchantAnalytics} loading={loadingIntelligence} />
                  )}
                </div>
              )}

              {activeTab === 'budget' && (
                <div className="space-y-6">
                  <BudgetDeviation 
                    deviations={budgetDeviation?.deviations || []} 
                    loading={loadingIntelligence}
                    message={budgetDeviation?.message}
                  />
                  {cashFlowProjection && cashFlowProjection.projections && (
                    <CashFlowProjection
                      current_balance={cashFlowProjection.current_balance || 0}
                      average_monthly_income={cashFlowProjection.average_monthly_income || 0}
                      average_monthly_expenses={cashFlowProjection.average_monthly_expenses || 0}
                      projections={cashFlowProjection.projections || []}
                      loading={loadingIntelligence}
                      message={cashFlowProjection.message}
                    />
                  )}
                </div>
              )}

              {activeTab === 'goals' && (
                <div className="space-y-6">
                  <GoalImpact 
                    goals={goalImpact?.goals || []} 
                    loading={loadingIntelligence}
                    message={goalImpact?.message}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Recent Transactions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700"
        >
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
                <Tooltip content="Import transactions from Excel or CSV file">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 hover:scale-105 active:scale-95 text-sm sm:text-base flex items-center gap-2 justify-center whitespace-nowrap shadow-md"
                    title="Import Bulk"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="hidden sm:inline">Import Bulk</span>
                  </button>
                </Tooltip>
                <Tooltip content="Download Excel template for bulk import">
                  <button
                    onClick={handleDownloadTemplate}
                    className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-all duration-200 hover:scale-105 active:scale-95 text-sm sm:text-base flex items-center gap-2 justify-center whitespace-nowrap shadow-md"
                    title="Download template"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                    </svg>
                    <span className="hidden sm:inline">Download Template</span>
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

          <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-3 sm:p-4 space-y-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-gray-400">Dynamic Filters</span>
              {(paymentModeFilter.length > 0 || merchantTypeFilter.length > 0 || locationFilter.length > 0) && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-yellow-400 hover:text-yellow-300 font-semibold"
                >
                  Clear Filters
                </button>
              )}
            </div>
            <FilterChips
              title="Payment Mode"
              options={paymentModeOptions}
              selected={paymentModeFilter}
              onToggle={(value: string) => toggleFilterValue(value, setPaymentModeFilter)}
            />
            <FilterChips
              title="Merchant Type"
              options={merchantTypeOptions}
              selected={merchantTypeFilter}
              onToggle={(value: string) => toggleFilterValue(value, setMerchantTypeFilter)}
            />
            <FilterChips
              title="Location"
              options={locationOptions}
              selected={locationFilter}
              onToggle={(value: string) => toggleFilterValue(value, setLocationFilter)}
            />
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
                                {getCategoryName(txn.category_code, txn.category)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2 text-[10px] text-gray-400">
                              <span className="px-2 py-0.5 bg-gray-800 rounded-full border border-gray-700">
                                {txn.paymentMode}
                              </span>
                              <span className="px-2 py-0.5 bg-gray-800 rounded-full border border-gray-700">
                                {txn.merchantType}
                              </span>
                              <span className="px-2 py-0.5 bg-gray-800 rounded-full border border-gray-700">
                                {txn.locationLabel}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                            <span className="inline-block bg-gray-700/50 text-gray-300 px-2 py-1 rounded text-sm">
                              {getCategoryName(txn.category_code, txn.category)}
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
        </motion.div>

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

        {/* Bulk Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 sm:p-6">
            <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400">Import Bulk Transactions</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Select File (.xlsx, .xls, .csv, or .pdf)</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf"
                    onChange={handleFileSelect}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />
                  {importFile && (
                    <p className="mt-2 text-sm text-gray-400">Selected: {importFile.name}</p>
                  )}
                </div>

                {(importFile && (importFile.name.toLowerCase().endsWith('.xlsx') || importFile.name.toLowerCase().endsWith('.xls') || importFile.name.toLowerCase().endsWith('.pdf'))) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Bank (for column/format mapping)</label>
                    <select
                      value={importBankCode}
                      onChange={(e) => setImportBankCode(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                    >
                      <option value="GENERIC">Generic / Auto-detect</option>
                      <option value="HDFC">HDFC Bank</option>
                      <option value="ICICI">ICICI Bank</option>
                      <option value="SBI">State Bank of India</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-400">
                      Select your bank for automatic column/format mapping. Transactions will be auto-categorized.
                    </p>
                  </div>
                )}

                {importFile && importFile.name.toLowerCase().endsWith('.pdf') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">PDF Password (optional)</label>
                    <input
                      type="password"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      placeholder="Enter password if PDF is password-protected"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-yellow-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Only required if your PDF bank statement is password-protected.
                    </p>
                  </div>
                )}

                {importErrors.length > 0 && (
                  <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                    <h3 className="text-red-400 font-semibold mb-2">Import Errors ({importErrors.length})</h3>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {importErrors.map((error, idx) => (
                        <div key={idx} className="text-sm text-red-300">
                          <span className="font-medium">Row {error.row}</span>
                          {error.field && <span className="text-gray-400"> - {error.field}: </span>}
                          <span>{error.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-blue-900/20 border border-blue-500 rounded-lg p-4">
                  <p className="text-sm text-blue-300">
                    <strong>Excel files (.xlsx, .xls):</strong> Select your bank for automatic column mapping. Transactions will be auto-categorized using rule-based categorization.
                    <br />
                    <strong>PDF files:</strong> Select your bank for format-specific parsing. If your PDF is password-protected, enter the password. Transactions will be auto-categorized.
                    <br />
                    <strong>CSV files:</strong> Download the template first to ensure correct format. All rows must be valid for import to succeed.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                  onClick={handleBulkImport}
                  disabled={!importFile || importing}
                  className="flex-1 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black rounded-lg font-semibold transition-colors text-sm sm:text-base flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Importing...
                    </>
                  ) : (
                    'Import'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowImportModal(false)
                    setImportFile(null)
                    setImportBankCode('GENERIC')
                    setImportPassword('')
                    setImportErrors([])
                  }}
                  disabled={importing}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors text-sm sm:text-base"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category Drilldown Modal */}
        {drilldownCategory && (
          <CategoryDrilldownModal
            isOpen={!!drilldownCategory}
            onClose={() => setDrilldownCategory(null)}
            category={drilldownCategory.category}
            categoryName={drilldownCategory.categoryName}
            transactions={transactions.filter(txn => 
              (txn.category_code || txn.category) === drilldownCategory.category
            )}
            totalAmount={byCategory.find(c => c.category === drilldownCategory.category)?.amount || 0}
            transactionCount={byCategory.find(c => c.category === drilldownCategory.category)?.transaction_count || 0}
          />
        )}
      </div>
    </div>
  )
}
