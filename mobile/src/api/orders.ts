import { anGet, anPost } from "./client";
import { getMe } from "./auth";

/**
 * Ported from Native's lib/an-sdk/orders.ts — same endpoint contracts,
 * same "no customer-scoped list" workaround (see getMyOrders below).
 */
export async function createOrder(payload: any) {
  return anPost("/api/orders/create", payload);
}

export async function getOrderById(orderId: string) {
  return anGet(`/api/orders/get-by-id?orderId=${encodeURIComponent(orderId)}`);
}

async function getOrders() {
  return anGet("/api/orders/list");
}

/**
 * ANgroup has no customer-scoped "my orders" endpoint — /api/orders/list
 * returns every order with no auth filtering. Fetches the full list and
 * filters client-side to the logged-in user's own orders, same workaround
 * Native's web SDK uses (see orders.ts there for the full explanation).
 */
export async function getMyOrders() {
  const [data, me] = await Promise.all([getOrders(), getMe()]);
  const all = data?.orders || [];
  if (!me) return { success: data?.success, orders: [] };

  const mine = all.filter((o: any) => {
    if (me.id && (o.userId === me.id || o.customerId === me.id)) return true;
    if (me.email && (o.customer?.email === me.email || o.email === me.email)) return true;
    return false;
  });

  return { success: data?.success, orders: mine };
}

export async function getTimeline(orderId: string) {
  return anGet(`/api/orders/timeline/${orderId}`);
}
