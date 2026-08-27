import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, TextInput, Alert, RefreshControl, ScrollView } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { listExpenses, createExpense, deleteExpense, type Expense } from "@/api/expenses";
import { ApiError } from "@/api/client";

const ACCENT = "#2563EB";
const PAYMENT_MODES = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"];

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listExpenses();
      setExpenses(data.expenses);
      setTotal(data.total);
      setCategories(data.categories);
      if (!category && data.categories.length > 0) setCategory(data.categories[0]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category]);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function handleCreate() {
    const amountNum = Number(amount);
    if (!category) {
      Alert.alert("Missing category", "Pick an expense category");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid amount", "Enter a positive amount");
      return;
    }
    setSaving(true);
    try {
      await createExpense({ category, amount: amountNum, description: description || undefined, paymentMode });
      setAmount("");
      setDescription("");
      setShowForm(false);
      load();
    } catch (err) {
      Alert.alert("Couldn't save expense", err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string) {
    Alert.alert("Delete expense", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteExpense(id);
            load();
          } catch (err) {
            Alert.alert("Couldn't delete", err instanceof ApiError ? err.message : "Something went wrong");
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Expenses</Text>
            <Text style={styles.totalText}>Total: ₹{total.toLocaleString("en-IN")}</Text>
          </View>
          <TouchableOpacity style={styles.newButton} onPress={() => setShowForm((v) => !v)}>
            <Text style={styles.newButtonText}>{showForm ? "Cancel" : "+ Add"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showForm && (
        <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 8 }}>
          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {categories.map((c) => (
              <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
                <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput style={styles.input} placeholder="Amount *" placeholderTextColor="#6B6B80" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Description" placeholderTextColor="#6B6B80" value={description} onChangeText={setDescription} />
          <Text style={styles.label}>Payment Mode</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {PAYMENT_MODES.map((m) => (
              <TouchableOpacity key={m} style={[styles.chip, paymentMode === m && styles.chipActive]} onPress={() => setPaymentMode(m)}>
                <Text style={[styles.chipText, paymentMode === m && styles.chipTextActive]}>{m.replace(/_/g, " ")}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.saveButton} onPress={handleCreate} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save Expense"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ACCENT} />}
          ListEmptyComponent={<Text style={styles.empty}>No expenses logged yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowCategory}>{item.category}</Text>
                <Text style={styles.rowMeta}>
                  {new Date(item.date).toLocaleDateString("en-IN")} · {item.paymentMode?.replace(/_/g, " ") || "CASH"}
                </Text>
                {item.description ? <Text style={styles.rowDesc}>{item.description}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.rowAmount}>₹{item.amount.toLocaleString("en-IN")}</Text>
                <TouchableOpacity onPress={() => handleDelete(item._id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  header: { padding: 16, paddingBottom: 4 },
  back: { color: ACCENT, fontSize: 14, fontWeight: "600", marginBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  totalText: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  newButton: { backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  newButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  form: { paddingHorizontal: 16, paddingTop: 12, maxHeight: 340 },
  label: { color: "#9A9AB0", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 12, fontSize: 14, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#16161F", borderWidth: 1, borderColor: "#26263A", marginRight: 8 },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: "#9A9AB0", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  saveButton: { backgroundColor: ACCENT, borderRadius: 10, padding: 13, alignItems: "center", marginBottom: 8 },
  saveButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  empty: { color: "#6B6B80", textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", backgroundColor: "#16161F", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  rowCategory: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowMeta: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  rowDesc: { color: "#6B6B80", fontSize: 12, marginTop: 2, fontStyle: "italic" },
  rowAmount: { color: "#fff", fontSize: 14, fontWeight: "700" },
  deleteText: { color: "#F87171", fontSize: 11, fontWeight: "600", marginTop: 6 },
});
