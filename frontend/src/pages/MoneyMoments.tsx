import { useEffect, useState, useCallback } from 'react'
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import { apiClient } from '../lib/api'
import { formatCurrency, formatDate } from '../lib/utils'

interface SignalsData {
  user_id: string
  as_of_date: string
  dining_txn_7d: number
  dining_spend_7d: number
  shopping_txn_7d: number
  shopping_spend_7d: number
  travel_txn_30d: number
  travel_spend_30d: number
  wants_share_30d: number | null
  recurring_merchants_90d: number
  wants_vs_plan_pct: number | null
  assets_vs_plan_pct: number | null
  rank1_goal_underfund_amt: number
  rank1_goal_underfund_pct: number | null
  last_nudge_sent_at: string | null
  created_at: string
}

interface PendingNudge {
  candidate_id: string
  user_id: string
  as_of_date: string
  rule_id: string
  template_code: string
  score: number
  reason_json: Record<string, unknown>
  status: string
  created_at: string
  rule_name: string
  rule_description: string | null
  title_template: string
  body_template: string
  cta_text: string | null
  cta_deeplink: string | null
  humor_style: string | null
}

interface DeliveredNudge {
  delivery_id: string
  candidate_id: string
  user_id: string
  rule_id: string
  template_code: string
  channel: string
  sent_at: string
  send_status: string
  metadata_json: Record<string, unknown>
  rule_name: string
  title_template: string
  body_template: string
  cta_text: string | null
  cta_deeplink: string | null
  interaction_count: number
}

interface CTRData {
  total_delivered: number
  total_viewed: number
  total_clicked: number
  view_rate: number
  ctr: number
}

interface BehaviorShiftData {
  signals: Array<{
    as_of_date: string
    wants_share_30d: number | null
    wants_vs_plan_pct: number | null
    assets_vs_plan_pct: number | null
    rank1_goal_underfund_pct: number | null
  }>
  wants_shift: number | null
  months_tracked: number
}

interface UserTraits {
  user_id: string
  age_band: string
  gender: string | null
  region_code: string
  lifestyle_tags: string[]
  created_at: string
  updated_at: string
}

interface SuppressionSetting {
  user_id: string
  channel: string
  muted_until: string | null
  daily_cap: number
}

export default function MoneyMoments() {
  const [signals, setSignals] = useState<SignalsData | null>(null)
  const [pendingNudges, setPendingNudges] = useState<PendingNudge[]>([])
  const [deliveredNudges, setDeliveredNudges] = useState<DeliveredNudge[]>([])
  const [ctrData, setCtrData] = useState<CTRData | null>(null)
  const [behaviorShift, setBehaviorShift] = useState<BehaviorShiftData | null>(null)
  const [_userTraits, setUserTraits] = useState<UserTraits | null>(null)
  const [_suppressionSettings, setSuppressionSettings] = useState<SuppressionSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [showTraitsModal, setShowTraitsModal] = useState(false)
  const [showSuppressionModal, setShowSuppressionModal] = useState(false)
  const [traitsForm, setTraitsForm] = useState<{
    age_band: string
    gender: string
    region_code: string
    lifestyle_tags: string
  }>({
    age_band: '25-34',
    gender: '',
    region_code: 'IN',
    lifestyle_tags: ''
  })
  const [suppressionForm, setSuppressionForm] = useState<{
    channel: string
    muted_until: string
    daily_cap: number
  }>({
    channel: 'in_app',
    muted_until: '',
    daily_cap: 3
  })
  const [deriving, setDeriving] = useState(false)

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const results = await Promise.allSettled([
        apiClient.getMoneyMomentsSignals(selectedDate).catch(() => null),
        apiClient.getPendingNudges().catch(() => ({ nudges: [] })),
        apiClient.getDeliveredNudges(20).catch(() => ({ nudges: [] })),
        apiClient.getMoneyMomentsCTR(30).catch(() => null),
        apiClient.getMoneyMomentsBehaviorShift(3).catch(() => null),
        apiClient.getMoneyMomentsTraits().catch(() => null),
        apiClient.getMoneyMomentsSuppression().catch(() => ({ settings: [] }))
      ])

      if (results[0].status === 'fulfilled') {
        setSignals(results[0].value)
      }
      if (results[1].status === 'fulfilled') {
        setPendingNudges(results[1].value?.nudges || [])
      }
      if (results[2].status === 'fulfilled') {
        setDeliveredNudges(results[2].value?.nudges || [])
      }
      if (results[3].status === 'fulfilled') {
        setCtrData(results[3].value)
      }
      if (results[4].status === 'fulfilled') {
        setBehaviorShift(results[4].value)
      }
      if (results[5].status === 'fulfilled') {
        const traits = results[5].value
        if (traits) {
          setUserTraits(traits)
          setTraitsForm({
            age_band: traits.age_band || '25-34',
            gender: traits.gender || '',
            region_code: traits.region_code || 'IN',
            lifestyle_tags: (traits.lifestyle_tags || []).join(', ')
          })
        }
      }
      if (results[6].status === 'fulfilled') {
        const settings = results[6].value?.settings || []
        setSuppressionSettings(settings)
        if (settings.length > 0) {
          const inAppSetting = settings.find(s => s.channel === 'in_app')
          if (inAppSetting) {
            setSuppressionForm({
              channel: inAppSetting.channel,
              muted_until: inAppSetting.muted_until ? new Date(inAppSetting.muted_until).toISOString().slice(0, 16) : '',
              daily_cap: inAppSetting.daily_cap || 3
            })
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading money moments data:', err)
      setError(err.message || 'Failed to load money moments data')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  const handleDeriveSignals = async () => {
    try {
      setDeriving(true)
      await apiClient.deriveMoneyMomentsSignals(selectedDate)
      await loadAllData()
      alert('Signals derived successfully!')
    } catch (err: any) {
      alert(`Failed to derive signals: ${err.message}`)
    } finally {
      setDeriving(false)
    }
  }

  const handleNudgeInteraction = async (deliveryId: string, eventType: 'view' | 'click' | 'dismiss') => {
    try {
      await apiClient.logNudgeInteraction(deliveryId, eventType)
      // Reload delivered nudges to update interaction count
      const result = await apiClient.getDeliveredNudges(20)
      setDeliveredNudges(result.nudges || [])
    } catch (err) {
      console.error('Failed to log interaction:', err)
    }
  }

  const handleSaveTraits = async () => {
    try {
      const lifestyleTags = traitsForm.lifestyle_tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      await apiClient.putMoneyMomentsTraits({
        age_band: traitsForm.age_band,
        gender: traitsForm.gender || undefined,
        region_code: traitsForm.region_code,
        lifestyle_tags: lifestyleTags
      })
      
      setShowTraitsModal(false)
      await loadAllData()
      alert('Traits updated successfully!')
    } catch (err: any) {
      alert(`Failed to update traits: ${err.message}`)
    }
  }

  const handleSaveSuppression = async () => {
    try {
      await apiClient.putMoneyMomentsSuppression({
        channel: suppressionForm.channel,
        muted_until: suppressionForm.muted_until || undefined,
        daily_cap: suppressionForm.daily_cap
      })
      
      setShowSuppressionModal(false)
      await loadAllData()
      alert('Suppression settings updated!')
    } catch (err: any) {
      alert(`Failed to update suppression: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-6">MoneyMoments</h1>
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
            <p className="mt-4 text-gray-400">Loading insights...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">MoneyMoments</h1>
          <div className="flex flex-wrap gap-2 sm:gap-4">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm"
            />
            <button
              onClick={handleDeriveSignals}
              disabled={deriving}
              className="px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 text-sm font-semibold disabled:opacity-50"
            >
              {deriving ? 'Deriving...' : 'Derive Signals'}
            </button>
            <button
              onClick={() => setShowTraitsModal(true)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm"
            >
              Edit Traits
            </button>
            <button
              onClick={() => setShowSuppressionModal(true)}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm"
            >
              Suppression
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error: {error}</p>
            <button
              onClick={loadAllData}
              className="mt-4 px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Behavioral Signals Dashboard */}
        {signals && (
          <div className="mb-6 md:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📊</span> Behavioral Signals
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-lg hover:shadow-orange-500/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Dining (7d)</h3>
                  <span className="text-orange-400 text-lg sm:text-xl">🍽️</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-orange-400 mb-1">
                  {signals.dining_txn_7d || 0} txns
                </p>
                <p className="text-sm text-gray-400">
                  {formatCurrency(signals.dining_spend_7d || 0)}
                </p>
              </div>

              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-purple-500 transition-all duration-300 shadow-lg hover:shadow-purple-500/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Shopping (7d)</h3>
                  <span className="text-purple-400 text-lg sm:text-xl">🛍️</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-purple-400 mb-1">
                  {signals.shopping_txn_7d || 0} txns
                </p>
                <p className="text-sm text-gray-400">
                  {formatCurrency(signals.shopping_spend_7d || 0)}
                </p>
              </div>

              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-blue-500 transition-all duration-300 shadow-lg hover:shadow-blue-500/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Travel (30d)</h3>
                  <span className="text-blue-400 text-lg sm:text-xl">✈️</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-blue-400 mb-1">
                  {signals.travel_txn_30d || 0} txns
                </p>
                <p className="text-sm text-gray-400">
                  {formatCurrency(signals.travel_spend_30d || 0)}
                </p>
              </div>

              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 sm:p-6 border border-gray-700 hover:border-green-500 transition-all duration-300 shadow-lg hover:shadow-green-500/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide">Recurring Merchants</h3>
                  <span className="text-green-400 text-lg sm:text-xl">🔄</span>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-green-400 mb-1">
                  {signals.recurring_merchants_90d || 0}
                </p>
                <p className="text-sm text-gray-400">Last 90 days</p>
              </div>
            </div>

            {/* Additional Signal Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {signals.wants_share_30d !== null && (
                <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Wants Share (30d)</h3>
                  <p className="text-xl sm:text-2xl font-bold text-yellow-400">
                    {(signals.wants_share_30d * 100).toFixed(1)}%
                  </p>
                </div>
              )}
              {signals.wants_vs_plan_pct !== null && (
                <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Wants vs Plan</h3>
                  <p className={`text-xl sm:text-2xl font-bold ${signals.wants_vs_plan_pct > 100 ? 'text-red-400' : 'text-green-400'}`}>
                    {signals.wants_vs_plan_pct.toFixed(1)}%
                  </p>
                </div>
              )}
              {signals.assets_vs_plan_pct !== null && (
                <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Assets vs Plan</h3>
                  <p className={`text-xl sm:text-2xl font-bold ${signals.assets_vs_plan_pct < 100 ? 'text-red-400' : 'text-green-400'}`}>
                    {signals.assets_vs_plan_pct.toFixed(1)}%
                  </p>
                </div>
              )}
              {signals.rank1_goal_underfund_pct !== null && (
                <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Top Goal Underfund</h3>
                  <p className="text-xl sm:text-2xl font-bold text-red-400">
                    {signals.rank1_goal_underfund_pct.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatCurrency(signals.rank1_goal_underfund_amt || 0)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Behavior Shift Chart */}
        {behaviorShift && behaviorShift.signals.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mb-6 md:mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📈</span> Behavior Shift (Last 3 Months)
            </h2>
            <div className="w-full" style={{ minHeight: '256px', height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                <LineChart data={behaviorShift.signals.map(s => ({
                  date: formatDate(s.as_of_date),
                  wantsShare: s.wants_share_30d ? (s.wants_share_30d * 100).toFixed(1) : null,
                  wantsVsPlan: s.wants_vs_plan_pct ? s.wants_vs_plan_pct.toFixed(1) : null,
                  assetsVsPlan: s.assets_vs_plan_pct ? s.assets_vs_plan_pct.toFixed(1) : null
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#d1d5db', fontSize: '12px' }} />
                  {behaviorShift.signals.some(s => s.wants_share_30d !== null) && (
                    <Line type="monotone" dataKey="wantsShare" stroke="#fbbf24" name="Wants Share %" />
                  )}
                  {behaviorShift.signals.some(s => s.wants_vs_plan_pct !== null) && (
                    <Line type="monotone" dataKey="wantsVsPlan" stroke="#ef4444" name="Wants vs Plan %" />
                  )}
                  {behaviorShift.signals.some(s => s.assets_vs_plan_pct !== null) && (
                    <Line type="monotone" dataKey="assetsVsPlan" stroke="#10b981" name="Assets vs Plan %" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {behaviorShift.wants_shift !== null && (
              <p className="text-sm text-gray-400 mt-4">
                Wants shift: <span className={behaviorShift.wants_shift > 0 ? 'text-red-400' : 'text-green-400'}>
                  {(behaviorShift.wants_shift * 100).toFixed(1)}%
                </span>
              </p>
            )}
          </div>
        )}

        {/* Pending Nudges */}
        {pendingNudges.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mb-6 md:mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>💡</span> Pending Nudges
            </h2>
            <div className="space-y-4">
              {pendingNudges.map((nudge) => (
                <div key={nudge.candidate_id} className="border-l-4 border-yellow-500 bg-gray-700/50 rounded-lg p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                    <h3 className="font-semibold text-lg sm:text-xl">{nudge.title_template || nudge.rule_name}</h3>
                    <span className="text-xs sm:text-sm text-gray-400 bg-gray-800 px-2 py-1 rounded">
                      Score: {nudge.score?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <p className="text-gray-300 mb-4">{nudge.body_template || nudge.rule_description}</p>
                  {nudge.reason_json && Object.keys(nudge.reason_json).length > 0 && (
                    <div className="bg-gray-800/50 rounded p-2 mb-4">
                      <p className="text-xs text-gray-400 mb-1">Reason:</p>
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                        {JSON.stringify(nudge.reason_json, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 sm:gap-4">
                    {nudge.cta_text && (
                      <button
                        onClick={() => {
                          // If there's a delivery_id, log click interaction
                          // For pending nudges, we might need to queue them first
                          alert(`CTA: ${nudge.cta_text}`)
                        }}
                        className="px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 text-sm font-semibold"
                      >
                        {nudge.cta_text}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        // Dismiss nudge
                        alert('Nudge dismissed')
                      }}
                      className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delivered Nudges History */}
        {deliveredNudges.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mb-6 md:mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📬</span> Delivered Nudges History
            </h2>
            <div className="space-y-4">
              {deliveredNudges.map((nudge) => (
                <div key={nudge.delivery_id} className="border-l-4 border-blue-500 bg-gray-700/50 rounded-lg p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                    <h3 className="font-semibold text-lg sm:text-xl">{nudge.title_template || nudge.rule_name}</h3>
                    <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                      <span className="text-gray-400 bg-gray-800 px-2 py-1 rounded">
                        {formatDate(nudge.sent_at)}
                      </span>
                      <span className="text-gray-400 bg-gray-800 px-2 py-1 rounded">
                        {nudge.channel}
                      </span>
                      <span className="text-gray-400 bg-gray-800 px-2 py-1 rounded">
                        {nudge.interaction_count} interactions
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-300 mb-4">{nudge.body_template}</p>
                  <div className="flex flex-wrap gap-2 sm:gap-4">
                    <button
                      onClick={() => handleNudgeInteraction(nudge.delivery_id, 'view')}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs sm:text-sm"
                    >
                      Mark Viewed
                    </button>
                    {nudge.cta_text && (
                      <button
                        onClick={() => handleNudgeInteraction(nudge.delivery_id, 'click')}
                        className="px-3 py-1 bg-yellow-500 text-black rounded hover:bg-yellow-600 text-xs sm:text-sm font-semibold"
                      >
                        {nudge.cta_text}
                      </button>
                    )}
                    <button
                      onClick={() => handleNudgeInteraction(nudge.delivery_id, 'dismiss')}
                      className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 text-xs sm:text-sm"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTR Analytics */}
        {ctrData && (
          <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700 mb-6 md:mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-yellow-400 flex items-center gap-2">
              <span>📊</span> Click-Through Rate Analytics (Last 30 Days)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Delivered</h3>
                <p className="text-xl sm:text-2xl font-bold text-white">{ctrData.total_delivered}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Viewed</h3>
                <p className="text-xl sm:text-2xl font-bold text-blue-400">{ctrData.total_viewed}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">Clicked</h3>
                <p className="text-xl sm:text-2xl font-bold text-yellow-400">{ctrData.total_clicked}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">View Rate</h3>
                <p className="text-xl sm:text-2xl font-bold text-green-400">{ctrData.view_rate.toFixed(1)}%</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-gray-400 text-xs sm:text-sm uppercase tracking-wide mb-2">CTR</h3>
                <p className="text-xl sm:text-2xl font-bold text-purple-400">{ctrData.ctr.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        )}

        {!signals && pendingNudges.length === 0 && deliveredNudges.length === 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <p className="text-gray-400">No money moments data available yet. Click "Derive Signals" to generate insights.</p>
          </div>
        )}

        {/* User Traits Modal */}
        {showTraitsModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Edit User Traits</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Age Band</label>
                  <select
                    value={traitsForm.age_band}
                    onChange={(e) => setTraitsForm({ ...traitsForm, age_band: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="18-24">18-24</option>
                    <option value="25-34">25-34</option>
                    <option value="35-44">35-44</option>
                    <option value="45-54">45-54</option>
                    <option value="55+">55+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Gender</label>
                  <select
                    value={traitsForm.gender}
                    onChange={(e) => setTraitsForm({ ...traitsForm, gender: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">Prefer not to say</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="nonbinary">Non-binary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Region Code</label>
                  <input
                    type="text"
                    value={traitsForm.region_code}
                    onChange={(e) => setTraitsForm({ ...traitsForm, region_code: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="IN"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Lifestyle Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={traitsForm.lifestyle_tags}
                    onChange={(e) => setTraitsForm({ ...traitsForm, lifestyle_tags: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="fitness, travel, foodie"
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleSaveTraits}
                  className="flex-1 px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 font-semibold"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowTraitsModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suppression Settings Modal */}
        {showSuppressionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">Suppression Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Channel</label>
                  <select
                    value={suppressionForm.channel}
                    onChange={(e) => setSuppressionForm({ ...suppressionForm, channel: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="in_app">In-App</option>
                    <option value="push">Push</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Muted Until (optional)</label>
                  <input
                    type="datetime-local"
                    value={suppressionForm.muted_until}
                    onChange={(e) => setSuppressionForm({ ...suppressionForm, muted_until: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Daily Cap</label>
                  <input
                    type="number"
                    value={suppressionForm.daily_cap}
                    onChange={(e) => setSuppressionForm({ ...suppressionForm, daily_cap: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    min="1"
                    max="10"
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleSaveSuppression}
                  className="flex-1 px-4 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 font-semibold"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSuppressionModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
