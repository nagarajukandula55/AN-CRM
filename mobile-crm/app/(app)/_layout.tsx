import { Redirect, Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";

const ACCENT = "#5B3DF5";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{symbol}</Text>;
}

/**
 * SC (Service Center) is the only operating mode the backend supports now
 * -- Brand and POS were removed, so every tab below is always visible.
 * (Previously this branched on a subscription "mode" field that no longer
 * exists; see src/context/SubscriptionContext.tsx.)
 */
export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0B0B14" },
        headerTintColor: "#fff",
        tabBarStyle: { backgroundColor: "#0B0B14", borderTopColor: "#26263A" },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: "#6B6B80",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ focused }) => <TabIcon symbol="🏠" focused={focused} /> }} />
      <Tabs.Screen name="workorders/index" options={{ title: "Workorders", tabBarIcon: ({ focused }) => <TabIcon symbol="🛠️" focused={focused} /> }} />
      <Tabs.Screen name="catalog" options={{ title: "Catalog", tabBarIcon: ({ focused }) => <TabIcon symbol="📦" focused={focused} /> }} />
      <Tabs.Screen name="ledger" options={{ title: "Ledger", tabBarIcon: ({ focused }) => <TabIcon symbol="📒" focused={focused} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ focused }) => <TabIcon symbol="⋯" focused={focused} /> }} />
      <Tabs.Screen name="services" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="expenses" options={{ href: null }} />
      <Tabs.Screen name="profit-loss" options={{ href: null }} />
      <Tabs.Screen name="ledger/[key]" options={{ href: null }} />
      <Tabs.Screen name="workorders/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="workorders/[id]/repair" options={{ href: null }} />
    </Tabs>
  );
}
