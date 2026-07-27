/**
 * GET /api/storefront/categories — path alias for /api/categories, kept
 * under the same /api/storefront/* prefix as products/banners so a
 * storefront client (Native) has one consistent base path to point at,
 * instead of one route living outside the /storefront/ namespace for no
 * functional reason. Delegates entirely to the real implementation.
 */
export { GET } from "@/app/api/categories/route";
