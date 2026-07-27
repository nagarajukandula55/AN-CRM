"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/Input'

interface Account {
  _id: string;
  name: string;
  type: "DISTRIBUTOR" | "RETAILER";
  contactPerson?: string;
  phone?: string;
  email?: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";
  creditLimit: number;
  creditDays: number;
  outstandingBalance: number;
  daysOverdue: number;
  isActive: boolean;
}

interface Transaction {
  _id: string;
  type: "INVOICE" | "PAYMENT" | "ADJUSTMENT";
  amount: number;
  balanceAfter: number;
  dueDate?: string | null;
  notes?: string;
  createdAt: string;
}

const EMPTY_NEW = { name: "", type: "RETAILER" as const, contactPerson: "", phone: "", creditLimit: "", creditDays: "15" };

export default function VendorCreditsPage() {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_NEW);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: accountsRes, isLoading: loading, mutate: refetchAccounts } = useSWR("/api/vendor/credit-accounts");
  const accounts: Account[] = accountsRes?.success ? accountsRes.data || [] : [];

  const { data: profileRes, mutate: refetchProfile } = useSWR("/api/vendor/profile");
  const vendorCode = profileRes?.success ? profileRes.data.vendorId || "" : "";
  const b2bEnabled = profileRes?.success ? !!profileRes.data.enableB2BOrdering : false;
  const [togglingB2b, setTogglingB2b] = useState(false);

  const [selected, setSelected] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txForm, setTxForm] = useState({ type: "INVOICE" as const, amount: "", notes: "" });
  const [txError, setTxError] = useState<string | null>(null);
  const [txSaving, setTxSaving] = useState(false);

  async function toggleB2b() {
    setTogglingB2b(true);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableB2BOrdering: !b2bEnabled }),
      });
      const data = await res.json();
      if (data.success) refetchProfile();
    } finally {
      setTogglingB2b(false);
    }
  }

  async function openAccount(acc: Account) {
    setSelected(acc);
    setTxError(null);
    const res = await fetch(`/api/vendor/credit-accounts/${acc._id}`);
    const data = await res.json();
    if (data.success) setTransactions(data.transactions || []);
  }

  async function createAccount() {
    setError(null);
    if (!newForm.name.trim()) {
      setError("Account name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vendor/credit-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newForm,
          creditLimit: Number(newForm.creditLimit) || 0,
          creditDays: Number(newForm.creditDays) || 15,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to create account");
        return;
      }
      setShowNew(false);
      setNewForm(EMPTY_NEW);
      refetchAccounts();
    } finally {
      setSaving(false);
    }
  }

  async function recordTransaction() {
    if (!selected) return;
    setTxError(null);
    const amount = Number(txForm.amount);
    if (!amount || amount <= 0) {
      setTxError("Enter an amount greater than 0.");
      return;
    }
    setTxSaving(true);
    try {
      const res = await fetch(`/api/vendor/credit-accounts/${selected._id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: txForm.type, amount, notes: txForm.notes || undefined }),
      });
      const data = await res.json();
      if (!data.success) {
        setTxError(data.message || "Failed to record transaction");
        return;
      }
      setTxForm({ type: "INVOICE", amount: "", notes: "" });
      openAccount(data.account);
      refetchAccounts();
    } finally {
      setTxSaving(false);
    }
  }

  async function decidePending(id: string, action: "APPROVE" | "REJECT") {
    await fetch(`/api/vendor/credit-accounts/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    refetchAccounts();
  }

  const pending = accounts.filter((a) => a.status === "PENDING");
  const active = accounts.filter((a) => a.status !== "PENDING");
  const totalOutstanding = active.reduce((s, a) => s + (a.outstandingBalance || 0), 0);
  const signupUrl = vendorCode ? `${typeof window !== "undefined" ? window.location.origin : ""}/b2b/${vendorCode}/signup` : "";

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Credit Accounts"
        description={`Distributors and retailers you extend credit to — sales made now, collected within ${newForm.creditDays} days by default.`}
        actions={<Button onClick={() => setShowNew(true)}>+ New Account</Button>}
      />

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">B2B Ordering Portal</p>
            <p className="text-xs text-ink-3">
              Let distributors/retailers sign up and order directly at their channel price.
            </p>
          </div>
          <Button
            variant={b2bEnabled ? 'success' : 'secondary'}
            size="sm"
            onClick={toggleB2b}
            disabled={togglingB2b}
            loading={togglingB2b}
          >
            {b2bEnabled ? "Enabled" : "Disabled — click to enable"}
          </Button>
        </div>
        {b2bEnabled && signupUrl && (
          <p className="text-xs text-ink-3">
            Share this signup link: <span className="tabular text-accent">{signupUrl}</span>
          </p>
        )}
      </Card>

      <Card className="p-3 text-sm text-ink-2">
        Total outstanding across {active.length} account{active.length === 1 ? "" : "s"}:{" "}
        <b className="text-ink tabular">₹{totalOutstanding.toLocaleString("en-IN")}</b>
      </Card>

      {pending.length > 0 && (
        <Card className="p-3 space-y-2 border-warning/20 bg-warning-soft">
          <p className="text-sm font-semibold text-warning">Pending Approval ({pending.length})</p>
          {pending.map((a) => (
            <div key={a._id} className="flex items-center justify-between text-sm bg-surface rounded-lg p-2">
              <div>
                <p className="font-medium text-ink">{a.name} <span className="text-xs text-ink-3">({a.type})</span></p>
                <p className="text-xs text-ink-3">{a.email} · {a.phone}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={() => decidePending(a._id, "APPROVE")}>Approve</Button>
                <Button size="sm" variant="danger" onClick={() => decidePending(a._id, "REJECT")}>Reject</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm bg-surface border border-border rounded-card p-5 space-y-3">
            <h2 className="h-section">New Credit Account</h2>
            {error && <p className="text-xs text-danger">{error}</p>}
            <Input placeholder="Business name *" value={newForm.name} onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))} />
            <Select value={newForm.type} onChange={(e) => setNewForm((p) => ({ ...p, type: e.target.value as any }))}>
              <option value="RETAILER">Retailer</option>
              <option value="DISTRIBUTOR">Distributor</option>
            </Select>
            <Input placeholder="Contact person" value={newForm.contactPerson} onChange={(e) => setNewForm((p) => ({ ...p, contactPerson: e.target.value }))} />
            <Input placeholder="Phone" value={newForm.phone} onChange={(e) => setNewForm((p) => ({ ...p, phone: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Credit limit ₹" value={newForm.creditLimit} onChange={(e) => setNewForm((p) => ({ ...p, creditLimit: e.target.value }))} />
              <Input type="number" placeholder="Credit days" value={newForm.creditDays} onChange={(e) => setNewForm((p) => ({ ...p, creditDays: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={createAccount} disabled={saving} loading={saving}>
                {saving ? "Saving…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg bg-surface border border-border rounded-card p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="h-section">{selected.name}</h2>
                <p className="text-xs text-ink-3">{selected.type} · Limit ₹{selected.creditLimit} · {selected.creditDays} days</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-ink-3 text-sm">✕</button>
            </div>

            <Card className="p-3 text-sm space-y-1">
              <p>Outstanding: <b className="tabular">₹{selected.outstandingBalance.toLocaleString("en-IN")}</b>
                {selected.creditLimit > 0 && selected.outstandingBalance >= selected.creditLimit && (
                  <span className="text-danger ml-2">— at/over credit limit</span>
                )}
              </p>
              {selected.daysOverdue > 0 && (
                <p className="text-danger">{selected.daysOverdue} days overdue on oldest unpaid invoice</p>
              )}
            </Card>

            <Card className="p-3 space-y-2">
              <p className="eyebrow">Record Transaction</p>
              {txError && <p className="text-xs text-danger">{txError}</p>}
              <div className="grid grid-cols-3 gap-2">
                <Select value={txForm.type} onChange={(e) => setTxForm((p) => ({ ...p, type: e.target.value as any }))}>
                  <option value="INVOICE">Invoice (credit sale)</option>
                  <option value="PAYMENT">Payment received</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </Select>
                <Input type="number" placeholder="Amount ₹" value={txForm.amount} onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value }))} />
                <Button onClick={recordTransaction} disabled={txSaving} loading={txSaving}>
                  Add
                </Button>
              </div>
              <Input placeholder="Notes (optional)" value={txForm.notes} onChange={(e) => setTxForm((p) => ({ ...p, notes: e.target.value }))} />
            </Card>

            <div>
              <p className="eyebrow mb-2">Ledger</p>
              {transactions.length === 0 ? (
                <p className="text-sm text-ink-3">No transactions yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-ink-3 border-b border-border">
                      <th className="p-1 font-medium">Date</th>
                      <th className="p-1 font-medium">Type</th>
                      <th className="p-1 font-medium">Amount</th>
                      <th className="p-1 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transactions.map((t) => (
                      <tr key={t._id}>
                        <td className="p-1 text-ink-3">{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td className="p-1 text-ink-2">{t.type}</td>
                        <td className="p-1 tabular text-ink-2">{t.type === "INVOICE" ? "+" : "-"}₹{t.amount}</td>
                        <td className="p-1 tabular text-ink">₹{t.balanceAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-3 border-b border-border">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Outstanding</th>
              <th className="p-3 font-medium">Overdue</th>
              <th className="p-3 font-medium">Limit</th>
              <th className="p-3 font-medium">Terms</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td className="p-4 text-ink-3" colSpan={7}>Loading…</td></tr>
            ) : active.length === 0 ? (
              <tr><td colSpan={7}><EmptyState kind="empty" title="No credit accounts yet" /></td></tr>
            ) : (
              active.map((a) => (
                <tr key={a._id} className="hover:bg-surface-2 transition-colors">
                  <td className="p-3 text-ink">{a.name}</td>
                  <td className="p-3 text-ink-3">{a.type}</td>
                  <td className={`p-3 tabular ${a.creditLimit > 0 && a.outstandingBalance >= a.creditLimit ? "text-danger font-medium" : "text-ink-2"}`}>
                    ₹{a.outstandingBalance.toLocaleString("en-IN")}
                  </td>
                  <td className="p-3">
                    {a.daysOverdue > 0 ? <Badge tone="danger">{a.daysOverdue}d</Badge> : <span className="text-ink-3">—</span>}
                  </td>
                  <td className="p-3 text-ink-3">{a.creditLimit ? `₹${a.creditLimit}` : "—"}</td>
                  <td className="p-3 text-ink-3">{a.creditDays} days</td>
                  <td className="p-3">
                    <button onClick={() => openAccount(a)} className="text-accent text-xs font-medium">View / Record</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
