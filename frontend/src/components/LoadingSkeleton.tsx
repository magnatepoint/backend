export function CardSkeleton() {
  return (
    <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-1/3 mb-4"></div>
      <div className="h-8 bg-gray-700 rounded w-1/2 mb-2"></div>
      <div className="h-3 bg-gray-700 rounded w-1/4"></div>
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-pulse">
      <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 bg-gray-700 rounded flex-1"></div>
            <div className="h-4 bg-gray-700 rounded w-24"></div>
            <div className="h-4 bg-gray-700 rounded w-20"></div>
            <div className="h-4 bg-gray-700 rounded w-16"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 animate-pulse">
      <div className="h-6 bg-gray-700 rounded w-1/3 mb-6"></div>
      <div className="h-64 bg-gray-700 rounded"></div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="h-10 bg-gray-800 rounded w-1/4 mb-8 animate-pulse"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 md:mb-8">
          {[1, 2, 3, 4].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton />
      </div>
    </div>
  )
}

