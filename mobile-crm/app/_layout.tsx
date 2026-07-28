import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/context/AuthContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="(app)" />
          </Stack>
        </SubscriptionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
