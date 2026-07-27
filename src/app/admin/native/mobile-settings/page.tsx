'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Smartphone } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'

interface Business {
  _id: string
  name: string
}

interface OsConfig {
  minVersion?: string
  forceUpdate: boolean
  storeUrl?: string
}

interface Config {
  businessId?: string | null
  ios: OsConfig
  android: OsConfig
  maintenanceMode: boolean
  maintenanceMessage?: string
  pushNotificationsEnabled: boolean
}

const EMPTY_CONFIG: Config = {
  businessId: null,
  ios: { forceUpdate: false },
  android: { forceUpdate: false },
  maintenanceMode: false,
  pushNotificationsEnabled: false,
}

export default function MobileAppSettingsPage() {
  const router = useRouter()
  const toast = useToast()
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG)
  const [saving, setSaving] = useState(false)

  const { data: configData, isLoading: configLoading } = useSWR('/api/mobile-app/config')
  const { data: meData, isLoading: meLoading } = useSWR('/api/auth/me')
  const loading = configLoading || meLoading
  const isSuperAdmin = !!meData?.isSuperAdmin
  const businesses: Business[] = meData?.businesses || []

  useEffect(() => {
    if (configData?.success) setConfig({ ...EMPTY_CONFIG, ...configData.config })
  }, [configData])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mobile-app/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Mobile app settings saved')
        setConfig({ ...EMPTY_CONFIG, ...data.config })
      } else {
        toast.error(data.message || 'Failed to save')
      }
    } catch {
      toast.error('Failed to connect to server')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 text-center px-6">
        <h2 className="text-lg font-medium text-gray-900">Super Admin only</h2>
        <p className="text-sm text-gray-500 max-w-sm">Mobile app settings control every install of the app platform-wide.</p>
        <button onClick={() => router.push('/admin/native')} className="mt-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition">
          Back
        </button>
      </div>
    )
  }

  const inputCls = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
  const labelCls = "block text-xs uppercase tracking-wide text-gray-400 mb-1"

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-[1800px] mx-auto px-6 py-10">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/admin/native')}
            className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Mobile App Settings</h1>
              <p className="text-sm text-gray-400">Controls the Android/iOS app (/mobile) platform-wide — no rebuild required</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="font-bold text-lg">Business Tenant</h2>
            <p className="text-xs text-gray-500">
              Which business's products/vendors/orders the mobile app represents (same as the web storefront's businessId).
            </p>
            <div>
              <label className={labelCls}>Business</label>
              <select
                className={inputCls}
                value={config.businessId || ''}
                onChange={e => setConfig({ ...config, businessId: e.target.value || null })}
              >
                <option value="">Not set</option>
                {businesses.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="font-bold text-lg">Maintenance Mode</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={config.maintenanceMode}
                onChange={e => setConfig({ ...config, maintenanceMode: e.target.checked })}
              />
              App shows a maintenance screen instead of the storefront
            </label>
            {config.maintenanceMode && (
              <div>
                <label className={labelCls}>Message shown to users</label>
                <input
                  className={inputCls}
                  value={config.maintenanceMessage || ''}
                  onChange={e => setConfig({ ...config, maintenanceMessage: e.target.value })}
                  placeholder="We'll be back shortly."
                />
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
            <h2 className="font-bold text-lg">Push Notifications</h2>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={config.pushNotificationsEnabled}
                onChange={e => setConfig({ ...config, pushNotificationsEnabled: e.target.checked })}
              />
              Enable push notifications
            </label>
          </section>

          {(['ios', 'android'] as const).map(os => (
            <section key={os} className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
              <h2 className="font-bold text-lg">{os === 'ios' ? 'iOS' : 'Android'} Settings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Minimum Supported Version</label>
                  <input
                    className={inputCls}
                    value={config[os].minVersion || ''}
                    onChange={e => setConfig({ ...config, [os]: { ...config[os], minVersion: e.target.value } })}
                    placeholder="e.g. 1.0.0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Store URL</label>
                  <input
                    className={inputCls}
                    value={config[os].storeUrl || ''}
                    onChange={e => setConfig({ ...config, [os]: { ...config[os], storeUrl: e.target.value } })}
                    placeholder={os === 'ios' ? 'https://apps.apple.com/...' : 'https://play.google.com/...'}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={config[os].forceUpdate}
                  onChange={e => setConfig({ ...config, [os]: { ...config[os], forceUpdate: e.target.checked } })}
                />
                Force update — block app use below the minimum version
              </label>
            </section>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="bg-gray-900 px-6 py-3 text-white font-medium rounded-xl disabled:opacity-40 hover:bg-gray-800 transition"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
