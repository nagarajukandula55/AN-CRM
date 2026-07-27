"use client";

import { useEffect, useState, use } from "react";
import { Building2, Phone, Mail, MapPin, Calendar, Download, CheckCircle } from "lucide-react";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  status: string;
  customer: { name: string; email?: string; phone?: string; address?: string; gstin?: string };
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discountAmount: number;
  grandTotal: number;
  currency: string;
  notes?: string;
  terms?: string;
}

export default function PublicInvoiceView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/invoice/view/${token}`)
      .then((r) => r.json())
      .then((d) => {
        // The backing route (api/invoice/view/[invoiceNumber]/route.ts,
        // which also serves this token-based lookup) returns invoice
        // fields flat on the response object -- there is no `d.invoice`
        // key, and its item/summary field names (name/qty/rate/gstPercent,
        // summary.subtotal/cgst/sgst/igst/grandTotal) differ from this
        // page's original `InvoiceItem`/`Invoice` shape. Reading `d.invoice`
        // here always produced `undefined`, so this page showed "Invoice
        // not found" for every share link ever generated. Map the actual
        // response shape into what the rest of this component expects.
        if (d.success) {
          setInvoice({
            _id: d.invoiceNumber,
            invoiceNumber: d.invoiceNumber,
            issueDate: d.invoiceDate,
            status: d.payment?.status || "SENT",
            customer: {
              name: d.customer?.name,
              email: d.customer?.email,
              phone: d.customer?.phone,
              address: d.customer?.address,
              gstin: d.customer?.gstin,
            },
            items: (d.items || []).map((item: any) => ({
              description: item.name,
              quantity: item.qty,
              unit: "",
              unitPrice: item.rate,
              taxRate: item.gstPercent,
              taxAmount: (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0),
              total: item.total,
            })),
            subtotal: d.summary?.subtotal || 0,
            taxTotal:
              (d.summary?.cgst || 0) +
              (d.summary?.sgst || 0) +
              (d.summary?.igst || 0),
            discountAmount: d.summary?.discount || 0,
            grandTotal: d.summary?.grandTotal || 0,
            currency: "INR",
          });
        } else {
          setError(d.message || "Invoice not found");
        }
      })
      .catch(() => setError("Failed to load invoice"))
      .finally(() => setLoading(false));
  }, [token]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

  const printPage = () => window.print();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">Loading invoice…</div></div>;
  if (error || !invoice) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-red-500">{error || "Invoice not found"}</div></div>;

  const statusColors: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-600",
    SENT: "bg-blue-100 text-blue-700",
    PAID: "bg-green-100 text-green-700",
    OVERDUE: "bg-red-100 text-red-700",
    CANCELLED: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 print:bg-white print:py-0">
      {/* Print button — hidden on print */}
      <div className="max-w-3xl mx-auto mb-4 flex justify-end gap-2 print:hidden">
        <button
          onClick={printPage}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800"
        >
          <Download size={15} />
          Download / Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 print:shadow-none print:border-none">
        {/* Header */}
        <div className="p-8 border-b border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={20} className="text-gray-400" />
                <span className="text-sm text-gray-500 font-medium">AN Group</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
              <div className="mt-2 flex items-center gap-3">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[invoice.status] || "bg-gray-100 text-gray-600"}`}>
                  {invoice.status}
                </span>
                {invoice.status === "PAID" && <CheckCircle size={16} className="text-green-500" />}
              </div>
            </div>
            <div className="text-right text-sm text-gray-500 space-y-1">
              <div className="flex items-center gap-1.5 justify-end">
                <Calendar size={13} />
                <span>Issued: {new Date(invoice.issueDate).toLocaleDateString("en-IN")}</span>
              </div>
              {invoice.dueDate && (
                <div className="flex items-center gap-1.5 justify-end">
                  <Calendar size={13} className="text-orange-400" />
                  <span>Due: {new Date(invoice.dueDate).toLocaleDateString("en-IN")}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bill To */}
        <div className="p-8 border-b border-gray-100">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Bill To</p>
          <h2 className="text-lg font-semibold text-gray-900">{invoice.customer.name}</h2>
          {invoice.customer.gstin && <p className="text-sm text-gray-500 mt-0.5">GSTIN: {invoice.customer.gstin}</p>}
          {invoice.customer.address && (
            <p className="text-sm text-gray-500 mt-1 flex items-start gap-1.5">
              <MapPin size={13} className="mt-0.5 shrink-0" />{invoice.customer.address}
            </p>
          )}
          {invoice.customer.email && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              <Mail size={13} />{invoice.customer.email}
            </p>
          )}
          {invoice.customer.phone && (
            <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              <Phone size={13} />{invoice.customer.phone}
            </p>
          )}
        </div>

        {/* Line Items */}
        <div className="p-8 border-b border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-3 text-gray-400 font-medium">Description</th>
                <th className="text-right pb-3 text-gray-400 font-medium w-16">Qty</th>
                <th className="text-right pb-3 text-gray-400 font-medium w-24">Unit Price</th>
                <th className="text-right pb-3 text-gray-400 font-medium w-16">GST%</th>
                <th className="text-right pb-3 text-gray-400 font-medium w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.items.map((item, i) => (
                <tr key={i}>
                  <td className="py-3 text-gray-800">
                    {item.description}
                    <span className="text-gray-400 text-xs ml-1">({item.unit})</span>
                  </td>
                  <td className="py-3 text-right text-gray-600">{item.quantity}</td>
                  <td className="py-3 text-right text-gray-600">{fmt(item.unitPrice)}</td>
                  <td className="py-3 text-right text-gray-500 text-xs">{item.taxRate}%</td>
                  <td className="py-3 text-right font-medium text-gray-900">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-8 border-b border-gray-100">
          <div className="ml-auto w-72 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{fmt(invoice.subtotal)}</span>
            </div>
            {invoice.taxTotal > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>GST</span>
                <span>{fmt(invoice.taxTotal)}</span>
              </div>
            )}
            {invoice.discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>−{fmt(invoice.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
              <span>Total</span>
              <span>{fmt(invoice.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        {(invoice.notes || invoice.terms) && (
          <div className="p-8 grid grid-cols-2 gap-8 text-sm text-gray-500">
            {invoice.notes && (
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Notes</p>
                <p className="whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Terms</p>
                <p className="whitespace-pre-line">{invoice.terms}</p>
              </div>
            )}
          </div>
        )}

        <div className="px-8 py-4 bg-gray-50 rounded-b-2xl text-center text-xs text-gray-400 print:bg-white">
          This invoice was generated by AN Group ERP. For questions, contact us directly.
        </div>
      </div>
    </div>
  );
}
