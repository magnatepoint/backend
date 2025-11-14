import { motion, AnimatePresence } from 'framer-motion'
import { formatCurrency, formatDate } from '../../lib/utils'

interface DrilldownModalProps {
  open: boolean
  title: string
  description?: string
  transactions: Array<{
    txn_id?: string
    id?: string
    merchant?: string
    merchant_name_norm?: string
    amount?: number | string
    transaction_date?: string
    txn_date?: string
    description?: string
  }>
  onClose: () => void
}

export function DrilldownModal({ open, title, description, transactions, onClose }: DrilldownModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-900 border border-yellow-500/30 rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            <div className="flex items-start justify-between p-4 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-bold text-yellow-400">{title}</h3>
                {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
              {transactions.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  No transactions found for this selection.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 uppercase text-xs tracking-wide border-b border-gray-800">
                      <th className="py-2">Date</th>
                      <th className="py-2">Merchant</th>
                      <th className="py-2">Description</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn, idx) => (
                      <tr
                        key={`${txn.txn_id || txn.id || idx}`}
                        className="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors"
                      >
                        <td className="py-2 text-gray-400">
                          {formatDate(txn.transaction_date || txn.txn_date || new Date())}
                        </td>
                        <td className="py-2 text-white font-medium">
                          {txn.merchant_name_norm || txn.merchant || 'N/A'}
                        </td>
                        <td className="py-2 text-gray-400">
                          {txn.description || txn.merchant_name_norm || '—'}
                        </td>
                        <td className="py-2 text-right font-semibold text-yellow-400">
                          {formatCurrency(Math.abs(Number(txn.amount) || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-gray-800 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

