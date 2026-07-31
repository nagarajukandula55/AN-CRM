'use client'
import { useState, useMemo } from 'react'
import { Plus, Trash2, ShoppingCart, IndianRupee, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Input'
import { GST_SLABS } from '@/core/gst/gstSlabs'
import { Badge } from '@/components/ui/Badge'

/**
 * POS quick-sale screen -- billing pattern modeled on standard small-
 * business GST billing apps (myBillBook et al.): party details, a
 * line-item cart, running GST-split totals, payment collected at the
 * point of sale, one submit creates the invoice. Backed by
 * /api/pos/invoices, which reuses the same GST-split computation the CRM
 * close flow already uses -- see that route's top comment.
 */

interface CartItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  hsnCode: string
}

const emptyItem = (): CartItem => ({ description: '', quantity: 1, unitPrice: 0, taxRate: 18, hsnCode: '' })

const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER']

export default function PosPage() {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [company, setCompany] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [items, setItems] = useState<CartItem[]>([emptyItem()])
  const [discountAmount, setDiscountAmount] = useState(0)
  const [paymentMode, setPaymentMode] = useState('CASH')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNumber: string; grandTotal: number } | null>(null)

  const totals = useMemo(() => {
    let subtotal = 0
    let tax = 0
    for (const item of items) {
      const lineAmt = (item.quantity || 0) * (item.unitPrice || 0)
      subtotal += lineAmt
      tax += lineAmt * ((item.taxRate || 0) / 100)
    }
    const grandTotal = subtotal + tax - (discountAmount || 0)
    return { subtotal, tax, grandTotal: Math.max(0, grandTotal) }
  }, [items, discountAmount])

  function updateItem(index: number, patch: Partial<CartItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  async function handleSubmit() {
    setError('')
    if (!customerName.trim()) {
      setError('Customer name is required')
      return
    }
    const validItems = items.filter((it) => it.description.trim() && it.quantity > 0)
    if (validItems.length === 0) {
      setError('Add at least one item with a description and quantity')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/pos/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer: { name: customerName, phone: customerPhone, company, gstNumber },
          items: validItems,
          discountAmount,
          paymentMode,
          amountPaid: totals.grandTotal,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setLastInvoice({ invoiceNumber: data.invoice.invoiceNumber, grandTotal: data.invoice.grandTotal })
        setCustomerName('')
        setCustomerPhone('')
        setCompany('')
        setGstNumber('')
        setItems([emptyItem()])
        setDiscountAmount(0)
      } else {
        setError(data.message || 'Failed to create invoice')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-ink p-6">
      <PageHeader
        title="Point of Sale"
        description="Quick-sale billing — add items, collect payment, generate a GST invoice in one step."
      />

      {lastInvoice && (
        <div className="mb-4 flex items-center gap-2 rounded-control border border-success bg-success-soft px-4 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Invoice <span className="tabular font-medium">{lastInvoice.invoiceNumber}</span> created — ₹{lastInvoice.grandTotal.toLocaleString('en-IN')}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-control border border-danger bg-danger-soft px-4 py-3 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="h-section">Customer</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Name *">
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" />
                </Field>
                <Field label="Phone">
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="98765 43210" />
                </Field>
                <Field label="Company (B2B, optional)">
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Leave blank for B2C" />
                </Field>
                <Field label="GSTIN (B2B, optional)">
                  <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} placeholder="22AAAAA0000A1Z5" />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-section flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Items</div>
                <Button variant="secondary" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add Item</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-ink-3 text-left border-b border-border">
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 px-2 w-20">Qty</th>
                      <th className="py-2 px-2 w-28">Rate</th>
                      <th className="py-2 px-2 w-20">Tax %</th>
                      <th className="py-2 px-2 w-28">HSN</th>
                      <th className="py-2 px-2 w-28 tabular">Total</th>
                      <th className="py-2 pl-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const lineTotal = (item.quantity || 0) * (item.unitPrice || 0) * (1 + (item.taxRate || 0) / 100)
                      return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1.5 pr-2">
                            <Input value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Item / service" />
                          </td>
                          <td className="py-1.5 px-2">
                            <Input type="number" onFocus={e => e.target.select()} value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                          </td>
                          <td className="py-1.5 px-2">
                            <Input type="number" onFocus={e => e.target.select()} value={item.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} />
                          </td>
                          <td className="py-1.5 px-2">
                            <Select value={item.taxRate} onChange={(e) => updateItem(i, { taxRate: Number(e.target.value) })}>
                              {GST_SLABS.map(rate => <option key={rate} value={rate}>{rate}%</option>)}
                            </Select>
                          </td>
                          <td className="py-1.5 px-2">
                            <Input value={item.hsnCode} onChange={(e) => updateItem(i, { hsnCode: e.target.value })} />
                          </td>
                          <td className="py-1.5 px-2 tabular">₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="py-1.5 pl-2">
                            <button onClick={() => removeItem(i)} className="text-danger hover:opacity-70">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3">
              <div className="h-section">Summary</div>
              <div className="flex justify-between text-sm"><span className="text-ink-2">Subtotal</span><span className="tabular">₹{totals.subtotal.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm"><span className="text-ink-2">Tax</span><span className="tabular">₹{totals.tax.toLocaleString('en-IN')}</span></div>
              <Field label="Discount">
                <Input type="number" onFocus={e => e.target.select()} value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
              </Field>
              <div className="flex justify-between text-base font-medium border-t border-border pt-2">
                <span>Grand Total</span>
                <span className="tabular flex items-center"><IndianRupee className="h-4 w-4" />{totals.grandTotal.toLocaleString('en-IN')}</span>
              </div>
              <Field label="Payment Mode">
                <Select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </Select>
              </Field>
              <Button className="w-full" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : 'Complete Sale'}
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
