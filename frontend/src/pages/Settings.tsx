import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import GmailConnect from '../components/GmailConnect'

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'integrations' | 'profile' | 'preferences'>('integrations')

  const tabs = [
    { id: 'integrations' as const, name: 'Integrations', icon: '🔗' },
    { id: 'profile' as const, name: 'Profile', icon: '👤' },
    { id: 'preferences' as const, name: 'Preferences', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 animate-slide-down">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-2 gradient-text">
            Settings
          </h1>
          <p className="text-gray-400 text-sm sm:text-base">Manage your account and preferences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 rounded-xl font-semibold text-sm sm:text-base transition-all duration-300 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand/50'
                  : 'glass text-gray-300 hover:bg-white/10 border border-white/10'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="animate-fade-in">
          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <GmailConnect />

              {/* Other Integrations */}
              <div className="glass rounded-2xl p-6 border border-white/10">
                <h3 className="text-xl font-bold text-white mb-4">Other Integrations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bank Integration */}
                  <div className="glass-dark rounded-xl p-4 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-accent-purple/20 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Bank Accounts</h4>
                        <p className="text-xs text-gray-500">Coming soon</p>
                      </div>
                    </div>
                    <button
                      disabled
                      className="w-full btn-secondary opacity-50 cursor-not-allowed"
                    >
                      Connect Bank
                    </button>
                  </div>

                  {/* Credit Card Integration */}
                  <div className="glass-dark rounded-xl p-4 border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-accent-cyan/20 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">Credit Cards</h4>
                        <p className="text-xs text-gray-500">Coming soon</p>
                      </div>
                    </div>
                    <button
                      disabled
                      className="w-full btn-secondary opacity-50 cursor-not-allowed"
                    >
                      Connect Card
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="glass rounded-2xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">Profile Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-3 glass-dark border border-gray-700 rounded-xl text-white bg-gray-800/50 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">User ID</label>
                  <input
                    type="text"
                    value={user?.id || ''}
                    disabled
                    className="w-full px-4 py-3 glass-dark border border-gray-700 rounded-xl text-white bg-gray-800/50 cursor-not-allowed font-mono text-sm"
                  />
                </div>
                <p className="text-sm text-gray-500">Profile editing coming soon</p>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="glass rounded-2xl p-6 border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6">Preferences</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-white mb-3">Currency</h4>
                  <select className="w-full px-4 py-3 glass-dark border border-gray-700 rounded-xl text-white">
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div>
                  <h4 className="font-semibold text-white mb-3">Notifications</h4>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between">
                      <span className="text-gray-300">Email notifications</span>
                      <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-gray-300">Transaction alerts</span>
                      <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
                    </label>
                    <label className="flex items-center justify-between">
                      <span className="text-gray-300">Budget warnings</span>
                      <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
                    </label>
                  </div>
                </div>
                <p className="text-sm text-gray-500">More preferences coming soon</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

