/**
 * AN SDK — core HTTP client (React Native port)
 * ---------------------------------------------------------------
 * Ported from Native's lib/an-sdk/client.ts (the web storefront's API
 * client) so both apps stay behaviorally consistent against the same
 * ANgroup backend. Two things had to change for React Native:
 *
 * 1. Token storage: web used localStorage; RN has no such thing. Uses
 *    expo-secure-store (Keychain on iOS, Keystore on Android) instead of
 *    AsyncStorage specifically because this holds an auth bearer token,
 *    not disposable UI state.
 * 2. Auth transport: ANgroup's login route sets BOTH an httpOnly cookie
 *    and returns a bearer token in the JSON body. The web client relies on
 *    the cookie (credentials:"include") as a fallback; RN's fetch has no
 *    cookie jar at all, so this client is Bearer-token-only — the cookie
 *    ANgroup also sets is simply never used here, which is fine since the
 *    token covers every authenticated route.
 */
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const AN_API = (Constants.expoConfig?.extra?.anApiUrl as string) || "";
const AN_BUSINESS_ID = (Constants.expoConfig?.extra?.anBusinessId as string) || "";

const TOKEN_KEY = "an_token";

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function anFetch(endpoint: string, options: RequestInit = {}) {
  let url = endpoint.startsWith("http") ? endpoint : `${AN_API}${endpoint}`;

  if (AN_BUSINESS_ID && !endpoint.startsWith("http")) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}businessId=${encodeURIComponent(AN_BUSINESS_ID)}`;
  }

  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (AN_BUSINESS_ID && !headers["x-business-id"]) {
    headers["x-business-id"] = AN_BUSINESS_ID;
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new ApiError(err?.message || "Network error — could not reach the API", 0);
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data;
}

export const anGet = (endpoint: string, options?: RequestInit) =>
  anFetch(endpoint, { ...options, method: "GET" });

export const anPost = (endpoint: string, body?: any, options?: RequestInit) =>
  anFetch(endpoint, { ...options, method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });

export const anPut = (endpoint: string, body?: any, options?: RequestInit) =>
  anFetch(endpoint, { ...options, method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined });

export const anPatch = (endpoint: string, body?: any, options?: RequestInit) =>
  anFetch(endpoint, { ...options, method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined });

export const anDelete = (endpoint: string, body?: any, options?: RequestInit) =>
  anFetch(endpoint, { ...options, method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined });
