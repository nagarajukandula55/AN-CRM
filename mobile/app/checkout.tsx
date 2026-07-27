import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import RazorpayCheckout from "react-native-razorpay";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { createOrder } from "@/api/orders";
import { verifyPayment } from "@/api/payments";

const RAZORPAY_KEY_ID = (Constants.expoConfig?.extra?.razorpayKeyId as string) || "";

interface AddressForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  landmark: string;
  pincode: string;
  city: string;
  state: string;
  gstNumber: string;
}

const emptyForm: AddressForm = {
  name: "", phone: "", email: "", address: "", landmark: "", pincode: "", city: "", state: "", gstNumber: "",
};

const BULK_MIN_KG = 10;

function validatePhone(phone: string) {
  return /^[6-9]\d{9}$/.test(phone);
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, total, totalWeightKg, clear } = useCart();
  const { user } = useAuth();
  const isBulkOrder = user?.accountType === "BUSINESS" && totalWeightKg >= BULK_MIN_KG;
  const [form, setForm] = useState<AddressForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || user.name || "",
      phone: prev.phone || user.phone || "",
      email: prev.email || user.email || "",
    }));
  }, [user]);

  function set<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((p) => ({ ...p, [key]: value }));
    if (error) setError(null);
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Name is required";
    if (!validatePhone(form.phone)) return "Enter a valid 10-digit phone number";
    if (!form.address.trim()) return "Address is required";
    if (!form.pincode.trim() || form.pincode.trim().length !== 6) return "Enter a valid 6-digit pincode";
    if (!form.city.trim()) return "City is required";
    if (!form.state.trim()) return "State is required";
    return null;
  }

  async function handlePlaceOrder() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (items.length === 0) {
      setError("Your cart is empty");
      return;
    }
    if (!isBulkOrder && !RAZORPAY_KEY_ID) {
      setError("Payment isn't configured yet (app.json extra.razorpayKeyId is missing) — contact support.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const cart = items.map((i) => ({ productKey: i.id, qty: i.quantity, variant: "default" }));

      const data: any = await createOrder({
        cart,
        address: form,
        customer: { name: form.name, phone: form.phone, email: form.email },
        paymentMethod: "RAZORPAY",
        userId: user?.id,
        customerType: user?.accountType === "BUSINESS" ? "BUSINESS" : "RETAIL",
      });

      if (!data?.success) {
        throw new Error(data?.error || data?.message || "Order creation failed");
      }

      // Bulk orders skip payment entirely -- there's no razorpayOrder,
      // the order sits at PENDING_REVIEW until billing is revised.
      if (data.isBulkOrder) {
        clear();
        Alert.alert(
          "Bulk order submitted",
          `Your order ${data.orderId} has been submitted. We'll share revised pricing and separate shipping charges shortly.`,
          [{ text: "View Orders", onPress: () => router.replace("/orders") }]
        );
        return;
      }

      const rzpOptions = {
        key: RAZORPAY_KEY_ID,
        amount: data.razorpayOrder?.amount,
        currency: data.razorpayOrder?.currency || "INR",
        order_id: data.razorpayOrder?.id,
        name: "AN Group",
        description: `Order ${data.orderId}`,
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: "#111827" },
      };

      const paymentResult = await RazorpayCheckout.open(rzpOptions);

      const verifyResult: any = await verifyPayment({
        razorpay_order_id: paymentResult.razorpay_order_id,
        razorpay_payment_id: paymentResult.razorpay_payment_id,
        razorpay_signature: paymentResult.razorpay_signature,
        orderId: data.orderId,
      });

      if (!verifyResult?.success) {
        throw new Error(verifyResult?.error || "Payment verification failed — contact support with your order ID.");
      }

      clear();
      Alert.alert("Order placed!", `Your order ${data.orderId} has been placed successfully.`, [
        { text: "View Orders", onPress: () => router.replace("/orders") },
      ]);
    } catch (err: any) {
      // Razorpay's cancel/failure rejection shape is { code, description },
      // not an Error — normalize both here since either can reach this catch.
      setError(err?.description || err?.message || "Something went wrong placing your order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Delivery Address</Text>

      <Field label="Full Name *"><TextInput style={styles.input} value={form.name} onChangeText={(v) => set("name", v)} /></Field>
      <Field label="Phone *"><TextInput style={styles.input} value={form.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" maxLength={10} /></Field>
      <Field label="Email"><TextInput style={styles.input} value={form.email} onChangeText={(v) => set("email", v)} keyboardType="email-address" autoCapitalize="none" /></Field>
      <Field label="Address *"><TextInput style={[styles.input, styles.multiline]} value={form.address} onChangeText={(v) => set("address", v)} multiline /></Field>
      <Field label="Landmark"><TextInput style={styles.input} value={form.landmark} onChangeText={(v) => set("landmark", v)} /></Field>
      <Field label="Pincode *"><TextInput style={styles.input} value={form.pincode} onChangeText={(v) => set("pincode", v)} keyboardType="number-pad" maxLength={6} /></Field>
      <Field label="City *"><TextInput style={styles.input} value={form.city} onChangeText={(v) => set("city", v)} /></Field>
      <Field label="State *"><TextInput style={styles.input} value={form.state} onChangeText={(v) => set("state", v)} /></Field>
      <Field label="GST Number (optional, for B2B invoice)"><TextInput style={styles.input} value={form.gstNumber} onChangeText={(v) => set("gstNumber", v.toUpperCase())} autoCapitalize="characters" /></Field>

      {isBulkOrder && (
        <View style={styles.bulkBanner}>
          <Text style={styles.bulkBannerText}>
            Bulk order ({totalWeightKg.toFixed(1)}kg, min {BULK_MIN_KG}kg) — no payment now.
            After you submit, we'll review and share revised pricing plus separate shipping
            charges for your approval.
          </Text>
        </View>
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{isBulkOrder ? "Estimated Total" : "Total"}</Text>
        <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN")}</Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handlePlaceOrder} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{isBulkOrder ? "Submit Bulk Order" : "Place Order & Pay"}</Text>}
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, color: "#6b7280", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderColor: "#f3f4f6" },
  totalLabel: { fontSize: 16, fontWeight: "600" },
  totalValue: { fontSize: 16, fontWeight: "700" },
  error: { color: "#dc2626", fontSize: 13, marginBottom: 12 },
  submitButton: { backgroundColor: "#111827", borderRadius: 10, padding: 14, alignItems: "center" },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  bulkBanner: { backgroundColor: "#fef3c7", borderRadius: 10, padding: 12, marginBottom: 12 },
  bulkBannerText: { fontSize: 13, color: "#92400e", lineHeight: 18 },
});
