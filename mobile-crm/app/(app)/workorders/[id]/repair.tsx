import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import {
  getJobSheet,
  saveRepairProgress,
  closeRepair,
  type JobSheet,
  type JobSheetLineItem,
} from "@/api/crm";
import { listMaterials, type Material } from "@/api/materials";
import { ApiError } from "@/api/client";

const ACCENT = "#5B3DF5";

/**
 * The engineer-facing repair screen -- REPAIR_IN_PROGRESS's own form,
 * previously left to the web admin entirely (see workorders/[id]/index.tsx's
 * "Continue Repair" link into this route). Parts come from the same
 * Material/BOM catalog api/service-center-bom already serves (not free
 * text), work performed is a plain note, and "signature" here is a typed
 * customer-name confirmation stored into customerSignatureUrl -- a real
 * drawn signature pad is a native-canvas addition for a later pass (see
 * README), not faked here as more than it is.
 */
export default function RepairScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [job, setJob] = useState<JobSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [lineItems, setLineItems] = useState<JobSheetLineItem[]>([]);
  const [workPerformed, setWorkPerformed] = useState("");
  const [signatureName, setSignatureName] = useState("");

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getJobSheet(id);
      setJob(data);
      setLineItems(data.lineItems || []);
      setWorkPerformed(data.workPerformed || "");
      setSignatureName(data.customerSignatureUrl || "");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = useMemo(
    () => lineItems.reduce((sum, li) => sum + (li.quantity || 0) * (li.unitPrice || 0), 0),
    [lineItems]
  );

  async function runSearch(text: string) {
    setQuery(text);
    if (!text.trim()) { setResults([]); return; }
    try {
      const materials = await listMaterials(text);
      setResults(materials.slice(0, 8));
    } catch {
      setResults([]);
    }
  }

  function addPart(m: Material) {
    setLineItems((prev) => [
      ...prev,
      {
        description: m.partName,
        quantity: 1,
        unit: "pcs",
        unitPrice: m.rate,
        taxRate: m.gstRate,
        hsnCode: m.hsnCode,
        materialCode: m.partCode,
        cost: m.rate,
        serviceCenterBOMId: m._id,
      },
    ]);
    setSearching(false);
    setQuery("");
    setResults([]);
  }

  function removePart(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveProgress() {
    if (!job) return;
    setSaving(true);
    try {
      await saveRepairProgress(job._id, { lineItems, workPerformed, customerSignatureUrl: signatureName });
      Alert.alert("Saved", "Repair progress saved.");
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!job) return;
    if (lineItems.length === 0) {
      Alert.alert("Add at least one part", "A completed repair needs at least one line item.");
      return;
    }
    if (!workPerformed.trim()) {
      Alert.alert("Describe the work", "Add a short note on what was done before completing.");
      return;
    }
    if (!signatureName.trim()) {
      Alert.alert("Customer confirmation needed", "Enter the customer's name to confirm handover.");
      return;
    }
    setCompleting(true);
    try {
      await saveRepairProgress(job._id, { lineItems, workPerformed, customerSignatureUrl: signatureName });
      const { invoice } = await closeRepair(job._id);
      Alert.alert("Repair Completed", `Invoice ${invoice.invoiceNumber} generated — ₹${invoice.grandTotal.toLocaleString("en-IN")}`, [
        { text: "OK", onPress: () => router.replace(`/(app)/workorders/${job._id}`) },
      ]);
    } catch (err) {
      Alert.alert("Couldn't complete repair", err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setCompleting(false);
    }
  }

  if (loading || !job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <Text style={{ color: ACCENT, fontSize: 14, fontWeight: "600" }}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.jobHead}>
        <Text style={styles.jobNum}>{job.jobSheetNumber}</Text>
        <Text style={styles.jobSub}>{job.customerName} · {job.product || "—"}</Text>
        <View style={styles.statusPill}><Text style={styles.statusPillText}>{job.status.replace(/_/g, " ")}</Text></View>
      </View>

      <View style={styles.subHeadRow}>
        <Text style={styles.subHead}>Parts Used</Text>
        <TouchableOpacity onPress={() => setSearching((v) => !v)}>
          <Text style={styles.addMini}>{searching ? "Cancel" : "+ Add from Catalog"}</Text>
        </TouchableOpacity>
      </View>

      {searching && (
        <View style={{ marginBottom: 12 }}>
          <TextInput
            style={styles.input}
            placeholder="Search material catalog…"
            placeholderTextColor="#6B6B80"
            value={query}
            onChangeText={runSearch}
            autoFocus
          />
          {results.map((m) => (
            <TouchableOpacity key={m._id} style={styles.resultRow} onPress={() => addPart(m)}>
              <View>
                <Text style={styles.resultName}>{m.partName}</Text>
                <Text style={styles.resultCode}>{m.partCode} · {m.hsnCode}</Text>
              </View>
              <Text style={styles.resultPrice}>₹{m.rate.toLocaleString("en-IN")}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {lineItems.length === 0 ? (
        <Text style={styles.empty}>No parts added yet.</Text>
      ) : (
        lineItems.map((li, i) => (
          <View key={i} style={styles.partRow}>
            <View>
              <Text style={styles.partName}>{li.description}</Text>
              <Text style={styles.partCode}>{li.materialCode} · Qty {li.quantity}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={styles.partPrice}>₹{((li.quantity || 0) * (li.unitPrice || 0)).toLocaleString("en-IN")}</Text>
              <TouchableOpacity onPress={() => removePart(i)}><Text style={styles.removeX}>✕</Text></TouchableOpacity>
            </View>
          </View>
        ))
      )}
      {lineItems.length > 0 && (
        <Text style={styles.partsTotal}>Parts total: ₹{total.toLocaleString("en-IN")} (+ tax)</Text>
      )}

      <Text style={styles.subHead}>Work Performed</Text>
      <TextInput
        style={styles.textarea}
        placeholder="What did you do to fix this?"
        placeholderTextColor="#6B6B80"
        value={workPerformed}
        onChangeText={setWorkPerformed}
        multiline
        numberOfLines={4}
      />

      <Text style={styles.subHead}>Customer Confirmation</Text>
      <TextInput
        style={styles.input}
        placeholder="Customer name confirming handover"
        placeholderTextColor="#6B6B80"
        value={signatureName}
        onChangeText={setSignatureName}
      />
      <Text style={styles.signHint}>Typed confirmation for now — a drawn signature pad is next on the roadmap.</Text>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleSaveProgress} disabled={saving}>
        <Text style={styles.secondaryButtonText}>{saving ? "Saving…" : "Save Progress"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryButton} onPress={handleComplete} disabled={completing}>
        <Text style={styles.primaryButtonText}>{completing ? "Completing…" : "Mark Repair Completed"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  center: { flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" },
  jobHead: { backgroundColor: "#16161F", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#26263A", marginBottom: 18 },
  jobNum: { color: "#fff", fontSize: 17, fontWeight: "700" },
  jobSub: { color: "#9A9AB0", fontSize: 12.5, marginTop: 3 },
  statusPill: { alignSelf: "flex-start", backgroundColor: "#152238", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 9 },
  statusPillText: { color: "#60A5FA", fontSize: 10.5, fontWeight: "700" },
  subHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, marginTop: 6 },
  subHead: { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 10, marginTop: 16 },
  addMini: { color: ACCENT, fontSize: 12.5, fontWeight: "700" },
  input: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 12, fontSize: 13.5, marginBottom: 8 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1A1A26", borderRadius: 9, padding: 11, marginBottom: 6 },
  resultName: { color: "#fff", fontSize: 12.5, fontWeight: "600" },
  resultCode: { color: "#6B6B80", fontSize: 10.5, marginTop: 1 },
  resultPrice: { color: "#fff", fontSize: 12.5 },
  empty: { color: "#6B6B80", fontSize: 12.5, marginBottom: 6 },
  partRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16161F", borderRadius: 9, padding: 12, marginBottom: 7, borderWidth: 1, borderColor: "#26263A" },
  partName: { color: "#fff", fontSize: 12.5, fontWeight: "600" },
  partCode: { color: "#6B6B80", fontSize: 10.5, marginTop: 1 },
  partPrice: { color: "#fff", fontSize: 12.5 },
  removeX: { color: "#F87171", fontSize: 13, fontWeight: "700" },
  partsTotal: { color: "#9A9AB0", fontSize: 11.5, textAlign: "right", marginTop: 2 },
  textarea: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: "top" },
  signHint: { color: "#6B6B80", fontSize: 10.5, marginTop: 6, marginBottom: 4 },
  secondaryButton: { borderColor: ACCENT, borderWidth: 1, borderRadius: 10, padding: 13, alignItems: "center", marginTop: 20 },
  secondaryButtonText: { color: ACCENT, fontWeight: "700", fontSize: 13.5 },
  primaryButton: { backgroundColor: ACCENT, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 10, marginBottom: 40 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
