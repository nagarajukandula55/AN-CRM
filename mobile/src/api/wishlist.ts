import Constants from "expo-constants";
import { anGet, anPost, anDelete } from "./client";

const AN_BUSINESS_ID = (Constants.expoConfig?.extra?.anBusinessId as string) || "";

export async function getServerWishlist(): Promise<{ id: string; name: string; slug: string; price: number }[]> {
  const data = await anGet("/api/wishlist");
  return data?.products || [];
}

export async function addServerWishlistItem(productId: string) {
  return anPost("/api/wishlist", { businessId: AN_BUSINESS_ID, productId });
}

export async function removeServerWishlistItem(productId: string) {
  return anDelete("/api/wishlist", { businessId: AN_BUSINESS_ID, productId });
}
