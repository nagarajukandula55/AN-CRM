import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useSubscription, daysRemaining } from "@/context/SubscriptionContext";
import { listJobSheets, type JobSheet } from "@/api/crm";

const ACCENT = "#5B3DF5";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { billing } = useSubscription();
  const [taken, setTaken] = useState<JobSheet[]>([]);
  const [upcoming, setUpcoming] = useState<JobSheet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const all = await listJobSheets();
      setTaken(all.filter((j) => ["REPAIR_COMPLETED", "CLOSED"].includes(j.status)).slice(0, 5));
      setUpcoming(all.filter((j) => !["REPAIR_COMPLETED", "CLOSED", "CANCELLED"].includes(j.status)).slice(0, 5));
    } catch {
      /* profile still usable without history */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => { await signOut(); router.replace("/login"); } },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>{user?.role}</Text>
      </View>

      {billing?.subscription && (() => {
        const blocked = billing.status === "EXPIRED" || billing.status === "NOT_SET";
        const remaining = daysRemaining(billing.subscription);
        const planName = billing.subscription.planName || (billing.subscription.planKey === "ULTIMATE" ? "Ultimate" : "Pro");
        return (
          <TouchableOpacity style={styles.planCard} onPress={() => router.push("/(app)/services")}>
            <View>
              <Text style={styles.planTitle}>{planName} plan</Text>
              <Text style={[styles.planStatus, blocked && styles.planStatusBlocked]}>
                {blocked ? "Expired — renew now" : remaining != null ? `${remaining} day${remaining === 1 ? "" : "s"} remaining` : "Active"}
              </Text>
            </View>
            <Text style={styles.planArrow}>›</Text>
          </TouchableOpacity>
        );
      })()}

      <Text style={styles.sectionTitle}>Services Taken</Text>
      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
      ) : taken.length === 0 ? (
        <Text style={styles.empty}>No completed services yet.</Text>
      ) : (
        taken.map((j) => (
          <TouchableOpacity key={j._id} style={styles.historyRow} onPress={() => router.push(`/(app)/workorders/${j._id}`)}>
            <Text style={styles.historyNumber}>{j.jobSheetNumber}</Text>
            <Text style={styles.historyMeta}>{j.product || j.customerName || "—"}</Text>
          </TouchableOpacity>
        ))
      )}

      <Text style={styles.sectionTitle}>Services About to Take</Text>
      {!loading && upcoming.length === 0 ? (
        <Text style={styles.empty}>Nothing scheduled right now.</Text>
      ) : (
        upcoming.map((j) => (
          <TouchableOpacity key={j._id} style={styles.historyRow} onPress={() => router.push(`/(app)/workorders/${j._id}`)}>
            <Text style={styles.historyNumber}>{j.jobSheetNumber}</Text>
            <Text style={styles.historyStatus}>{j.status.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  card: { backgroundColor: "#16161F", borderRadius: 12, padding: 18, borderWidth: 1, borderColor: "#26263A", marginBottom: 14 },
  name: { color: "#fff", fontSize: 18, fontWeight: "700" },
  email: { color: "#9A9AB0", fontSize: 13, marginTop: 4 },
  role: { color: ACCENT, fontSize: 12, fontWeight: "600", marginTop: 8 },
  planCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16161F", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#26263A", marginBottom: 20 },
  planTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  planStatus: { color: "#4ADE80", fontSize: 12, marginTop: 3 },
  planStatusBlocked: { color: "#F87171" },
  planArrow: { color: "#6B6B80", fontSize: 20 },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 10, marginBottom: 8 },
  empty: { color: "#6B6B80", fontSize: 12, marginBottom: 8 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#16161F", borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#26263A" },
  historyNumber: { color: "#fff", fontSize: 13, fontWeight: "600" },
  historyMeta: { color: "#9A9AB0", fontSize: 12 },
  historyStatus: { color: ACCENT, fontSize: 11, fontWeight: "600" },
  signOutButton: { backgroundColor: "#2A1414", borderRadius: 10, padding: 15, alignItems: "center", borderWidth: 1, borderColor: "#5C2323", marginTop: 24 },
  signOutText: { color: "#F87171", fontWeight: "600", fontSize: 15 },
});
