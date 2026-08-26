import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router } from "expo-router";

const ITEMS: { href: string; icon: string; label: string; sub: string }[] = [
  { href: "/(app)/expenses", icon: "🧾", label: "Expenses", sub: "Log and review shop running costs" },
  { href: "/(app)/profit-loss", icon: "📈", label: "Profit & Loss", sub: "Revenue, cost, expenses for a date range" },
  { href: "/(app)/ledger", icon: "📒", label: "Ledger Book", sub: "Party-wise running balance" },
  { href: "/(app)/services", icon: "✨", label: "Services", sub: "Your plan and what upgrading unlocks" },
  { href: "/(app)/profile", icon: "👤", label: "Profile", sub: "Your account, history, sign out" },
];

export default function MoreScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>More</Text>
      {ITEMS.map((item) => (
        <TouchableOpacity key={item.href} style={styles.row} onPress={() => router.push(item.href as any)}>
          <Text style={styles.icon}>{item.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={styles.sub}>{item.sub}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#16161F", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#26263A" },
  icon: { fontSize: 22 },
  label: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sub: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  arrow: { color: "#6B6B80", fontSize: 20 },
});
