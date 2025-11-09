import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

export default function Layout() {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [userInitial, setUserInitial] = useState<string>('U')

  // Load user information from session
  useEffect(() => {
    const loadUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        setUserEmail(session.user.email)
        // Get first letter of email for avatar
        const initial = session.user.email.charAt(0).toUpperCase()
        setUserInitial(initial)
      }
    }

    loadUser()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        setUserEmail(session.user.email)
        const initial = session.user.email.charAt(0).toUpperCase()
        setUserInitial(initial)
      } else {
        setUserEmail('')
        setUserInitial('U')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      // Use window.location for a hard redirect to ensure it always works
      window.location.href = '/login'
    } catch (error) {
      console.error('Error signing out:', error)
      // Still redirect to login even if sign out fails
      window.location.href = '/login'
    }
  }

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

        <div className={`mt-auto pt-4 border-t border-gray-700 ${isCollapsed ? 'px-2' : 'px-6'} space-y-2`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} py-2`}>
            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {userInitial}
            </div>
            {!isCollapsed && userEmail && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {userEmail.split('@')[0]}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {userEmail}
                </p>
              </div>
            )}
          </div>
          
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-2 rounded-lg transition-colors text-gray-300 hover:bg-gray-700 hover:text-white group relative`}
            title={isCollapsed ? (theme === 'dark' ? 'Switch to Light' : 'Switch to Dark') : undefined}
          >
            {theme === 'dark' ? (
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
            {!isCollapsed && (
              <span className="whitespace-nowrap">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            )}
            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-700 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </span>
            )}
          </button>
          
          <button
            onClick={handleSignOut}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-2 rounded-lg transition-colors text-gray-300 hover:bg-gray-700 hover:text-white group relative`}
            title={isCollapsed ? 'Sign Out' : undefined}
          >
            <svg
              className="w-5 h-5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {!isCollapsed && (
              <span className="whitespace-nowrap">Sign Out</span>
            )}
            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-700 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                Sign Out
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
