import { Redirect, Tabs } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";

const ACCENT = "#5B3DF5";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{symbol}</Text>;
}

/**
 * Which tabs a given operating mode sees is exactly the same rule the web
 * admin's sidebar already follows (see api/ui/sidebar/route.ts's
 * scAllowedKeys allow-list) -- Calls/Workorders belong to Brand & SC,
 * POS's quick-sale belongs to POS. Mirrored here per explicit direction:
 * "based on subscription the options and menu should appear."
 */
function tabsForMode(mode: string | undefined) {
  return {
    showCalls: mode === "BRAND",
    showWorkorders: mode === "BRAND" || mode === "SC",
    showPos: mode === "POS",
  };
}

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { sub, loading: subLoading } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  const { showCalls, showWorkorders, showPos } = tabsForMode(sub?.mode);

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
      <Tabs.Screen name="calls" options={{ title: "Calls", href: showCalls ? undefined : null, tabBarIcon: ({ focused }) => <TabIcon symbol="📞" focused={focused} /> }} />
      <Tabs.Screen name="workorders/index" options={{ title: "Workorders", href: showWorkorders ? undefined : null, tabBarIcon: ({ focused }) => <TabIcon symbol="🛠️" focused={focused} /> }} />
      <Tabs.Screen name="pos" options={{ title: "POS", href: showPos ? undefined : null, tabBarIcon: ({ focused }) => <TabIcon symbol="🧾" focused={focused} /> }} />
      <Tabs.Screen name="services" options={{ title: "Services", tabBarIcon: ({ focused }) => <TabIcon symbol="✨" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ focused }) => <TabIcon symbol="👤" focused={focused} /> }} />
      <Tabs.Screen name="workorders/[id]" options={{ href: null }} />
    </Tabs>
  );
}
