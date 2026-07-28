import { useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { createPosInvoice, type CartItem } from "@/api/pos";
import { ApiError } from "@/api/client";

const ACCENT = "#5B3DF5";
const emptyItem = (): CartItem => ({ description: "", quantity: 1, unitPrice: 0, taxRate: 18, hsnCode: "" });

export default function PosScreen() {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [items, setItems] = useState<CartItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNumber: string; grandTotal: number } | null>(null);

  const totals = useMemo(() => {
    let subtotal = 0, tax = 0;
    for (const item of items) {
      const lineAmt = (item.quantity || 0) * (item.unitPrice || 0);
      subtotal += lineAmt;
      tax += lineAmt * ((item.taxRate || 0) / 100);
    }
    return { subtotal, tax, grandTotal: subtotal + tax };
  }, [items]);

  function updateItem(i: number, patch: Partial<CartItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function handleSubmit() {
    if (!customerName.trim()) {
      Alert.alert("Missing info", "Customer name is required");
      return;
    }
    const validItems = items.filter((it) => it.description.trim() && it.quantity > 0);
    if (validItems.length === 0) {
      Alert.alert("Missing items", "Add at least one item");
      return;
    }
    setSaving(true);
    try {
      const invoice = await createPosInvoice({
        customer: { name: customerName, phone: customerPhone },
        items: validItems,
        discountAmount: 0,
        paymentMode: "CASH",
        amountPaid: totals.grandTotal,
      });
      setLastInvoice(invoice);
      setCustomerName("");
      setCustomerPhone("");
      setItems([emptyItem()]);
    } catch (err) {
      Alert.alert("Couldn't create invoice", err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Quick Sale</Text>

      {lastInvoice && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>
            Invoice {lastInvoice.invoiceNumber} created — ₹{lastInvoice.grandTotal.toLocaleString("en-IN")}
          </Text>
        </View>
      )}

      <TextInput style={styles.input} placeholder="Customer name *" placeholderTextColor="#6B6B80" value={customerName} onChangeText={setCustomerName} />
      <TextInput style={styles.input} placeholder="Phone" placeholderTextColor="#6B6B80" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />

      <Text style={styles.sectionTitle}>Items</Text>
      {items.map((item, i) => (
        <View key={i} style={styles.itemRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Item / service" placeholderTextColor="#6B6B80" value={item.description} onChangeText={(v) => updateItem(i, { description: v })} />
          <TextInput style={[styles.input, styles.smallInput]} placeholder="Qty" placeholderTextColor="#6B6B80" keyboardType="numeric" value={String(item.quantity)} onChangeText={(v) => updateItem(i, { quantity: Number(v) || 0 })} />
          <TextInput style={[styles.input, styles.smallInput]} placeholder="Rate" placeholderTextColor="#6B6B80" keyboardType="numeric" value={String(item.unitPrice)} onChangeText={(v) => updateItem(i, { unitPrice: Number(v) || 0 })} />
        </View>
      ))}
      <TouchableOpacity style={styles.addItemButton} onPress={() => setItems((prev) => [...prev, emptyItem()])}>
        <Text style={styles.addItemText}>+ Add Item</Text>
      </TouchableOpacity>

      <View style={styles.totalsCard}>
        <Row label="Subtotal" value={`₹${totals.subtotal.toLocaleString("en-IN")}`} />
        <Row label="Tax" value={`₹${totals.tax.toLocaleString("en-IN")}`} />
        <Row label="Grand Total" value={`₹${totals.grandTotal.toLocaleString("en-IN")}`} bold />
      </View>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={saving}>
        <Text style={styles.submitButtonText}>{saving ? "Saving…" : "Complete Sale"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={[styles.totalsLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.totalsValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  successCard: { backgroundColor: "#132A1E", borderColor: "#1F5C3B", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  successText: { color: "#4ADE80", fontSize: 13 },
  input: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 12, fontSize: 14, marginBottom: 10 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "600", marginTop: 8, marginBottom: 8 },
  itemRow: { flexDirection: "row", gap: 8 },
  smallInput: { width: 70 },
  addItemButton: { paddingVertical: 8, marginBottom: 16 },
  addItemText: { color: ACCENT, fontWeight: "600", fontSize: 13 },
  totalsCard: { backgroundColor: "#16161F", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#26263A", marginBottom: 20 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalsLabel: { color: "#9A9AB0", fontSize: 13 },
  totalsValue: { color: "#fff", fontSize: 13 },
  bold: { fontWeight: "700", fontSize: 15 },
  submitButton: { backgroundColor: ACCENT, borderRadius: 10, padding: 15, alignItems: "center", marginBottom: 40 },
  submitButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
