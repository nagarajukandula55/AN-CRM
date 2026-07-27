import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useRegionTheme } from "../../src/context/RegionThemeContext";

// Customer mode home -- category grid per mobile-app-ia.md. Category data
// (GET /api/service-categories, region-filtered) not wired yet; this stub
// establishes the route + theme rendering so the shell is real and testable.
export default function CustomerHome() {
  const { theme, region } = useRegionTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.palette.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.greeting, { color: theme.palette.primary }]}>
        {theme.greetingTemplates.morning}
      </Text>
      <Text style={styles.subtitle}>
        {region ? `Serving ${region.stateName}` : "Resolving your region..."}
      </Text>
      <View style={[styles.card, { borderColor: theme.palette.accent }]}>
        <Text style={styles.cardTitle}>Book a service</Text>
        <Text style={styles.cardBody}>Category grid goes here (next build phase).</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  greeting: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#6B7280" },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardBody: { fontSize: 13, color: "#6B7280", marginTop: 4 },
});
