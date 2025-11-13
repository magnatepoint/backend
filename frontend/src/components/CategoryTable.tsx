import { formatCurrency } from '../lib/utils'

type Band = 'needs' | 'wants' | 'assets'

interface CategoryItem {
  band: Band
  category: string
  planned_pct: number
  planned_amount: number
}

interface CategoryTableProps {
  data: CategoryItem[]
}

export default function CategoryTable({ data }: CategoryTableProps) {
  const groups: Record<Band, CategoryItem[]> = { needs: [], wants: [], assets: [] }

  data?.forEach((r) => {
    if (groups[r.band]) {
      groups[r.band].push(r)
    }
  })

  return (
    <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700/50">
      <h3 className="font-semibold text-white mb-3">Category Budgets</h3>
      {(['needs', 'wants', 'assets'] as Band[]).map((band) => (
        <div key={band} className="mb-4 last:mb-0">
          <div className="text-gray-400 uppercase text-xs mb-2 font-semibold">{band}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {groups[band].length > 0 ? (
              groups[band].map((c) => (
                <div key={c.category} className="p-3 rounded-lg bg-gray-700/30 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white text-sm">{c.category}</div>
                    <div className="text-gray-400 text-xs">{(c.planned_pct * 100).toFixed(0)}%</div>
                  </div>
                  <div className="font-semibold text-yellow-400">{formatCurrency(c.planned_amount)}</div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-xs italic">No categories set for {band}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

