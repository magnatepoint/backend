import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function GmailCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Connecting your Gmail account...')

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const error = searchParams.get('error')

      // Check for errors from Google
      if (error) {
        setStatus('error')
        setMessage(`Authentication failed: ${error}`)
        showToast('Failed to connect Gmail account', 'error')
        setTimeout(() => navigate('/settings'), 3000)
        return
      }

      // Check for required parameters
      if (!code || !state) {
        setStatus('error')
        setMessage('Invalid callback parameters')
        showToast('Invalid Gmail OAuth callback', 'error')
        setTimeout(() => navigate('/settings'), 3000)
        return
      }

      // Parse state to get user_id
      let userId: string
      try {
        const stateData = JSON.parse(atob(state))
        userId = stateData.user_id
      } catch (e) {
        setStatus('error')
        setMessage('Invalid state parameter')
        showToast('Invalid OAuth state', 'error')
        setTimeout(() => navigate('/settings'), 3000)
        return
      }

      // Verify user matches
      if (user && userId !== user.id) {
        setStatus('error')
        setMessage('User mismatch')
        showToast('User authentication mismatch', 'error')
        setTimeout(() => navigate('/settings'), 3000)
        return
      }

      try {
        // Exchange code for tokens
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/gmail/oauth/callback`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userId}`,
            },
            body: JSON.stringify({ code, state }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Failed to connect Gmail')
        }

        const data = await response.json()
        
        setStatus('success')
        setMessage(`Successfully connected ${data.email}!`)
        showToast(`Gmail account ${data.email} connected successfully!`, 'success')
        
        // Redirect to settings after 2 seconds
        setTimeout(() => navigate('/settings'), 2000)
      } catch (error) {
        console.error('Error connecting Gmail:', error)
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Failed to connect Gmail')
        showToast('Failed to connect Gmail account', 'error')
        setTimeout(() => navigate('/settings'), 3000)
      }
    }

    handleCallback()
  }, [searchParams, navigate, user, showToast])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
      <div className="glass rounded-3xl p-10 max-w-md w-full text-center border border-white/10 animate-scale-in">
        {status === 'processing' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6">
              <svg className="animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Connecting Gmail</h2>
            <p className="text-gray-400">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-success/20 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-success mb-2">Success!</h2>
            <p className="text-gray-400">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting to settings...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 mx-auto mb-6 bg-error/20 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-error mb-2">Connection Failed</h2>
            <p className="text-gray-400">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting to settings...</p>
          </>
        )}
      </div>
    </div>
  )
}

