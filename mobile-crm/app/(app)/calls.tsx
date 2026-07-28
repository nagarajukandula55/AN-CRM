import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput, Alert, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { listCalls, createCall, type CrmCallSummary } from "@/api/calls";
import { ApiError } from "@/api/client";

const ACCENT = "#5B3DF5";

export default function CallsScreen() {
  const [calls, setCalls] = useState<CrmCallSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listCalls();
      setCalls(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!customerName.trim() || !phone.trim() || !subject.trim()) {
      Alert.alert("Missing info", "Customer name, phone, and subject are required");
      return;
    }
    setSaving(true);
    try {
      await createCall({ customerName, phone, subject });
      setCustomerName(""); setPhone(""); setSubject("");
      setShowForm(false);
      load();
    } catch (err) {
      Alert.alert("Couldn't log call", err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Calls</Text>
        <TouchableOpacity style={styles.newButton} onPress={() => setShowForm((v) => !v)}>
          <Text style={styles.newButtonText}>{showForm ? "Cancel" : "+ New Call"}</Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Customer name *" placeholderTextColor="#6B6B80" value={customerName} onChangeText={setCustomerName} />
          <TextInput style={styles.input} placeholder="Phone *" placeholderTextColor="#6B6B80" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextInput style={styles.input} placeholder="Subject / issue *" placeholderTextColor="#6B6B80" value={subject} onChangeText={setSubject} />
          <TouchableOpacity style={styles.saveButton} onPress={handleCreate} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Log Call"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(c) => c._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ACCENT} />}
          ListEmptyComponent={<Text style={styles.empty}>No calls logged yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View>
                <Text style={styles.rowNumber}>{item.callNumber}</Text>
                <Text style={styles.rowMeta}>{item.customerName} · {item.phone}</Text>
                <Text style={styles.rowSubject}>{item.subject}</Text>
              </View>
              <Text style={styles.rowStatus}>{item.status?.replace(/_/g, " ")}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingBottom: 4 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  newButton: { backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  newButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  form: { paddingHorizontal: 16, paddingTop: 12 },
  input: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 12, fontSize: 14, marginBottom: 10 },
  saveButton: { backgroundColor: ACCENT, borderRadius: 10, padding: 13, alignItems: "center", marginBottom: 8 },
  saveButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  empty: { color: "#6B6B80", textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", backgroundColor: "#16161F", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  rowNumber: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowMeta: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  rowSubject: { color: "#9A9AB0", fontSize: 12, marginTop: 2, fontStyle: "italic" },
  rowStatus: { color: ACCENT, fontSize: 11, fontWeight: "600" },
});
