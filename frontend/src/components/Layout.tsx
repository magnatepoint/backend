import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'

export default function Layout() {
  const location = useLocation()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = [
    { path: '/', label: 'Monytix Console', icon: 'M' },
    { path: '/spendsense', label: 'SpendSense', icon: 'S' },
    { path: '/budgetpilot', label: 'BudgetPilot', icon: 'B' },
    { path: '/moneymoments', label: 'MoneyMoments', icon: 'M' },
    { path: '/goalcompass', label: 'GoalCompass', icon: 'G' },
  ]

  return (
    <div className="min-h-screen bg-gray-900 text-white flex">
      {/* Sidebar */}
      <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-gray-800 transition-all duration-300 flex flex-col relative`}>
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-6 w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center z-10 border-2 border-gray-800 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className={`p-6 ${isCollapsed ? 'px-4' : ''}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} mb-2`}>
            <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-gray-900 flex-shrink-0">
              M
            </div>
            {!isCollapsed && (
              <h1 className="text-2xl font-bold whitespace-nowrap">Monytix</h1>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 sm:px-6">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg transition-colors group relative ${
                      isActive
                        ? 'bg-yellow-500 text-gray-900 font-semibold'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className="w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {item.icon}
                    </span>
                    {!isCollapsed && (
                      <span className="whitespace-nowrap">{item.label}</span>
                    )}
                    {/* Tooltip for collapsed state */}
                    {isCollapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-gray-700 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                        {item.label}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className={`mt-auto pt-4 border-t border-gray-700 ${isCollapsed ? 'px-2' : 'px-6'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} py-2`}>
            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">
              S
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">santoshmalla</p>
                <p className="text-xs text-gray-400 truncate">santoshmalla221989...</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
