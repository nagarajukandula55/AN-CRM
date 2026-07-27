"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Order {
  _id: string;
  orderNumber: string;
  items: { productName: string; quantity: number; lineTotal: number }[];
  totalAmount: number;
  paymentMode: string;
  status: string;
  createdAt: string;
}

export default function B2BOrdersPage({ params }: { params: Promise<{ vendorCode: string }> }) {
  const { vendorCode } = usePromise(params);
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/b2b/orders")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          router.push(`/b2b/${vendorCode}/login`);
          return;
        }
        setOrders(d.data || []);
      })
      .finally(() => setLoading(false));
  }, [vendorCode, router]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">My Orders</h1>
          <Link href={`/b2b/${vendorCode}`} className="text-violet-600 text-sm">← Back to Catalog</Link>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet.</p>
        ) : (
          orders.map((o) => (
            <div key={o._id} className="bg-white border rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="font-mono text-gray-500">{o.orderNumber}</span>
                <span className="text-gray-500">{new Date(o.createdAt).toLocaleDateString()}</span>
              </div>
              {o.items.map((it, i) => (
                <p key={i} className="text-sm text-gray-700">{it.quantity} × {it.productName} — ₹{it.lineTotal}</p>
              ))}
              <div className="flex justify-between text-sm font-medium pt-1 border-t mt-1">
                <span>{o.status} · {o.paymentMode === "CREDIT" ? "Credit" : "Pay on Delivery"}</span>
                <span>₹{o.totalAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
