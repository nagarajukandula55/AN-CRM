'use client'

import { useState, useEffect } from 'react'
import {
  AlertCircle,
  Save,
  Lock,
  CheckCircle,
  Eye,
  EyeOff,
  Building2,
  BadgeCheck,
  ShieldCheck,
  Clock,
  User,
} from 'lucide-react'
import { Spinner, LoadingPanel } from '@/components/ui/Spinner'

interface UserProfile {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  avatar?: string
  createdAt: string
  employeeProfile?: {
    employeeId: string
    department: string
    designation: string
    isActive: boolean
  }
  vendorProfile?: {
    companyName: string
    vendorId: string
    isApproved: boolean
    category: string
  }
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-danger-soft text-danger border-danger',
  ADMIN: 'bg-orange-50 text-orange-700 border-orange-200',
  STAFF: 'bg-info-soft text-info border-info',
  EMPLOYEE: 'bg-accent-soft text-accent border-indigo-200',
  VENDOR: 'bg-violet-50 text-violet-700 border-violet-200',
  CUSTOMER: 'bg-success-soft text-success border-success',
}

const AVATAR_GRADIENTS: Record<string, string> = {
  SUPER_ADMIN: 'from-red-600 to-orange-600',
  ADMIN: 'from-orange-500 to-amber-500',
  STAFF: 'from-blue-500 to-cyan-500',
  EMPLOYEE: 'from-indigo-500 to-blue-500',
  VENDOR: 'from-violet-500 to-purple-500',
  CUSTOMER: 'from-emerald-500 to-teal-500',
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs text-ink-3 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '••••••••'}
          className="w-full bg-surface border border-border rounded-card px-4 py-2.5 pr-10 text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Profile form
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Password form
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.user) {
          setProfile(res.user)
          setEditName(res.user.name || '')
          setEditPhone(res.user.phone || '')
        } else {
          setError(res.message || 'Failed to load profile')
        }
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    setProfileMsg(null)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, phone: editPhone }),
      })
      const data = await res.json()
      if (data.success) {
        setProfileMsg({ type: 'success', text: 'Profile updated successfully' })
        if (profile) setProfile({ ...profile, name: editName, phone: editPhone })
        setTimeout(() => setProfileMsg(null), 3000)
      } else {
        setProfileMsg({ type: 'error', text: data.message || 'Failed to save' })
      }
    } catch {
      setProfileMsg({ type: 'error', text: 'Failed to save profile' })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'All password fields are required' })
      return
    }
    if (newPassword.length < 8) {
      setPasswordMsg({
        type: 'error',
        text: 'New password must be at least 8 characters',
      })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Passwords do not match' })
      return
    }
    setSavingPassword(true)
    setPasswordMsg(null)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setPasswordMsg({ type: 'success', text: 'Password changed successfully' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => setPasswordMsg(null), 3000)
      } else {
        setPasswordMsg({ type: 'error', text: data.message || 'Failed to change password' })
      }
    } catch {
      setPasswordMsg({ type: 'error', text: 'Failed to change password' })
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <LoadingPanel label="Loading…" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-danger mx-auto mb-2" />
          <p className="text-ink-2">{error || 'Profile not found'}</p>
        </div>
      </div>
    )
  }

  const initials = profile.name
    ? profile.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  const avatarGradient =
    AVATAR_GRADIENTS[profile.role] || 'from-gray-600 to-gray-500'
  const roleColor =
    ROLE_COLORS[profile.role] || 'bg-surface-2 text-ink-2 border-border'

  const memberSince = new Date(profile.createdAt).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-bg text-ink p-4 lg:p-8">
      <div className="relative max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <p className="text-xs text-ink-3 uppercase tracking-widest">
            Account
          </p>
          <h1 className="text-2xl font-bold text-ink mt-0.5">My Profile</h1>
        </div>

        {/* Avatar + Identity Card */}
        <div className="rounded-card border border-border bg-surface p-6">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div
              className={`h-20 w-20 rounded-card bg-gradient-to-br ${avatarGradient} flex items-center justify-center flex-shrink-0 shadow-lg`}
            >
              <span className="text-2xl font-bold text-white">{initials}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-ink">{profile.name}</h2>
                  <p className="text-sm text-ink-3 mt-0.5">{profile.email}</p>
                </div>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-control text-xs font-medium border ${roleColor}`}
                >
                  {profile.role}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-3">
                {profile.phone && (
                  <p className="text-xs text-ink-3">{profile.phone}</p>
                )}
                <p className="text-xs text-ink-3">Member since {memberSince}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Employee Card */}
        {profile.role === 'EMPLOYEE' && profile.employeeProfile && (
          <div className="rounded-card border border-indigo-200 bg-accent-soft p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded-card bg-accent-soft border border-indigo-200 flex items-center justify-center">
                <BadgeCheck className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Employee Details
                </h3>
                <p className="text-xs text-ink-3">
                  Your organizational information
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                  Employee ID
                </p>
                <p className="text-sm font-mono text-ink-2">
                  {profile.employeeProfile.employeeId}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                  Department
                </p>
                <p className="text-sm text-ink-2">
                  {profile.employeeProfile.department || '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                  Designation
                </p>
                <p className="text-sm text-ink-2">
                  {profile.employeeProfile.designation || '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Vendor Card */}
        {profile.role === 'VENDOR' && profile.vendorProfile && (
          <div className="rounded-card border border-violet-200 bg-violet-50 p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="h-8 w-8 rounded-card bg-violet-100 border border-violet-200 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-violet-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  Vendor Details
                </h3>
                <p className="text-xs text-ink-3">
                  Your business information
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                  Company
                </p>
                <p className="text-sm text-ink-2">
                  {profile.vendorProfile.companyName}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                  Vendor ID
                </p>
                <p className="text-sm font-mono text-ink-2">
                  {profile.vendorProfile.vendorId}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-ink-3 uppercase tracking-wider mb-1">
                  Status
                </p>
                {profile.vendorProfile.isApproved ? (
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-success" />
                    <span className="text-sm text-success">Approved</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-warning" />
                    <span className="text-sm text-warning">Pending</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile */}
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="h-8 w-8 rounded-card bg-surface-2 flex items-center justify-center">
              <User className="h-4 w-4 text-ink-3" />
            </div>
            <h2 className="text-sm font-semibold text-ink">
              Personal Information
            </h2>
          </div>

          {profileMsg && (
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-card text-sm mb-4 ${
                profileMsg.type === 'success'
                  ? 'bg-success-soft border border-success/20 text-success'
                  : 'bg-danger-soft border border-danger/20 text-danger'
              }`}
            >
              {profileMsg.type === 'success' ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {profileMsg.text}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-ink-3 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={profile.email}
                readOnly
                className="w-full bg-surface-2 border border-border rounded-card px-4 py-2.5 text-sm text-ink-3 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-3 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-surface border border-border rounded-card px-4 py-2.5 text-sm text-ink placeholder-ink-3 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end mt-5">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="flex items-center gap-2 px-5 py-2.5 rounded-card bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all disabled:opacity-50"
            >
              {savingProfile ? (
                <Spinner size={16} />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="h-8 w-8 rounded-card bg-surface-2 flex items-center justify-center">
              <Lock className="h-4 w-4 text-ink-3" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Change Password
              </h2>
              <p className="text-xs text-ink-3">
                Use a strong password with at least 8 characters
              </p>
            </div>
          </div>

          {passwordMsg && (
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-card text-sm mb-4 ${
                passwordMsg.type === 'success'
                  ? 'bg-success-soft border border-success/20 text-success'
                  : 'bg-danger-soft border border-danger/20 text-danger'
              }`}
            >
              {passwordMsg.type === 'success' ? (
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
              )}
              {passwordMsg.text}
            </div>
          )}

          <div className="space-y-4">
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              placeholder="Your current password"
            />
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="At least 8 characters"
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repeat new password"
            />
          </div>

          <div className="flex justify-end mt-5">
            <button
              onClick={handleChangePassword}
              disabled={savingPassword}
              className="flex items-center gap-2 px-5 py-2.5 rounded-card bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-all disabled:opacity-50"
            >
              {savingPassword ? (
                <Spinner size={16} />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {savingPassword ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
