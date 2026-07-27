"use client";

import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'

interface OrderItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Order {
  _id: string;
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
  paymentMode: "CREDIT" | "PAY_ON_DELIVERY";
  status: "PENDING" | "CONFIRMED" | "FULFILLED" | "CANCELLED";
  createdAt: string;
  account: { name: string; type: string } | null;
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
const STATUS_TONE: Record<string, Tone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  FULFILLED: "success",
  CANCELLED: "neutral",
};

export default function VendorB2BOrdersPage() {
  const [updating, setUpdating] = useState<string | null>(null);

  const { data: ordersRes, isLoading: loading, mutate: refetchOrders } = useSWR("/api/vendor/b2b-orders");
  const orders: Order[] = ordersRes?.success ? ordersRes.data || [] : [];

  async function setStatus(id: string, status: string) {
    setUpdating(id);
    try {
      await fetch(`/api/vendor/b2b-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      refetchOrders();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="B2B Orders" description="Orders placed by your Distributor/Retailer accounts." />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-3 border-b border-border">
              <th className="p-3 font-medium">Order #</th>
              <th className="p-3 font-medium">Account</th>
              <th className="p-3 font-medium">Items</th>
              <th className="p-3 font-medium">Total</th>
              <th className="p-3 font-medium">Payment</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td className="p-4 text-ink-3" colSpan={7}>Loading…</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={7}><EmptyState kind="empty" title="No B2B orders yet" /></td></tr>
            ) : (
              orders.map((o) => (
                <tr key={o._id} className="align-top hover:bg-surface-2 transition-colors">
                  <td className="p-3 tabular text-xs text-ink-3">{o.orderNumber}</td>
                  <td className="p-3">
                    <p className="text-ink">{o.account?.name || "—"}</p>
                    <p className="text-xs text-ink-3">{o.account?.type}</p>
                  </td>
                  <td className="p-3 text-xs text-ink-3">
                    {o.items.map((it, i) => (
                      <p key={i}>{it.quantity} × {it.productName}</p>
                    ))}
                  </td>
                  <td className="p-3 tabular text-ink-2">₹{o.totalAmount.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-ink-3">{o.paymentMode === "CREDIT" ? "Credit" : "Pay on Delivery"}</td>
                  <td className="p-3">
                    <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {o.status === "PENDING" && (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(o._id, "CONFIRMED")} disabled={updating === o._id}>Confirm</Button>
                      )}
                      {o.status === "CONFIRMED" && (
                        <Button size="sm" variant="success" onClick={() => setStatus(o._id, "FULFILLED")} disabled={updating === o._id}>Fulfill</Button>
                      )}
                      {(o.status === "PENDING" || o.status === "CONFIRMED") && (
                        <Button size="sm" variant="danger" onClick={() => setStatus(o._id, "CANCELLED")} disabled={updating === o._id}>Cancel</Button>
                      )}
                    </div>
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
