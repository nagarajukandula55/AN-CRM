"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle,
  Search,
  RefreshCw,
  ChevronDown,
  ReceiptText,
  Wallet,
  BarChart3,
  CreditCard,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { useActiveBusinessId } from "@/hooks/useActiveBusinessId";

const INR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

interface Invoice {
  _id: string;
  invoiceNumber: string;
  client: string;
  clientEmail?: string;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate?: string;
  paidDate?: string;
  createdAt: string;
}

interface Payment {
  _id: string;
  paymentNumber: string;
  type: "RECEIVED" | "MADE";
  amount: number;
  party?: string;
  method?: string;
  reference?: string;
  date: string;
  notes?: string;
}

interface InvoiceStats {
  total: number;
  paid: number;
  overdue: number;
  totalRevenue: number;
  outstanding: number;
}

interface PaymentSummary {
  received: number;
  made: number;
  net: number;
}

const STATUS_BADGE: Record<string, string> = {
  PAID: "text-emerald-400 bg-emerald-500/10",
  SENT: "text-blue-400 bg-blue-500/10",
  OVERDUE: "text-red-400 bg-red-500/10",
  DRAFT: "text-zinc-400 bg-white/[0.04]",
  CANCELLED: "text-zinc-400 bg-white/[0.04]",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

type Tab = "invoices" | "payments" | "overview";

export default function FinancePage() {
  const { businessId } = useActiveBusinessId();

  const [activeTab, setActiveTab] = useState<Tab>("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const params = new URLSearchParams();
      if (businessId) params.set("businessId", businessId);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/finance/invoices?${params}`);
      const data = await res.json();
      if (data.success) {
        setInvoices(data.invoices || []);
        setInvoiceStats(data.stats || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInvoices(false);
    }
  }, [businessId, statusFilter]);

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const params = new URLSearchParams();
      if (businessId) params.set("businessId", businessId);
      const res = await fetch(`/api/finance/payments?${params}`);
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments || []);
        setPaymentSummary(data.summary || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPayments(false);
    }
  }, [businessId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleMarkPaid = async (invoiceId: string) => {
    setMarkingPaid(invoiceId);
    try {
      const res = await fetch(`/api/finance/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID" }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchInvoices();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMarkingPaid(null);
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.client?.toLowerCase().includes(q)
    );
  });

  // Build monthly revenue breakdown from paid invoices
  const monthlyRevenue = (() => {
    const map: Record<string, number> = {};
    invoices
      .filter((i) => i.status === "PAID")
      .forEach((i) => {
        const d = new Date(i.paidDate || i.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        map[key] = (map[key] || 0) + i.totalAmount;
      });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, amount]) => {
        const [yr, mo] = month.split("-");
        const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("en-IN", {
          month: "short",
          year: "2-digit",
        });
        return { label, amount };
      });
  })();

  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map((m) => m.amount), 1);

  const totalExpenses = paymentSummary?.made ?? 0;
  const totalRevenue = invoiceStats?.totalRevenue ?? 0;
  const netProfit = totalRevenue - totalExpenses;
  const pendingReceivables = invoiceStats?.outstanding ?? 0;
  const overdueCount = invoiceStats?.overdue ?? 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "invoices", label: "Invoices", icon: <ReceiptText size={14} /> },
    { id: "payments", label: "Payments", icon: <Wallet size={14} /> },
    { id: "overview", label: "Overview", icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Finance</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Invoices, payments, and revenue overview
          </p>
        </div>
        <button
          onClick={() => {
            fetchInvoices();
            fetchPayments();
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-zinc-100"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <TrendingUp size={14} className="text-emerald-400" />
            </div>
            <span className="text-xs text-zinc-500">Total Revenue</span>
          </div>
          <p className="text-lg font-semibold text-white">{INR(totalRevenue)}</p>
          <p className="text-xs text-zinc-600 mt-0.5">from paid invoices</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <TrendingDown size={14} className="text-red-400" />
            </div>
            <span className="text-xs text-zinc-500">Total Expenses</span>
          </div>
          <p className="text-lg font-semibold text-white">{INR(totalExpenses)}</p>
          <p className="text-xs text-zinc-600 mt-0.5">payments made</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`p-1.5 rounded-lg ${
                netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
              }`}
            >
              <DollarSign
                size={14}
                className={netProfit >= 0 ? "text-emerald-400" : "text-red-400"}
              />
            </div>
            <span className="text-xs text-zinc-500">Net Profit</span>
          </div>
          <p
            className={`text-lg font-semibold ${
              netProfit >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {INR(netProfit)}
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">revenue - expenses</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <Clock size={14} className="text-amber-400" />
            </div>
            <span className="text-xs text-zinc-500">Pending Receivables</span>
          </div>
          <p className="text-lg font-semibold text-white">{INR(pendingReceivables)}</p>
          <p className="text-xs text-zinc-600 mt-0.5">unpaid invoices</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-red-500/10">
              <AlertCircle size={14} className="text-red-400" />
            </div>
            <span className="text-xs text-zinc-500">Overdue</span>
          </div>
          <p className="text-lg font-semibold text-white">{overdueCount}</p>
          <p className="text-xs text-zinc-600 mt-0.5">invoices overdue</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Invoices Tab */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                type="text"
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 pl-9 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/20"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none px-3 py-2 pr-8 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-white/20 cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="SENT">Sent</option>
                <option value="PAID">Paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
              />
            </div>
          </div>

          {loadingInvoices ? (
            <div className="p-12 text-center text-zinc-500">Loading...</div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center">
              <ReceiptText size={32} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">No invoices found</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Invoice #
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Due Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredInvoices.map((inv) => (
                    <tr
                      key={inv._id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-white">
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm text-white">{inv.client}</p>
                          {inv.clientEmail && (
                            <p className="text-xs text-zinc-500">{inv.clientEmail}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white font-medium">
                          {INR(inv.totalAmount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            STATUS_BADGE[inv.status] || STATUS_BADGE.DRAFT
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {inv.dueDate ? (
                          <span
                            className={`text-sm ${
                              inv.status !== "PAID" &&
                              new Date(inv.dueDate) < new Date()
                                ? "text-red-400"
                                : "text-zinc-400"
                            }`}
                          >
                            {new Date(inv.dueDate).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.status !== "PAID" && inv.status !== "CANCELLED" ? (
                          <button
                            onClick={() => handleMarkPaid(inv._id)}
                            disabled={markingPaid === inv._id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle size={12} />
                            {markingPaid === inv._id ? "Saving..." : "Mark Paid"}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-600">
                            {inv.status === "PAID" && inv.paidDate
                              ? `Paid ${new Date(inv.paidDate).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                })}`
                              : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          {paymentSummary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <ArrowDownLeft size={16} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Received</p>
                  <p className="text-sm font-semibold text-emerald-400">
                    {INR(paymentSummary.received)}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <ArrowUpRight size={16} className="text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Made</p>
                  <p className="text-sm font-semibold text-red-400">
                    {INR(paymentSummary.made)}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    paymentSummary.net >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                  }`}
                >
                  <CreditCard
                    size={16}
                    className={
                      paymentSummary.net >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Net</p>
                  <p
                    className={`text-sm font-semibold ${
                      paymentSummary.net >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {INR(paymentSummary.net)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loadingPayments ? (
            <div className="p-12 text-center text-zinc-500">Loading...</div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet size={32} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">No payments recorded</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Payment #
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Party
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Method
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Reference
                    </th>
                    <th className="px-4 py-3 text-left text-xs text-zinc-500 font-medium">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {payments.map((pay) => (
                    <tr
                      key={pay._id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-mono text-white">
                          {pay.paymentNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-zinc-600 shrink-0" />
                          <span className="text-sm text-white">{pay.party || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-sm font-medium ${
                            pay.type === "RECEIVED"
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {pay.type === "RECEIVED" ? "+" : "-"}
                          {INR(pay.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            pay.type === "RECEIVED"
                              ? "text-emerald-400 bg-emerald-500/10"
                              : "text-red-400 bg-red-500/10"
                          }`}
                        >
                          {pay.type === "RECEIVED" ? "Received" : "Made"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {pay.method ? (
                          <span className="text-xs text-zinc-300 font-medium px-2 py-0.5 rounded-full bg-white/[0.04]">
                            {METHOD_LABELS[pay.method] || pay.method}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-400 font-mono">
                          {pay.reference || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-400">
                          {new Date(pay.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-sm font-medium text-white mb-4">
              Monthly Revenue (Last 6 Months)
            </h2>
            {monthlyRevenue.length === 0 ? (
              <div className="py-8 text-center">
                <BarChart3 size={28} className="mx-auto text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-500">No revenue data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {monthlyRevenue.map((m) => (
                  <div key={m.label} className="flex items-center gap-4">
                    <span className="text-xs text-zinc-500 w-16 shrink-0">{m.label}</span>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-6 bg-white/[0.04] rounded-md overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/30 rounded-md transition-all duration-500"
                          style={{
                            width: `${(m.amount / maxMonthlyRevenue) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-white w-28 text-right shrink-0">
                        {INR(m.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
              <h3 className="text-sm font-medium text-white">Invoice Summary</h3>
              <div className="space-y-2">
                {[
                  {
                    label: "Total Invoices",
                    value: invoiceStats?.total ?? 0,
                  },
                  { label: "Paid", value: invoiceStats?.paid ?? 0 },
                  {
                    label: "Overdue",
                    value: invoiceStats?.overdue ?? 0,
                    className: "text-red-400",
                  },
                  {
                    label: "Total Revenue",
                    value: INR(invoiceStats?.totalRevenue ?? 0),
                    className: "text-emerald-400",
                  },
                  {
                    label: "Outstanding",
                    value: INR(invoiceStats?.outstanding ?? 0),
                    className: "text-amber-400",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center py-1.5 border-b border-white/[0.04] last:border-0"
                  >
                    <span className="text-xs text-zinc-500">{row.label}</span>
                    <span
                      className={`text-sm font-medium ${
                        row.className || "text-white"
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
              <h3 className="text-sm font-medium text-white">Payment Summary</h3>
              <div className="space-y-2">
                {[
                  { label: "Total Payments", value: payments.length },
                  {
                    label: "Received",
                    value: payments.filter((p) => p.type === "RECEIVED").length,
                  },
                  {
                    label: "Made",
                    value: payments.filter((p) => p.type === "MADE").length,
                  },
                  {
                    label: "Total Received",
                    value: INR(paymentSummary?.received ?? 0),
                    className: "text-emerald-400",
                  },
                  {
                    label: "Total Made",
                    value: INR(paymentSummary?.made ?? 0),
                    className: "text-red-400",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between items-center py-1.5 border-b border-white/[0.04] last:border-0"
                  >
                    <span className="text-xs text-zinc-500">{row.label}</span>
                    <span
                      className={`text-sm font-medium ${
                        (row as any).className || "text-white"
                      }`}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
