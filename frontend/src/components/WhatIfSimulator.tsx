import { useState } from 'react'
import { motion } from 'framer-motion'

interface WhatIfSimulatorProps {
  initialNeeds: number
  initialWants: number
  initialAssets: number
  income: number
  onUpdate: (needs: number, wants: number, assets: number) => void
}

export default function WhatIfSimulator({
  initialNeeds,
  initialWants,
  initialAssets,
  income,
  onUpdate
}: WhatIfSimulatorProps) {
  const [needs, setNeeds] = useState(initialNeeds)
  const [wants, setWants] = useState(initialWants)
  const [assets, setAssets] = useState(initialAssets)

  const needsAmt = (needs / 100) * income
  const wantsAmt = (wants / 100) * income
  const assetsAmt = (assets / 100) * income
  const total = needs + wants + assets
  const isValid = Math.abs(total - 100) < 0.1

  const handleNeedsChange = (value: number) => {
    const newNeeds = Math.max(0, Math.min(100, value))
    setNeeds(newNeeds)
    const remaining = 100 - newNeeds
    const wantsRatio = wants / (wants + assets || 1)
    const assetsRatio = assets / (wants + assets || 1)
    const newWants = remaining * wantsRatio
    const newAssets = remaining * assetsRatio
    setWants(newWants)
    setAssets(newAssets)
    onUpdate(newNeeds, newWants, newAssets)
  }

  const handleWantsChange = (value: number) => {
    const newWants = Math.max(0, Math.min(100 - needs, value))
    setWants(newWants)
    setAssets(100 - needs - newWants)
    onUpdate(needs, newWants, 100 - needs - newWants)
  }

  const handleAssetsChange = (value: number) => {
    const newAssets = Math.max(0, Math.min(100 - needs, value))
    setAssets(newAssets)
    setWants(100 - needs - newAssets)
    onUpdate(needs, 100 - needs - newAssets, newAssets)
  }

  const reset = () => {
    setNeeds(initialNeeds)
    setWants(initialWants)
    setAssets(initialAssets)
    onUpdate(initialNeeds, initialWants, initialAssets)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700/50"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h3 className="text-sm font-semibold text-gray-300">What-If Simulator</h3>
        </div>
        <button
          onClick={reset}
          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          Reset
        </button>
      </div>

      <div className="space-y-4">
        {/* Needs Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400">Needs</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-300">{needs.toFixed(1)}%</span>
              <span className="text-xs text-gray-500">₹{needsAmt.toLocaleString()}</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="0.5"
            value={needs}
            onChange={(e) => handleNeedsChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
          />
        </div>

        {/* Wants Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400">Wants</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-300">{wants.toFixed(1)}%</span>
              <span className="text-xs text-gray-500">₹{wantsAmt.toLocaleString()}</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={100 - needs}
            step="0.5"
            value={wants}
            onChange={(e) => handleWantsChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
          />
        </div>

        {/* Assets Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-400">Savings/Assets</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-300">{assets.toFixed(1)}%</span>
              <span className="text-xs text-gray-500">₹{assetsAmt.toLocaleString()}</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={100 - needs}
            step="0.5"
            value={assets}
            onChange={(e) => handleAssetsChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
          />
        </div>

        {/* Validation */}
        <div className={`text-xs p-2 rounded ${isValid ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'}`}>
          {isValid ? (
            <span>✓ Total: {total.toFixed(1)}% (Valid)</span>
          ) : (
            <span>⚠ Total: {total.toFixed(1)}% (Should be 100%)</span>
          )}
        </div>

        {/* Projected Savings */}
        <div className="pt-2 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-1">Projected Monthly Savings</div>
          <div className="text-lg font-semibold text-green-400">
            ₹{assetsAmt.toLocaleString()}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

