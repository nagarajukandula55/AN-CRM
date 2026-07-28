import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { listJobSheets, type JobSheet } from "@/api/crm";

const ACCENT = "#5B3DF5";

export default function DashboardScreen() {
  const { user } = useAuth();
  const { sub } = useSubscription();
  const [openJobs, setOpenJobs] = useState<JobSheet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const jobs = await listJobSheets().catch(() => []);
      setOpenJobs(jobs.filter((j) => !["CLOSED", "CANCELLED"].includes(j.status)).slice(0, 5));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isPos = sub?.mode === "POS";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0] || "there"} 👋</Text>
      <Text style={styles.sub}>{sub?.mode ? `${sub.mode} · ${sub.plan} plan` : "Loading your plan…"}</Text>

      {sub?.blocked && (
        <TouchableOpacity style={styles.warnCard} onPress={() => router.push("/(app)/services")}>
          <Text style={styles.warnText}>Your subscription has expired. Tap to renew and restore access.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.cardsRow}>
        {!isPos && (
          <TouchableOpacity style={styles.card} onPress={() => router.push("/(app)/workorders")}>
            <Text style={styles.cardValue}>{openJobs.length}</Text>
            <Text style={styles.cardLabel}>Open Workorders</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.card} onPress={() => router.push(isPos ? "/(app)/pos" : "/(app)/calls")}>
          <Text style={styles.cardValue}>{isPos ? "🧾" : "📞"}</Text>
          <Text style={styles.cardLabel}>{isPos ? "New Sale" : "New Call"}</Text>
        </TouchableOpacity>
      </View>

      {!isPos && (
        <>
          <Text style={styles.sectionTitle}>Recent Workorders</Text>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ marginTop: 20 }} />
          ) : openJobs.length === 0 ? (
            <Text style={styles.empty}>No open workorders right now.</Text>
          ) : (
            openJobs.map((j) => (
              <TouchableOpacity key={j._id} style={styles.jobRow} onPress={() => router.push(`/(app)/workorders/${j._id}`)}>
                <View>
                  <Text style={styles.jobNumber}>{j.jobSheetNumber}</Text>
                  <Text style={styles.jobMeta}>{j.customerName || "—"} · {j.product || ""}</Text>
                </View>
                <Text style={styles.jobStatus}>{j.status.replace(/_/g, " ")}</Text>
              </TouchableOpacity>
            ))
          )}
        </>
      )}

      <TouchableOpacity style={styles.servicesCard} onPress={() => router.push("/(app)/services")}>
        <Text style={styles.servicesTitle}>✨ Explore Services</Text>
        <Text style={styles.servicesSub}>See what's included in your plan and what upgrading unlocks</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  greeting: { color: "#fff", fontSize: 22, fontWeight: "700" },
  sub: { color: "#9A9AB0", fontSize: 14, marginTop: 4, marginBottom: 20 },
  warnCard: { backgroundColor: "#2A1414", borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#5C2323" },
  warnText: { color: "#F87171", fontSize: 13 },
  cardsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  card: { flex: 1, backgroundColor: "#16161F", borderRadius: 14, padding: 18, borderWidth: 1, borderColor: "#26263A" },
  cardValue: { color: "#fff", fontSize: 26, fontWeight: "700" },
  cardLabel: { color: "#9A9AB0", fontSize: 12, marginTop: 4 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 10 },
  empty: { color: "#6B6B80", fontSize: 13, marginTop: 8 },
  jobRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16161F", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  jobNumber: { color: "#fff", fontWeight: "600", fontSize: 14 },
  jobMeta: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  jobStatus: { color: ACCENT, fontSize: 11, fontWeight: "600" },
  servicesCard: { backgroundColor: "#1A1330", borderRadius: 14, padding: 18, borderWidth: 1, borderColor: "#3A2A66", marginTop: 20 },
  servicesTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  servicesSub: { color: "#B8A8E8", fontSize: 12, marginTop: 4 },
});
