import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as auth from "@/api/auth";
import { registerDevice } from "@/api/notifications";

/**
 * Best-effort: registers this device's Expo push token against
 * /api/devices/register once signed in, so the vendor-order-notification
 * and billing-revision-shared pushes (see backend notification.service.ts)
 * actually reach this device. Never blocks or fails sign-in — a user with
 * notifications denied, or on a simulator with no push capability, should
 * still be able to use the app.
 */
async function registerPushToken() {
  try {
    const Device = await import("expo-device");
    if (!Device.isDevice) return;

    const Notifications = await import("expo-notifications");
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await registerDevice(expoToken, Platform.OS === "ios" ? "ios" : "android");
  } catch {
    /* best-effort — push registration must never break sign-in */
  }
}

interface AuthContextValue {
  user: any | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const me = await auth.getMe();
    setUser(me);
    if (me) registerPushToken();
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function login(identifier: string, password: string) {
    await auth.login(identifier, password);
    await refresh();
  }

  async function logout() {
    await auth.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used within an <AuthProvider>");
  return ctx;
}
