import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

interface GmailAccount {
  id: string
  email: string
  is_active: boolean
  last_sync: string | null
  created_at: string
}

export default function GmailConnect() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState<GmailAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)

  // Fetch connected Gmail accounts
  const fetchAccounts = async () => {
    if (!user) return

    try {
      setLoading(true)
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gmail/accounts?user_id=${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${user.id}`,
          },
        }
      )

      if (!response.ok) throw new Error('Failed to fetch accounts')

      const data = await response.json()
      setAccounts(data.accounts || [])
    } catch (error) {
      console.error('Error fetching Gmail accounts:', error)
      showToast('Failed to load Gmail accounts', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Connect new Gmail account
  const connectGmail = async () => {
    if (!user) {
      showToast('Please log in first', 'error')
      return
    }

    try {
      setLoading(true)
      
      // Get OAuth URL from backend
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gmail/oauth/url?user_id=${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${user.id}`,
          },
        }
      )

      if (!response.ok) throw new Error('Failed to get OAuth URL')

      const data = await response.json()
      
      // Redirect to Google OAuth
      window.location.href = data.auth_url
    } catch (error) {
      console.error('Error connecting Gmail:', error)
      showToast('Failed to connect Gmail. Please try again.', 'error')
      setLoading(false)
    }
  }

  // Disconnect Gmail account
  const disconnectGmail = async (accountId: string) => {
    if (!user) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gmail/disconnect/${accountId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${user.id}`,
          },
        }
      )

      if (!response.ok) throw new Error('Failed to disconnect account')

      showToast('Gmail account disconnected', 'success')
      fetchAccounts()
    } catch (error) {
      console.error('Error disconnecting Gmail:', error)
      showToast('Failed to disconnect Gmail account', 'error')
    }
  }

  // Sync Gmail account
  const syncGmail = async (accountId: string) => {
    if (!user) return

    try {
      setSyncing(accountId)
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/gmail/sync/${accountId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.id}`,
          },
        }
      )

      if (!response.ok) throw new Error('Failed to sync account')

      const data = await response.json()
      showToast(`Syncing ${data.emails_found || 0} emails...`, 'success')
      
      // Refresh accounts after sync
      setTimeout(() => fetchAccounts(), 2000)
    } catch (error) {
      console.error('Error syncing Gmail:', error)
      showToast('Failed to sync Gmail account', 'error')
    } finally {
      setSyncing(null)
    }
  }

  // Load accounts on mount
  useState(() => {
    fetchAccounts()
  })

  return (
    <div className="glass rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">Gmail Accounts</h3>
          <p className="text-sm text-gray-400">Connect your Gmail to import transactions</p>
        </div>
        <button
          onClick={connectGmail}
          disabled={loading}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
          </svg>
          Connect Gmail
        </button>
      </div>

      {/* Connected Accounts */}
      {loading && accounts.length === 0 ? (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-400 mt-4">Loading accounts...</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-8">
          <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400">No Gmail accounts connected</p>
          <p className="text-sm text-gray-500 mt-2">Connect your Gmail to automatically import transactions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="glass-dark rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-500/20 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-white">{account.email}</p>
                    <p className="text-xs text-gray-500">
                      {account.last_sync
                        ? `Last synced: ${new Date(account.last_sync).toLocaleDateString()}`
                        : 'Never synced'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => syncGmail(account.id)}
                    disabled={syncing === account.id}
                    className="btn-secondary text-sm py-2 px-4"
                  >
                    {syncing === account.id ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Syncing...
                      </span>
                    ) : (
                      'Sync Now'
                    )}
                  </button>
                  <button
                    onClick={() => disconnectGmail(account.id)}
                    className="text-error hover:text-error-light transition-colors p-2"
                    title="Disconnect"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

