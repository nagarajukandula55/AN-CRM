import { useEffect } from "react";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "@/context/AuthContext";

const ACCENT = "#5B3DF5";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{symbol}</Text>;
}

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
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
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ focused }) => <TabIcon symbol="🏠" focused={focused} /> }} />
      <Tabs.Screen name="workorders/index" options={{ title: "Workorders", tabBarIcon: ({ focused }) => <TabIcon symbol="🛠️" focused={focused} /> }} />
      <Tabs.Screen name="pos" options={{ title: "POS", tabBarIcon: ({ focused }) => <TabIcon symbol="🧾" focused={focused} /> }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: ({ focused }) => <TabIcon symbol="💳" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ focused }) => <TabIcon symbol="👤" focused={focused} /> }} />
      <Tabs.Screen name="workorders/[id]" options={{ href: null }} />
    </Tabs>
  );
}
