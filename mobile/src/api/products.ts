import { anGet } from "./client";

export type ProductQuery = {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
};

function toQueryString(params: Record<string, any> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") qs.set(key, String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : "";
}

// Same normalization Native's web SDK applies: ANgroup returns each
// product's mongo id as `id`, but keeping `_id` too avoids re-deriving
// this fix in every screen that expects one shape or the other.
function normalizeProduct(p: any) {
  if (!p || typeof p !== "object") return p;
  const id = p.id || p._id;
  return { ...p, id, _id: id };
}

function normalizeProductList(payload: any) {
  if (!payload) return payload;
  const list = payload.products || payload.data;
  if (Array.isArray(list)) {
    const normalized = list.map(normalizeProduct);
    if (payload.products) return { ...payload, products: normalized };
    return { ...payload, data: normalized };
  }
  return payload;
}

export async function getProducts(query: ProductQuery = {}) {
  const data = await anGet(`/api/storefront/products${toQueryString(query)}`);
  return normalizeProductList(data);
}

export async function getProductBySlug(slug: string) {
  const data = await anGet(`/api/storefront/products/${encodeURIComponent(slug)}`);
  return data?.product ? { ...data, product: normalizeProduct(data.product) } : normalizeProduct(data);
}

export async function getRelatedProducts(slug: string, limit = 8) {
  const data = await anGet(`/api/storefront/products/${encodeURIComponent(slug)}/related${toQueryString({ limit })}`);
  return normalizeProductList(data);
}

export async function getCategories() {
  return anGet("/api/storefront/categories");
}

export async function getBanners() {
  return anGet("/api/storefront/banners");
}
