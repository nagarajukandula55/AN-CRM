'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { validateGSTIN } from '@/lib/validation/gst'
import { ArrowLeft, Plus, Trash2, Loader2, Users, X, Search, QrCode, Landmark, PenLine, Check } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StateSelect, CitySelect, PincodeInput } from '@/components/shared/LocationSelect'
import { useActiveBusinessId } from '@/hooks/useActiveBusinessId'
import { GST_SLABS } from '@/core/gst/gstSlabs'

/**
 * Full-page invoice creation, not a modal -- per explicit direction to
 * match the reference billing app's dedicated "Create Sales Invoice"
 * screen (Bill To + Invoice Details side by side, full-width line items,
 * Notes/Terms + Totals at the bottom) instead of the old cramped indigo/
 * gray modal dialog still on /console/sales (kept there for now so
 * nothing regresses; its "New Invoice" button now routes here instead of
 * opening it). Same submit logic/customer-directory behavior as that
 * modal, just laid out full-page with the app's actual design tokens.
 */

interface Customer {
  name: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  gstin?: string
}

interface LineItem {
  description: string
  hsnCode: string
  qty: number
  unit: string
  price: number
  taxPct: number
}

type InvoiceType = 'GST' | 'NON_GST'

const todayStr = () => new Date().toISOString().split('T')[0]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

function calcItems(items: LineItem[], invoiceType: InvoiceType, supplyType: 'INTRASTATE' | 'INTERSTATE') {
  let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, taxTotal = 0
  for (const item of items) {
    const lineAmt = (item.qty || 1) * (item.price || 0)
    const taxAmt = lineAmt * ((item.taxPct || 0) / 100)
    subtotal += lineAmt
    if (invoiceType === 'GST' && supplyType === 'INTERSTATE') igstTotal += taxAmt
    else if (invoiceType === 'GST') { cgstTotal += taxAmt / 2; sgstTotal += taxAmt / 2 }
    else taxTotal += taxAmt
  }
  const tax = invoiceType === 'GST' ? cgstTotal + sgstTotal + igstTotal : taxTotal
  return { subtotal, cgstTotal, sgstTotal, igstTotal, taxTotal, grandTotal: subtotal + tax }
}

const inputCls = "w-full bg-surface border border-border rounded-control px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
const labelCls = "block text-xs font-medium text-ink-2 mb-1"

export default function NewSalesInvoicePage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [invoiceType, setInvoiceType] = useState<InvoiceType>('GST')
  const [supplyType, setSupplyType] = useState<'INTRASTATE' | 'INTERSTATE'>('INTRASTATE')
  const [customer, setCustomer] = useState<Customer>({ name: '', email: '', phone: '', address: '', city: '', state: '', pincode: '', gstin: '' })
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('Payment due within 30 days.')
  // Bank Details / UPI QR / Signature are all set once in Settings and, by
  // default, appear on every printed invoice automatically -- these three
  // let the invoice creator opt any of them out for THIS invoice
  // specifically (e.g. a B2B invoice where the customer already has bank
  // details on file), per explicit direction ("add those in Sales Invoice
  // creation page so that users can select from there directly if
  // required"). All default true so existing automatic behavior is
  // unchanged unless someone actively unchecks one.
  const [showPaymentQr, setShowPaymentQr] = useState(true)
  const [showBankDetails, setShowBankDetails] = useState(true)
  const [showSignature, setShowSignature] = useState(true)
  const [issueDate, setIssueDate] = useState(todayStr())
  const [dueDate, setDueDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [items, setItems] = useState<LineItem[]>([
    { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: 18 },
  ])

  const { businessId } = useActiveBusinessId()
  const { data: businessData } = useSWR(businessId ? `/api/businesses/${businessId}` : null)
  const biz = businessData?.business

  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [showCustomerResults, setShowCustomerResults] = useState(false)
  const { data: customerSearchData } = useSWR(
    businessId && customerQuery.trim().length >= 3 ? `/api/customers?businessId=${businessId}&search=${encodeURIComponent(customerQuery.trim())}` : null
  )
  const customerResults: Array<{ _id: string; name: string; phone?: string; email?: string; address?: string }> =
    customerSearchData?.success !== false ? (customerSearchData?.customers ?? []) : []

  type CustomerRecord = { _id: string; name: string; phone?: string; email?: string; address?: string; city?: string; state?: string; pincode?: string; gstin?: string }

  function applyCustomer(c: CustomerRecord) {
    setCustomer({
      name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '',
      city: c.city || '', state: c.state || '', pincode: c.pincode || '', gstin: c.gstin || '',
    })
    setSelectedCustomerId(c._id)
    setShowCustomerResults(false)
  }

  function selectCustomer(c: { _id: string; name: string; phone?: string; email?: string; address?: string }) {
    applyCustomer(c)
  }

  // Browse-all-customers modal -- the inline name/phone search above only
  // surfaces a match once you've typed 3+ characters; this gives a full
  // table of every customer on the shared directory to pick from, plus a
  // way to add a brand new one without leaving the invoice screen.
  const [showCustomerBrowser, setShowCustomerBrowser] = useState(false)
  const [browserSearch, setBrowserSearch] = useState('')
  const { data: browserData, mutate: refetchBrowserCustomers } = useSWR(
    showCustomerBrowser && businessId ? `/api/customers?businessId=${businessId}${browserSearch.trim() ? `&search=${encodeURIComponent(browserSearch.trim())}` : ''}` : null
  )
  const browserCustomers: CustomerRecord[] = browserData?.success !== false ? (browserData?.customers ?? []) : []

  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '' })
  const [savingCustomer, setSavingCustomer] = useState(false)
  const [addCustomerError, setAddCustomerError] = useState<string | null>(null)

  async function submitNewCustomer() {
    if (!newCustomer.name.trim()) { setAddCustomerError('Name is required.'); return }
    setSavingCustomer(true); setAddCustomerError(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCustomer, businessId, source: 'sales_invoice' }),
      })
      const d = await res.json()
      if (!res.ok || d.success === false) throw new Error(d.error || 'Failed to add customer')
      applyCustomer(d.customer)
      refetchBrowserCustomers()
      setShowAddCustomer(false)
      setShowCustomerBrowser(false)
      setNewCustomer({ name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '' })
    } catch (err: any) {
      setAddCustomerError(err.message || 'Something went wrong')
    } finally {
      setSavingCustomer(false)
    }
  }

  function addItem() {
    setItems(p => [...p, { description: '', hsnCode: '', qty: 1, unit: 'Nos', price: 0, taxPct: invoiceType === 'GST' ? 18 : 0 }])
  }
  function removeItem(i: number) {
    setItems(p => p.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const calc = calcItems(items, invoiceType, supplyType)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer.name.trim()) { setFormError('Customer name is required'); return }
    if (customer.gstin?.trim()) {
      const result = validateGSTIN(customer.gstin)
      if (!result.valid) { setFormError(`Customer GSTIN: ${result.reason}`); return }
    }
    setSubmitting(true); setFormError(null)
    try {
      const payload: Record<string, unknown> = {
        businessId,
        customer,
        invoiceType,
        items: items.map(it => ({
          description: it.description, hsnCode: it.hsnCode, quantity: it.qty,
          unit: it.unit, unitPrice: it.price, taxRate: it.taxPct,
        })),
        discountAmount: discount,
        notes, terms,
        showPaymentQr, showBankDetails, showSignature,
        issueDate: issueDate || todayStr(),
        dueDate: dueDate || undefined,
        status: 'DRAFT',
        supplyType: invoiceType === 'GST' ? supplyType : 'INTERSTATE',
      }
      const res = await fetch('/api/sales/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? d.message ?? 'Failed to create invoice')
      }
      if (!selectedCustomerId && customer.name.trim()) {
        fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address, city: customer.city, state: customer.state, pincode: customer.pincode, source: 'sales_invoice' }),
        }).catch(() => {})
      }
      router.push('/console/sales')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="New Invoice"
        description={invoiceType === 'GST' ? 'Compliant with Indian GST regulations' : 'Simple invoice without GST'}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => router.push('/console/sales')} icon={<ArrowLeft className="w-4 h-4" />}>Cancel</Button>
            <Button type="submit" form="new-invoice-form" size="sm" disabled={submitting} icon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Create Invoice</Button>
          </>
        }
      />

      <form id="new-invoice-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && <div className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-control px-4 py-3">{formError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Invoice Type</h3>
            <div className="flex gap-2">
              {(['GST', 'NON_GST'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => {
                    setInvoiceType(t)
                    setItems(p => p.map(it => ({ ...it, taxPct: t === 'NON_GST' ? 0 : 18 })))
                  }}
                  className={`flex-1 py-2 rounded-control text-sm font-medium border transition ${
                    invoiceType === t ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-2 border-border hover:border-accent'
                  }`}>
                  {t === 'GST' ? 'GST Invoice' : 'Non-GST Invoice'}
                </button>
              ))}
            </div>
            {invoiceType === 'GST' && (
              <div className="flex gap-2">
                {(['INTRASTATE', 'INTERSTATE'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setSupplyType(t)}
                    className={`flex-1 py-2 rounded-control text-sm font-medium border transition ${
                      supplyType === t ? 'bg-accent text-white border-accent' : 'bg-surface text-ink-2 border-border hover:border-accent'
                    }`}>
                    {t === 'INTRASTATE' ? 'Intrastate (CGST + SGST)' : 'Interstate (IGST)'}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide mb-3">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Issue Date</label>
                <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Bill To</h3>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setBrowserSearch(''); setShowCustomerBrowser(true) }} icon={<Users className="w-3.5 h-3.5" />}>
              Browse Customers
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 relative">
              <label className={labelCls}>Company / Customer Name *</label>
              <input required value={customer.name}
                onChange={e => { setCustomer(p => ({ ...p, name: e.target.value })); setCustomerQuery(e.target.value); setSelectedCustomerId(null); setShowCustomerResults(true) }}
                onFocus={() => setShowCustomerResults(true)}
                onBlur={() => setTimeout(() => setShowCustomerResults(false), 150)}
                className={inputCls} placeholder="Acme Pvt Ltd, or search by name/phone" />
              {showCustomerResults && customerResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-control shadow-card-lg max-h-56 overflow-y-auto">
                  {customerResults.map(c => (
                    <button type="button" key={c._id} onMouseDown={() => selectCustomer(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 border-b border-border last:border-0">
                      <p className="text-ink font-medium">{c.name}</p>
                      <p className="text-ink-3 text-xs">{c.phone || '—'}{c.email ? ` · ${c.email}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {selectedCustomerId && <p className="text-[11px] text-success mt-1">Existing customer — details prefilled from directory.</p>}
            </div>
            {invoiceType === 'GST' && (
              <div>
                <label className={labelCls}>GSTIN</label>
                <input value={customer.gstin} onChange={e => setCustomer(p => ({ ...p, gstin: e.target.value.toUpperCase() }))} maxLength={15} className={`${inputCls} font-mono`} placeholder="22AAAAA0000A1Z5" />
              </div>
            )}
            <div>
              <label className={labelCls}>Phone</label>
              <input value={customer.phone}
                onChange={e => { setCustomer(p => ({ ...p, phone: e.target.value })); setCustomerQuery(e.target.value); setSelectedCustomerId(null); setShowCustomerResults(true) }}
                onFocus={() => setShowCustomerResults(true)}
                onBlur={() => setTimeout(() => setShowCustomerResults(false), 150)}
                className={inputCls} placeholder="+91 98765 43210 — search existing" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={customer.email} onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="billing@acme.com" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Billing Address</label>
              <input value={customer.address} onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))} className={inputCls} placeholder="Street" />
            </div>
            <div>
              <label className={labelCls}>Pincode</label>
              <PincodeInput
                value={customer.pincode || ''}
                onChange={(value) => setCustomer(p => ({ ...p, pincode: value }))}
                onResolved={({ state, city }) => setCustomer(p => ({ ...p, state: p.state || state, city: p.city || city }))}
                placeholder="400001"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <StateSelect value={customer.state || ''} onChange={(value) => setCustomer(p => ({ ...p, state: value, city: '' }))} className={`${inputCls} appearance-none`} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>City</label>
              <CitySelect value={customer.city || ''} state={customer.state || ''} onChange={(value) => setCustomer(p => ({ ...p, city: value }))} className={inputCls} />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">Line Items</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addItem} icon={<Plus className="w-4 h-4" />}>Add Item</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/40">
                <th className="text-left px-5 py-2 text-xs text-ink-3 font-medium">Description</th>
                <th className="text-left px-2 py-2 text-xs text-ink-3 font-medium w-24">HSN</th>
                <th className="text-center px-2 py-2 text-xs text-ink-3 font-medium w-16">Qty</th>
                <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-24">Rate</th>
                <th className="text-right px-2 py-2 text-xs text-ink-3 font-medium w-20">Tax %</th>
                <th className="text-right px-5 py-2 text-xs text-ink-3 font-medium w-28">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="px-5 py-1.5"><input required value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} className={`${inputCls} py-1.5`} placeholder="Item / service name" /></td>
                  <td className="px-2 py-1.5"><input value={item.hsnCode} onChange={e => updateItem(i, 'hsnCode', e.target.value)} className={`${inputCls} py-1.5`} /></td>
                  <td className="px-2 py-1.5"><input type="number" onFocus={e => e.target.select()} min={1} value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} className={`${inputCls} py-1.5 text-center`} /></td>
                  <td className="px-2 py-1.5"><input type="number" onFocus={e => e.target.select()} min={0} value={item.price} onChange={e => updateItem(i, 'price', Number(e.target.value))} className={`${inputCls} py-1.5 text-right`} /></td>
                  <td className="px-2 py-1.5">
                    <select value={item.taxPct} onChange={e => updateItem(i, 'taxPct', Number(e.target.value))} className={`${inputCls} py-1.5 text-right`}>
                      {GST_SLABS.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-1.5 text-right tabular text-ink font-medium text-xs">{fmt((item.qty || 0) * (item.price || 0) * (1 + (item.taxPct || 0) / 100))}</td>
                  <td className="px-2 py-1.5">{items.length > 1 && <button type="button" onClick={() => removeItem(i)} className="text-ink-3 hover:text-danger"><Trash2 className="w-4 h-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} placeholder="Any notes for this invoice" />
            </div>
            <div>
              <label className={labelCls}>Terms &amp; Conditions</label>
              <textarea rows={3} value={terms} onChange={e => setTerms(e.target.value)} className={`${inputCls} resize-none`} />
            </div>
            <div className="pt-2 border-t border-border">
              <label className={labelCls}>On this invoice</label>
              <p className="text-xs text-ink-3 mb-2">This is how the invoice footer will actually look. Click a tile to include/exclude it here; anything not yet set up in Settings shows as a placeholder you can jump straight to.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <InvoiceFooterTile
                  icon={<QrCode className="w-4 h-4" />}
                  label="UPI Payment QR"
                  configured={!!biz?.upiId}
                  preview={biz?.upiId}
                  enabled={showPaymentQr}
                  onToggle={() => setShowPaymentQr(v => !v)}
                  onSettings={() => router.push('/console/settings')}
                />
                <InvoiceFooterTile
                  icon={<Landmark className="w-4 h-4" />}
                  label="Bank Account Details"
                  configured={!!biz?.bankAccountNumber}
                  preview={biz?.bankAccountNumber ? `${biz.bankAccountName || ''} · ${biz.bankAccountNumber}`.trim() : undefined}
                  enabled={showBankDetails}
                  onToggle={() => setShowBankDetails(v => !v)}
                  onSettings={() => router.push('/console/settings')}
                />
                <InvoiceFooterTile
                  icon={<PenLine className="w-4 h-4" />}
                  label="Authorized Signature"
                  configured={!!biz?.documentSignatureUrl}
                  imagePreview={biz?.documentSignatureUrl}
                  enabled={showSignature}
                  onToggle={() => setShowSignature(v => !v)}
                  onSettings={() => router.push('/console/settings')}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-3">Subtotal</span><span className="tabular text-ink">{fmt(calc.subtotal)}</span></div>
              {invoiceType === 'GST' && supplyType === 'INTRASTATE' && (
                <>
                  <div className="flex justify-between"><span className="text-ink-3">CGST</span><span className="tabular text-ink">{fmt(calc.cgstTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-3">SGST</span><span className="tabular text-ink">{fmt(calc.sgstTotal)}</span></div>
                </>
              )}
              {invoiceType === 'GST' && supplyType === 'INTERSTATE' && (
                <div className="flex justify-between"><span className="text-ink-3">IGST</span><span className="tabular text-ink">{fmt(calc.igstTotal)}</span></div>
              )}
              {invoiceType === 'NON_GST' && (
                <div className="flex justify-between"><span className="text-ink-3">Tax</span><span className="tabular text-ink">{fmt(calc.taxTotal)}</span></div>
              )}
              <div>
                <label className={labelCls}>Discount</label>
                <input type="number" onFocus={e => e.target.select()} min={0} value={discount} onChange={e => setDiscount(Number(e.target.value))} className={inputCls} />
              </div>
              <div className="flex justify-between font-semibold text-base border-t border-border pt-2 mt-2">
                <span className="text-ink">Grand Total</span>
                <span className="tabular text-ink">{fmt(calc.grandTotal - (discount || 0))}</span>
              </div>
            </div>
          </Card>
        </div>
      </form>

      {showCustomerBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowCustomerBrowser(false)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-ink">Choose Customer</h3>
              <button onClick={() => setShowCustomerBrowser(false)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 border-b border-border flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={browserSearch} onChange={e => setBrowserSearch(e.target.value)} placeholder="Search by name, phone, or email…" className={`${inputCls} pl-9`} />
              </div>
              <Button type="button" size="sm" onClick={() => { setAddCustomerError(null); setShowAddCustomer(true) }} icon={<Plus className="w-4 h-4" />}>Add Customer</Button>
            </div>
            <div className="overflow-y-auto flex-1">
              {browserCustomers.length === 0 ? (
                <p className="px-5 py-10 text-sm text-ink-3 text-center">No customers found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border sticky top-0 bg-surface">
                      <th className="text-left px-5 py-2 text-xs text-ink-3 font-medium">Name</th>
                      <th className="text-left px-2 py-2 text-xs text-ink-3 font-medium">Phone</th>
                      <th className="text-left px-2 py-2 text-xs text-ink-3 font-medium">Email</th>
                      <th className="text-left px-5 py-2 text-xs text-ink-3 font-medium">City</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {browserCustomers.map(c => (
                      <tr key={c._id} className="hover:bg-surface-2 cursor-pointer" onClick={() => { applyCustomer(c); setShowCustomerBrowser(false) }}>
                        <td className="px-5 py-2 text-ink font-medium">{c.name}</td>
                        <td className="px-2 py-2 text-ink-2">{c.phone || '—'}</td>
                        <td className="px-2 py-2 text-ink-2">{c.email || '—'}</td>
                        <td className="px-5 py-2 text-ink-2">{c.city || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAddCustomer(false)}>
          <div className="bg-surface border border-border rounded-card shadow-card-lg w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Add Customer</h3>
              <button onClick={() => setShowAddCustomer(false)} className="text-ink-3 hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            {addCustomerError && <div className="text-xs text-danger bg-danger-soft border border-danger/20 rounded-control px-3 py-2">{addCustomerError}</div>}
            <div>
              <label className={labelCls}>Name *</label>
              <input autoFocus value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Phone</label>
                <input value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={newCustomer.email} onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input value={newCustomer.address} onChange={e => setNewCustomer(p => ({ ...p, address: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>Pincode</label>
                <PincodeInput
                  value={newCustomer.pincode}
                  onChange={(value) => setNewCustomer(p => ({ ...p, pincode: value }))}
                  onResolved={({ state, city }) => setNewCustomer(p => ({ ...p, state: p.state || state, city: p.city || city }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>State</label>
                <StateSelect value={newCustomer.state} onChange={(value) => setNewCustomer(p => ({ ...p, state: value, city: '' }))} className={`${inputCls} appearance-none`} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <CitySelect value={newCustomer.city} state={newCustomer.state} onChange={(value) => setNewCustomer(p => ({ ...p, city: value }))} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setShowAddCustomer(false)}>Cancel</Button>
              <Button size="sm" onClick={submitNewCustomer} disabled={savingCustomer} icon={savingCustomer ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>Save Customer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** One footer element (QR/Bank/Signature) rendered the way it'll actually
 * look on the printed invoice -- a real preview when configured in
 * Settings, a dashed "not set up yet" placeholder otherwise. Clicking
 * toggles inclusion on THIS invoice when configured, or jumps to Settings
 * when it isn't -- see the Sales Invoice page's own comment on why this
 * replaced a plain checkbox list. */
function InvoiceFooterTile({
  icon, label, configured, preview, imagePreview, enabled, onToggle, onSettings,
}: {
  icon: React.ReactNode
  label: string
  configured: boolean
  preview?: string
  imagePreview?: string
  enabled: boolean
  onToggle: () => void
  onSettings: () => void
}) {
  if (!configured) {
    return (
      <button
        type="button"
        onClick={onSettings}
        className="flex flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-border-strong bg-surface-2/40 px-3 py-4 text-center hover:border-accent hover:bg-surface-2 transition-colors"
      >
        <Plus className="w-4 h-4 text-ink-3" />
        <span className="text-xs text-ink-3">Add {label} in Settings</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-control border px-3 py-4 text-center transition-colors ${
        enabled ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <div className="flex items-center gap-1.5 text-ink-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
        {enabled && <Check className="w-3.5 h-3.5 text-accent" />}
      </div>
      {imagePreview ? (
        <img src={imagePreview} alt={label} className="h-8 object-contain" />
      ) : preview ? (
        <span className="text-[11px] text-ink-3 truncate max-w-full">{preview}</span>
      ) : null}
      <span className="text-[10px] text-ink-3">{enabled ? 'Included' : 'Excluded — click to include'}</span>
    </button>
  )
}
