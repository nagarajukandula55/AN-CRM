'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Eye,
  EyeOff,
  Loader2,
  User,
  Building2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { validateGSTINAgainstState } from '@/lib/validation/gst'

// Only two signup paths: a single account-creation form (covers customers
// AND future employees — an admin grants EMPLOYEE business access to an
// already-registered account afterward via /admin/users, rather than
// employees self-registering against a pre-issued Employee ID), and the
// vendor application (which genuinely needs separate company/compliance
// documents collected up front). Vendor STAFF also use the plain signup
// below, then a vendor adds them by user ID on /vendor/staff.
type Tab = 'customer' | 'vendor'

const BUSINESS_CATEGORIES = [
  'Manufacturing',
  'Trading',
  'Services',
  'Logistics',
  'Technology',
  'Retail',
  'Agriculture',
  'Construction',
  'Healthcare',
  'Education',
  'Other',
]

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
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || '••••••••'}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 transition-colors"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  onBlur,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  onBlur?: () => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 transition-colors"
      />
    </div>
  )
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Homepage's "Become a Partner" CTA links here with ?tab=vendor so the
  // vendor tab is pre-selected instead of landing on the default Customer
  // tab and making the visitor find it themselves.
  const [activeTab, setActiveTab] = useState<Tab>(searchParams.get('tab') === 'vendor' ? 'vendor' : 'customer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Customer form
  const [custName, setCustName] = useState('')
  const [custUsername, setCustUsername] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPassword, setCustPassword] = useState('')
  const [custConfirm, setCustConfirm] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custTerms, setCustTerms] = useState(false)

  // Vendor form
  const [vendCompany, setVendCompany] = useState('')
  const [vendContact, setVendContact] = useState('')
  const [vendUsername, setVendUsername] = useState('')
  const [vendEmail, setVendEmail] = useState('')
  const [vendPassword, setVendPassword] = useState('')
  const [vendPhone, setVendPhone] = useState('')
  const [vendGst, setVendGst] = useState('')
  const [vendPan, setVendPan] = useState('')
  const [vendCategory, setVendCategory] = useState('')
  const [vendCity, setVendCity] = useState('')
  const [vendState, setVendState] = useState('')
  const [vendPincode, setVendPincode] = useState('')
  const [vendGstWarning, setVendGstWarning] = useState<string | null>(null)

  const handleCustomerRegister = async () => {
    if (!custName || !custEmail || !custPassword) {
      setError('Please fill in all required fields')
      return
    }
    if (custPassword !== custConfirm) {
      setError('Passwords do not match')
      return
    }
    if (!custTerms) {
      setError('Please accept the terms and conditions')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: custName,
          username: custUsername || undefined,
          email: custEmail,
          password: custPassword,
          phone: custPhone,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(
          data.username
            ? `Account created! Your user ID is "${data.username}" — share it with a vendor to be added as their staff, or with your employer to be added to a business. Redirecting to login...`
            : 'Account created! Redirecting to login...'
        )
        setTimeout(() => router.push('/login'), 2500)
      } else {
        setError(data.message || 'Registration failed')
      }
    } catch {
      setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleVendGstBlur() {
    if (!vendGst.trim()) {
      setVendGstWarning(null)
      return
    }
    const result = validateGSTINAgainstState(vendGst, vendState || undefined)
    setVendGstWarning(result.valid ? null : result.reason || 'Invalid GSTIN')
  }

  const handleVendorRegister = async () => {
    if (!vendCompany || !vendContact || !vendEmail || !vendPassword) {
      setError('Please fill in all required fields')
      return
    }
    if (vendGst.trim()) {
      const result = validateGSTINAgainstState(vendGst, vendState || undefined)
      if (!result.valid) {
        setError(result.reason || 'Invalid GSTIN')
        return
      }
    }
    if (vendPincode.trim() && !/^[1-9][0-9]{5}$/.test(vendPincode.trim())) {
      setError('Pincode must be a valid 6-digit Indian PIN code')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register/vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: vendCompany,
          contactPerson: vendContact,
          username: vendUsername || undefined,
          email: vendEmail,
          password: vendPassword,
          phone: vendPhone,
          gstNumber: vendGst,
          panNumber: vendPan,
          category: vendCategory,
          city: vendCity,
          state: vendState,
          pincode: vendPincode,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(
          data.message ||
            'Vendor account submitted for review. You will be notified once approved.'
        )
      } else {
        setError(data.message || 'Registration failed')
      }
    } catch {
      setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    setError('')
    setSuccess('')
    if (activeTab === 'customer') handleCustomerRegister()
    else handleVendorRegister()
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'customer', label: 'Sign Up', icon: <User className="h-4 w-4" /> },
    { id: 'vendor', label: "I'm a Vendor", icon: <Building2 className="h-4 w-4" /> },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-100/40 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full bg-blue-100/30 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-violet-50 border border-violet-200 items-center justify-center mb-4">
            <span className="text-xl font-bold text-violet-600">AN</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create an account</h1>
          <p className="text-gray-500 text-sm mt-1">
            Join the AN Group platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* Tab selector */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 border border-gray-200 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setError('')
                  setSuccess('')
                }}
                className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm mb-4">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Customer Form */}
          {activeTab === 'customer' && (
            <div className="space-y-4">
              <InputField
                label="Full Name"
                value={custName}
                onChange={setCustName}
                placeholder="John Doe"
                required
              />
              <InputField
                label="Email Address"
                value={custEmail}
                onChange={setCustEmail}
                placeholder="john@example.com"
                type="email"
                required
              />
              <InputField
                label="User ID (optional, must be unique — auto-generated if left blank)"
                value={custUsername}
                onChange={(v) => setCustUsername(v.toLowerCase().replace(/\s+/g, ''))}
                placeholder="e.g. johnd"
              />
              <p className="text-xs text-gray-400 -mt-2">
                This account works for both customers and employees — once
                you have it, a business admin can add you to their team, or
                a vendor can add you as staff using your User ID.
              </p>
              <InputField
                label="Phone Number"
                value={custPhone}
                onChange={setCustPhone}
                placeholder="+91 98765 43210"
                type="tel"
              />
              <PasswordField
                label="Password *"
                value={custPassword}
                onChange={setCustPassword}
              />
              <PasswordField
                label="Confirm Password *"
                value={custConfirm}
                onChange={setCustConfirm}
                placeholder="Repeat password"
              />
              <label className="flex items-start gap-3 cursor-pointer group">
                <div
                  onClick={() => setCustTerms(!custTerms)}
                  className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    custTerms
                      ? 'bg-violet-600 border-violet-600'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {custTerms && (
                    <svg
                      className="h-2.5 w-2.5 text-white"
                      viewBox="0 0 10 10"
                      fill="none"
                    >
                      <path
                        d="M1.5 5L4 7.5L8.5 2.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-gray-500 group-hover:text-gray-700 transition-colors">
                  I agree to the{' '}
                  <span className="text-violet-600">Terms of Service</span> and{' '}
                  <span className="text-violet-600">Privacy Policy</span>
                </span>
              </label>
            </div>
          )}

          {/* Vendor Form */}
          {activeTab === 'vendor' && (
            // /partner-signup is a single guided flow that creates the
            // account AND submits the vendor application together, so a
            // brand-new visitor doesn't have to do the Customer tab first
            // and then separately go find /vendor-apply. Someone who
            // already HAS an account and just needs to apply (or finish
            // an application after their account creation succeeded but
            // the application step failed) still uses /vendor-apply
            // directly -- both entry points end at the same real
            // application record either way.
            <div className="space-y-4">
              <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-4 space-y-2">
                <p className="text-sm text-gray-800 font-medium">Become an AN Group Partner</p>
                <p className="text-xs text-gray-600">
                  One guided form creates your account and submits your business application together.
                </p>
              </div>
              <Link
                href="/partner-signup"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all"
              >
                Get Started as a Partner
              </Link>
              <p className="text-center text-xs text-gray-400">
                Already have an account?{' '}
                <Link href="/vendor-apply" className="text-violet-600 hover:text-violet-700">
                  Apply as a vendor
                </Link>
              </p>
            </div>
          )}

          {/* Submit — vendor tab's CTA is the "Go to Vendor Application" link above instead */}
          {activeTab === 'customer' && (
            <button
              onClick={handleSubmit}
              disabled={loading || !!success}
              className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}
