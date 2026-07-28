import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { getSubscriptionStatus, type SubscriptionStatus } from "@/api/subscriptions";

const ACCENT = "#5B3DF5";

export default function PlanScreen() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSubscriptionStatus().then(setSub).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Plan & Billing</Text>
      {sub ? (
        <View style={styles.card}>
          <Text style={styles.planName}>{sub.plan} — {sub.mode}</Text>
          <Text style={[styles.status, sub.blocked && styles.statusBlocked]}>
            {sub.blocked ? "Expired" : sub.status}
          </Text>
          <Text style={styles.days}>{sub.daysRemaining} day{sub.daysRemaining === 1 ? "" : "s"} remaining</Text>
          <Text style={styles.hint}>Renewals and plan changes are managed from the AN-CRM web app's Plan & Billing page.</Text>
        </View>
      ) : (
        <Text style={styles.hint}>Couldn't load plan status.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14", padding: 20 },
  center: { flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  card: { backgroundColor: "#16161F", borderRadius: 12, padding: 18, borderWidth: 1, borderColor: "#26263A" },
  planName: { color: "#fff", fontSize: 18, fontWeight: "700" },
  status: { color: "#4ADE80", fontSize: 13, fontWeight: "600", marginTop: 6 },
  statusBlocked: { color: "#F87171" },
  days: { color: "#9A9AB0", fontSize: 13, marginTop: 4 },
  hint: { color: "#6B6B80", fontSize: 12, marginTop: 16, lineHeight: 18 },
});
