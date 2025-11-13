import React from 'react'
import { motion } from 'framer-motion'

export type PaymentMode = 'UPI' | 'Card' | 'Bank Transfer' | 'Cash' | 'All'
export type MerchantType = 'Online' | 'Offline' | 'All'
export type Location = 'All'

interface FilterChipsProps {
  paymentMode: PaymentMode
  merchantType: MerchantType
  location: Location
  onPaymentModeChange: (mode: PaymentMode) => void
  onMerchantTypeChange: (type: MerchantType) => void
  onLocationChange: (loc: Location) => void
}

export function FilterChips({
  paymentMode,
  merchantType,
  location,
  onPaymentModeChange,
  onMerchantTypeChange,
  onLocationChange
}: FilterChipsProps) {
  const paymentModes: PaymentMode[] = ['All', 'UPI', 'Card', 'Bank Transfer', 'Cash']
  const merchantTypes: MerchantType[] = ['All', 'Online', 'Offline']
  const locations: Location[] = ['All']

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {/* Payment Mode Filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 font-medium">Payment:</span>
        <div className="flex gap-2">
          {paymentModes.map((mode) => (
            <motion.button
              key={mode}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onPaymentModeChange(mode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                paymentMode === mode
                  ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {mode}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Merchant Type Filters */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400 font-medium">Type:</span>
        <div className="flex gap-2">
          {merchantTypes.map((type) => (
            <motion.button
              key={type}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onMerchantTypeChange(type)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                merchantType === type
                  ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Location Filters (placeholder for future) */}
      {locations.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 font-medium">Location:</span>
          <div className="flex gap-2">
            {locations.map((loc) => (
              <motion.button
                key={loc}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onLocationChange(loc)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  location === loc
                    ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {loc}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
