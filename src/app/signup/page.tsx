'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Building2, Wrench, ShoppingCart } from 'lucide-react'
import { Field, Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

type VendorType = 'BRAND' | 'SC' | 'POS'

const TYPES: { key: VendorType; label: string; tagline: string; icon: typeof Building2 }[] = [
  { key: 'BRAND', label: 'Brand', tagline: 'Multi-role call center, appointments, multiple centers', icon: Building2 },
  { key: 'SC', label: 'Service Center', tagline: 'Single login, run your own workorder shop', icon: Wrench },
  { key: 'POS', label: 'POS', tagline: 'Billing counter for retail stores & enterprises', icon: ShoppingCart },
]

/**
 * One-step public signup -- replaces the old two-step flow (register a
 * User account first, then apply separately with that account's ID, plus
 * mandatory GST/PAN and a compliance-document checklist). Per explicit
 * direction: sign up with just email + minimal details, no documents, no
 * separate account-creation step, and not squeezed into a modal.
 */
export default function SignupPage() {
  const [type, setType] = useState<VendorType | null>(null)
  const [form, setForm] = useState({ name: '', companyName: '', email: '', phone: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!type) { setError('Choose the type of business you’re signing up as'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/vendors/self-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, appliedAs: type }),
      })
      const d = await res.json()
      if (!res.ok || !d.success) throw new Error(d.message || 'Signup failed')
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-success-soft flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <h1 className="h-section mb-2">You&apos;re signed up</h1>
          <p className="text-sm text-ink-3 mb-6">
            We&apos;ve received your details and are activating your account. You can log in as soon as it&apos;s approved.
          </p>
          <Link href="/login">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-10 items-start">
        <div className="hidden md:block pt-6">
          <p className="eyebrow mb-2">AN-CRM</p>
          <h1 className="h-page mb-3">Get your business online in minutes.</h1>
          <p className="text-sm text-ink-3 max-w-sm">
            Sales pipeline, service workorders, billing, and inventory — one login, no paperwork upfront.
            Add compliance details later, whenever you actually need them.
          </p>
        </div>

        <Card className="p-8">
          <h2 className="h-section mb-1">Create your account</h2>
          <p className="text-sm text-ink-3 mb-6">Just the basics — you can add the rest later.</p>

          <div className="grid grid-cols-3 gap-2 mb-6">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`flex flex-col items-center text-center gap-1.5 rounded-control border p-3 transition ${
                  type === t.key ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong'
                }`}
              >
                <t.icon className={`w-5 h-5 ${type === t.key ? 'text-accent' : 'text-ink-3'}`} />
                <span className={`text-xs font-medium ${type === t.key ? 'text-accent' : 'text-ink'}`}>{t.label}</span>
                <span className="text-[10px] text-ink-3 leading-tight">{t.tagline}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Full name" required>
              <Input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Jane Doe" />
            </Field>
            <Field label="Company / business name" required>
              <Input required value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} placeholder="Acme Service Center" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email" required>
                <Input required type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="you@company.com" />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
              </Field>
            </div>
            <Field label="Password" required hint="At least 8 characters">
              <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
            </Field>

            {error && <p className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{error}</p>}

            <Button type="submit" className="w-full" loading={submitting}>
              Create Account
            </Button>

            <p className="text-xs text-ink-3 text-center">
              Already have an account? <Link href="/login" className="text-accent hover:underline">Log in</Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}
