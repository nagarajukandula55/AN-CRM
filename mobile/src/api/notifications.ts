import { anPost, anDelete } from "./client";

export async function registerDevice(token: string, platform: "ios" | "android") {
  return anPost("/api/devices/register", { token, platform });
}

export async function unregisterDevice(token: string) {
  return anDelete("/api/devices/register", { token });
}
