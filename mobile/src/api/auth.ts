import Constants from "expo-constants";
import { anGet, anPost, setToken, getToken } from "./client";

const AN_BUSINESS_ID = (Constants.expoConfig?.extra?.anBusinessId as string) || "";

export async function login(identifier: string, password: string) {
  const data = await anPost("/api/auth/login", {
    email: identifier,
    username: identifier,
    password,
  });
  if (data?.token) await setToken(data.token);
  return data;
}

export async function signup(payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  businessId?: string;
  accountType?: "RETAIL" | "BUSINESS";
  businessName?: string;
  gstNumber?: string;
}) {
  const body = { businessId: AN_BUSINESS_ID, ...payload };
  const data = await anPost("/api/auth/register", body);
  if (data?.token) await setToken(data.token);
  return data;
}

export async function logout() {
  await setToken(null);
  anPost("/api/auth/logout").catch(() => {});
}

export async function isLoggedIn() {
  return !!(await getToken());
}

export async function getMe() {
  if (!(await getToken())) return null;
  try {
    const data = await anGet("/api/auth/me");
    return data?.user || null;
  } catch {
    return null;
  }
}

export async function requestPasswordReset(email: string) {
  return anPost("/api/auth/reset-password/request", { email });
}

export async function confirmPasswordReset(payload: { token: string; password: string }) {
  return anPost("/api/auth/reset-password", payload);
}
