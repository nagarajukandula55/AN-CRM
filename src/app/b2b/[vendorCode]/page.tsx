"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Product {
  _id: string;
  name: string;
  vendorSku?: string;
  unit: string;
  minimumOrderQty: number;
  price: number;
}

interface Me {
  account: { name: string; type: string; outstandingBalance: number; creditLimit: number; daysOverdue: number };
  vendor: { companyName: string };
}

export default function B2BCatalogPage({ params }: { params: Promise<{ vendorCode: string }> }) {
  const { vendorCode } = usePromise(params);
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<"CREDIT" | "PAY_ON_DELIVERY">("PAY_ON_DELIVERY");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/b2b/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          router.push(`/b2b/${vendorCode}/login`);
          return;
        }
        setMe(d);
      });
  }, [vendorCode, router]);

  useEffect(() => {
    if (!me) return;
    fetch(`/api/b2b/${vendorCode}/catalog`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setProducts(d.data || []);
      })
      .finally(() => setLoading(false));
  }, [me, vendorCode]);

  async function logout() {
    await fetch("/api/b2b/logout", { method: "POST" });
    router.push(`/b2b/${vendorCode}/login`);
  }

  function setQty(id: string, qty: number) {
    setCart((p) => ({ ...p, [id]: qty }));
  }

  const cartItems = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ product: products.find((p) => p._id === id)!, qty }))
    .filter((i) => i.product);
  const cartTotal = cartItems.reduce((s, i) => s + i.product.price * i.qty, 0);

  async function placeOrder() {
    setError(null);
    if (!cartItems.length) return;
    setPlacing(true);
    try {
      const res = await fetch("/api/b2b/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((i) => ({ productId: i.product._id, quantity: i.qty })),
          paymentMode,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to place order");
        return;
      }
      setPlaced(data.order.orderNumber);
      setCart({});
    } finally {
      setPlacing(false);
    }
  }

  if (!me) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{me.vendor.companyName}</p>
          <p className="text-xs text-gray-500">{me.account.name} ({me.account.type})</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/b2b/${vendorCode}/orders`} className="text-violet-600">My Orders</Link>
          <button onClick={logout} className="text-gray-400">Logout</button>
        </div>
      </header>

      {me.account.daysOverdue > 0 && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm p-2 text-center">
          {me.account.daysOverdue} days overdue on an unpaid invoice — settle before placing a new credit order.
        </div>
      )}

      <div className="p-4 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <h2 className="font-medium text-gray-900">Catalog</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-gray-400">No products available yet.</p>
          ) : (
            products.map((p) => (
              <div key={p._id} className="bg-white border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-500">₹{p.price}/{p.unit} · MOQ {p.minimumOrderQty}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  className="w-20 border rounded p-1.5 text-sm"
                  placeholder="Qty"
                  value={cart[p._id] || ""}
                  onChange={(e) => setQty(p._id, Number(e.target.value))}
                />
              </div>
            ))
          )}
        </div>

        <div className="bg-white border rounded-lg p-4 space-y-3 h-fit">
          <h2 className="font-medium text-gray-900">Cart</h2>
          {placed && <p className="text-sm text-emerald-600">Order {placed} placed!</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {cartItems.length === 0 ? (
            <p className="text-sm text-gray-400">Empty.</p>
          ) : (
            <>
              {cartItems.map((i) => (
                <div key={i.product._id} className="flex justify-between text-sm">
                  <span>{i.qty} × {i.product.name}</span>
                  <span>₹{(i.product.price * i.qty).toLocaleString("en-IN")}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-gray-900 border-t pt-2">
                <span>Total</span>
                <span>₹{cartTotal.toLocaleString("en-IN")}</span>
              </div>
              <select className="w-full border rounded-lg p-2 text-sm" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)}>
                <option value="PAY_ON_DELIVERY">Pay on Delivery / Offline</option>
                <option value="CREDIT">Credit (₹{me.account.creditLimit - me.account.outstandingBalance} available)</option>
              </select>
              <button onClick={placeOrder} disabled={placing} className="w-full py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-50">
                {placing ? "Placing…" : "Place Order"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
