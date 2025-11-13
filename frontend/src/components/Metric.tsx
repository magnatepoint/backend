import { ReactNode } from 'react'

interface MetricProps {
  label: string
  value: ReactNode
  hint?: string
}

export default function Metric({ label, value, hint }: MetricProps) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50">
      <div className="text-gray-400 text-xs mb-1 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-white">{value}</div>
      {hint && <div className="text-gray-500 text-xs mt-1">{hint}</div>}
    </div>
  )
}

