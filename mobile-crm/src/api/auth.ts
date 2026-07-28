import { crmFetch, setToken } from "./client";

export interface CrmUser {
  id: string;
  email: string;
  name: string;
  role: string;
  homeRoute?: string | null;
  hasVendorAccess?: boolean;
  isEngineerOrCco?: boolean;
}

export async function login(emailOrUsername: string, password: string): Promise<CrmUser> {
  const isEmail = emailOrUsername.includes("@");
  const body = isEmail ? { email: emailOrUsername, password } : { username: emailOrUsername, password };
  const data = await crmFetch("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
  await setToken(data.token);
  return data.user;
}

export async function logout(): Promise<void> {
  await setToken(null);
}

export async function fetchSession(): Promise<CrmUser | null> {
  try {
    const data = await crmFetch("/api/auth/me");
    return data.user || null;
  } catch {
    return null;
  }
}
