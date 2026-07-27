import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <CartProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerTitleAlign: "center" }}>
          <Stack.Screen name="index" options={{ title: "AN Group" }} />
          <Stack.Screen name="login" options={{ title: "Sign In" }} />
          <Stack.Screen name="signup" options={{ title: "Create Account" }} />
          <Stack.Screen name="product/[slug]" options={{ title: "Product" }} />
          <Stack.Screen name="cart" options={{ title: "Cart" }} />
          <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
          <Stack.Screen name="orders/index" options={{ title: "My Orders" }} />
          <Stack.Screen name="orders/[id]" options={{ title: "Order Details" }} />
          <Stack.Screen name="wishlist" options={{ title: "Wishlist" }} />
          <Stack.Screen name="profile" options={{ title: "My Profile" }} />
        </Stack>
      </CartProvider>
    </AuthProvider>
  );
}
