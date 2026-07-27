import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useRegionTheme } from "../../src/context/RegionThemeContext";

// Provider mode home -- job queue per mobile-app-ia.md. Job data
// (GET /api/crm/jobsheets, assigned-to-me filter) not wired yet; stub
// establishes the route + theme rendering.
export default function ProviderHome() {
  const { theme } = useRegionTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.palette.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: theme.palette.primary }]}>Job Queue</Text>
      <View style={[styles.card, { borderColor: theme.palette.accent }]}>
        <Text style={styles.cardTitle}>No jobs yet</Text>
        <Text style={styles.cardBody}>
          Incoming matched requests and active jobs will appear here (next build phase).
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
