import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter, Link } from "expo-router";
import { getJobSheet, advanceJobSheet, nextActionFor, type JobSheet } from "@/api/crm";
import { ApiError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

const ACCENT = "#2563EB";

export default function WorkorderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [job, setJob] = useState<JobSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getJobSheet(id);
      setJob(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleAdvance() {
    if (!job || !user?.id) return;
    const action = nextActionFor(job.status);
    if (!action) return;
    setActing(true);
    try {
      const updated = await advanceJobSheet(job._id, user.id);
      setJob(updated);
    } catch (err) {
      Alert.alert("Couldn't update", err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Workorder not found.</Text>
      </View>
    );
  }

  const action = nextActionFor(job.status);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <Text style={{ color: ACCENT, fontSize: 14, fontWeight: "600" }}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.number}>{job.jobSheetNumber}</Text>
      <View style={styles.statusPill}>
        <Text style={styles.statusText}>{job.status.replace(/_/g, " ")}</Text>
      </View>

      <View style={styles.section}>
        <Row label="Customer" value={job.customerName} />
        <Row label="Phone" value={job.customerPhone} />
        <Row label="Product" value={job.product} />
        <Row label="Assigned To" value={job.assignedToName || job.ccoName} />
      </View>

      {action && (
        <TouchableOpacity style={styles.actionButton} onPress={handleAdvance} disabled={acting}>
          <Text style={styles.actionButtonText}>{acting ? "Updating…" : action.label}</Text>
        </TouchableOpacity>
      )}

      {(job.status === "REPAIR_STARTED" || job.status === "REPAIR_IN_PROGRESS") && (
        <Link href={`/(app)/workorders/${job._id}/repair`} asChild>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Continue Repair</Text>
          </TouchableOpacity>
        </Link>
      )}

      {["PART_PENDING", "REPAIR_COMPLETED", "CLOSED", "CANCELLED"].includes(job.status) && (
        <Text style={styles.hint}>Further updates (part-pending, handover, re-open) require the full admin app.</Text>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  center: { flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" },
  empty: { color: "#6B6B80" },
  number: { color: "#fff", fontSize: 20, fontWeight: "700" },
  statusPill: { alignSelf: "flex-start", backgroundColor: "#221A45", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8, marginBottom: 20 },
  statusText: { color: ACCENT, fontSize: 12, fontWeight: "700" },
  section: { backgroundColor: "#16161F", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#26263A", marginBottom: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#20202E" },
  rowLabel: { color: "#9A9AB0", fontSize: 13 },
  rowValue: { color: "#fff", fontSize: 13, fontWeight: "500" },
  actionButton: { backgroundColor: ACCENT, borderRadius: 10, padding: 15, alignItems: "center" },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  hint: { color: "#6B6B80", fontSize: 12, textAlign: "center", marginTop: 10 },
});
