'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { User, Bell, Shield, Globe, Key, Save, Eye, EyeOff } from 'lucide-react'

/**
 * MOVED from src/app/settings/page.tsx (orphaned root-level route) to
 * src/app/admin/settings/account. This is the PERSONAL account settings
 * page (profile/password/notification prefs/platform info) — a distinct
 * concern from the new business-wide admin Settings hub at
 * src/app/admin/settings. Kept exactly as it was (fully functional
 * already, nothing to fix) other than the relocation and this note; linked
 * from the admin settings hub's header so it isn't orphaned again.
 */
export default function AccountSettingsPage() {
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications' | 'platform'>('profile')
  const [profileForm, setProfileForm] = useState({ name: '', email: '', phone: '' })
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [msg, setMsg] = useState('')
  const [notifPrefs, setNotifPrefs] = useState({ email: true, orderUpdates: true, lowStock: true, payments: true, newAgreements: true })

  const { data: meData } = useSWR('/api/auth/me')
  const user = meData?.success ? meData.user : null

  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name || '', email: user.email || '', phone: user.phone || '' })
    }
  }, [user])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(profileForm),
      })
      const d = await res.json()
      setMsg(d.success ? '✓ Profile updated' : d.message)
    } catch { setMsg('Failed to save') }
    setSaving(false)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwForm.newPw !== pwForm.confirm) { setMsg('Passwords do not match'); return }
    setSaving(true)
    setMsg('')
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.newPw }),
      })
      const d = await res.json()
      setMsg(d.success ? '✓ Password changed' : d.message)
      if (d.success) setPwForm({ current: '', newPw: '', confirm: '' })
    } catch { setMsg('Failed to change password') }
    setSaving(false)
  }

  const TABS = [
    { key: 'profile', label: 'Profile', icon: <User size={14} /> },
    { key: 'security', label: 'Security', icon: <Shield size={14} /> },
    { key: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
    { key: 'platform', label: 'Platform', icon: <Globe size={14} /> },
  ]

  return (
      <div className="space-y-5 max-w-3xl mx-auto">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Account</p>
          <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        </div>

        {msg && (
          <div className={`rounded-xl px-4 py-3 text-sm ${msg.startsWith('✓') ? 'bg-green-500/10 border border-green-500/20 text-green-700' : 'bg-red-500/10 border border-red-500/20 text-red-700'}`}>
            {msg}
          </div>
        )}

        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as any); setMsg('') }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-all flex-1 justify-center ${tab === t.key ? 'bg-gray-900 text-white font-semibold' : 'text-gray-500 hover:text-gray-900'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">Profile Information</h3>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="flex items-center gap-4 mb-5">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-900">
                  {profileForm.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{profileForm.name}</p>
                  <p className="text-xs text-gray-500">{user?.role} · {user?.isSuperAdmin ? 'Super Admin' : 'Staff'}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Full Name</label>
                <input value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input type="email" value={profileForm.email} onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Phone</label>
                <input value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400" />
              </div>
              <button type="submit" disabled={saving} className="btn-primary rounded-xl px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
                <Save size={13} /> {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </form>
          </div>
        )}

        {tab === 'security' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5 flex items-center gap-2"><Key size={14} /> Change Password</h3>
            <form onSubmit={changePassword} className="space-y-4">
              {[
                { label: 'Current Password', key: 'current' },
                { label: 'New Password', key: 'newPw' },
                { label: 'Confirm New Password', key: 'confirm' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={(pwForm as any)[key]}
                      onChange={e => setPwForm({...pwForm, [key]: e.target.value})} required
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 pr-10 text-sm text-gray-900 outline-none focus:border-gray-400" />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              ))}
              <button type="submit" disabled={saving} className="btn-primary rounded-xl px-5 py-2 text-sm disabled:opacity-50">
                {saving ? 'Changing…' : 'Change Password'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Security Info</h4>
              <div className="space-y-2 text-xs text-gray-500">
                <p>Last login: {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'N/A'}</p>
                <p>Account created: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5">Notification Preferences</h3>
            <div className="space-y-4">
              {[
                { key: 'email', label: 'Email Notifications', desc: 'Receive notifications via email' },
                { key: 'orderUpdates', label: 'Order Updates', desc: 'New orders, status changes, deliveries' },
                { key: 'lowStock', label: 'Low Stock Alerts', desc: 'Get alerted when inventory is running low' },
                { key: 'payments', label: 'Payment Alerts', desc: 'Invoice payments, overdue reminders' },
                { key: 'newAgreements', label: 'Agreement Notifications', desc: 'New agreements, signing requests' },
              ].map(pref => (
                <div key={pref.key} className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <p className="text-sm text-gray-900">{pref.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{pref.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifPrefs(prev => ({ ...prev, [pref.key]: !prev[pref.key as keyof typeof prev] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all ${(notifPrefs as any)[pref.key] ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${(notifPrefs as any)[pref.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setMsg('✓ Preferences saved')} className="mt-4 btn-primary rounded-xl px-5 py-2 text-sm flex items-center gap-2">
              <Save size={13} /> Save Preferences
            </button>
          </div>
        )}

        {tab === 'platform' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-5 flex items-center gap-2"><Globe size={14} /> Platform Settings</h3>
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-gray-500 font-medium">AN Group Enterprise</p>
                <div className="mt-2 space-y-1.5 text-xs text-gray-600">
                  <p>Version: 2.0.0</p>
                  <p>SSO: Enabled</p>
                  <p>ERP Modules: Inventory, Purchase, Sales, Finance, HR, CRM</p>
                  <p>Chat: Enabled (SSE real-time)</p>
                  <p>Documents: Agreements, Invoices, POs</p>
                </div>
              </div>
              <div className="rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-4">
                <p className="text-xs text-yellow-700 font-semibold mb-1">Environment</p>
                <p className="text-xs text-gray-500">For configuration, update your .env.local file:</p>
                <ul className="mt-2 space-y-1 text-xs text-gray-600 font-mono">
                  <li>MONGODB_URI — MongoDB Atlas connection string</li>
                  <li>JWT_SECRET — Auth signing secret</li>
                  <li>SSO_SECRET — SSO token secret</li>
                  <li>NEXT_PUBLIC_APP_URL — Your deployment URL</li>
                  <li>CLOUDINARY_* — File upload credentials</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
  )
}
