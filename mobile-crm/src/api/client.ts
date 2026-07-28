/**
 * AN-CRM mobile API client — Bearer-token-only fetch wrapper (RN has no
 * cookie jar). AN-CRM's own /api/auth/login already returns the JWT in the
 * JSON response body AND sets it as an httpOnly cookie (see api/auth/
 * login/route.ts) — this app only ever uses the body token. middleware.ts
 * accepts `Authorization: Bearer <token>` as a fallback to the cookie for
 * exactly this reason (see its "Extract & verify JWT from cookie or Bearer
 * header" comment) — every existing web-only route works unmodified from
 * this client with zero backend changes.
 */
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const AN_CRM_API = (Constants.expoConfig?.extra?.anCrmApiUrl as string) || "";

const TOKEN_KEY = "an_crm_token";

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

export async function crmFetch(endpoint: string, options: RequestInit = {}) {
  const url = endpoint.startsWith("http") ? endpoint : `${AN_CRM_API}${endpoint}`;
  const token = await getToken();

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok || (data && data.success === false)) {
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data);
  }
  return data;
}
