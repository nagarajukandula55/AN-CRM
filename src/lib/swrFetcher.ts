/**
 * Shared fetcher for every useSWR() call in the app -- one place that
 * decides how a GET is issued and how a non-2xx/non-JSON response becomes
 * an Error, instead of each page re-implementing `fetch(url).then(r =>
 * r.json())` slightly differently. Throwing on !ok (rather than silently
 * returning the parsed error body) is what lets SWR's own `error` return
 * value work as callers expect.
 */
export async function swrFetcher<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}
