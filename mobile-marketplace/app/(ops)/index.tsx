import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useRegionTheme } from "../../src/context/RegionThemeContext";

// Ops mode home -- call/lead queue, full parity with web admin/crm per
// mobile-app-ia.md. Data wiring is next build phase; stub establishes the
// route + theme rendering.
export default function OpsHome() {
  const { theme } = useRegionTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.palette.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: theme.palette.primary }]}>Ops Dashboard</Text>
      <View style={[styles.card, { borderColor: theme.palette.accent }]}>
        <Text style={styles.cardTitle}>Call queue</Text>
        <Text style={styles.cardBody}>
          Triage, matching confirmation, region toggle grid, and revenue
          dashboard land here (next build phase) — full parity with the
          existing web admin/crm console.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  title: { fontSize: 24, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardBody: { fontSize: 13, color: "#6B7280", marginTop: 4 },
});
