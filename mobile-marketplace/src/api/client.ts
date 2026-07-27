/**
 * Thin fetch wrapper for ServiceFlow's mobile app -- same pattern as
 * mobile/src/api/client.ts: Bearer-token-only (no cookie fallback, RN
 * fetch has no cookie jar), token read from expo-secure-store.
 */
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const API_BASE_URL = (Constants.expoConfig?.extra?.anApiUrl as string) || "";
const TOKEN_KEY = "serviceflow_auth_token";

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} failed: ${res.status} ${body}`);
  }

  return res.json() as Promise<T>;
}
