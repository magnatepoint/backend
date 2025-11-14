import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrency, formatDate } from '../../lib/utils'

interface Transaction {
  id?: string
  txn_id?: string
  merchant?: string
  merchant_name_norm?: string
  amount?: number | string
  transaction_date?: string
  txn_date?: string
  category?: string
  category_code?: string
}

interface CategoryDrilldownModalProps {
  isOpen: boolean
  onClose: () => void
  category: string
  categoryName: string
  transactions: Transaction[]
  totalAmount: number
  transactionCount: number
}

export function CategoryDrilldownModal({
  isOpen,
  onClose,
  categoryName,
  transactions,
  totalAmount,
  transactionCount
}: CategoryDrilldownModalProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-gray-800 rounded-xl border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-yellow-900/20 to-yellow-800/10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-yellow-400 mb-2">{categoryName}</h2>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{transactionCount} transactions</span>
                  <span>•</span>
                  <span className="text-yellow-400 font-semibold">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Transactions List */}
          <div className="flex-1 overflow-y-auto p-6">
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p>No transactions found for this category.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((txn, idx) => (
                  <motion.div
                    key={txn.txn_id || txn.id || idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-white">
                          {txn.merchant_name_norm || txn.merchant || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {formatDate(txn.transaction_date || txn.txn_date || new Date())}
                        </div>
                      </div>
                      <div className="text-lg font-bold text-red-400">
                        {formatCurrency(Math.abs(Number(txn.amount) || 0))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

