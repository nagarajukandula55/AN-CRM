import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as auth from "@/api/auth";
import { useAuth } from "@/context/AuthContext";

export default function SignupScreen() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [accountType, setAccountType] = useState<"RETAIL" | "BUSINESS">("RETAIL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !email.trim() || !password) {
      setError("Name, email and password are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (accountType === "BUSINESS" && !businessName.trim()) {
      setError("Business/retailer name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await auth.signup({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        accountType,
        businessName: accountType === "BUSINESS" ? businessName.trim() : undefined,
        gstNumber: accountType === "BUSINESS" ? gstNumber.trim() || undefined : undefined,
      });
      await refresh();
      router.replace("/");
    } catch (err: any) {
      setError(err?.message || "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create account</Text>

      <Text style={styles.label}>Account type</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleButton, accountType === "RETAIL" && styles.toggleButtonActive]}
          onPress={() => setAccountType("RETAIL")}
        >
          <Text style={[styles.toggleText, accountType === "RETAIL" && styles.toggleTextActive]}>Customer</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, accountType === "BUSINESS" && styles.toggleButtonActive]}
          onPress={() => setAccountType("BUSINESS")}
        >
          <Text style={[styles.toggleText, accountType === "BUSINESS" && styles.toggleTextActive]}>
            Retailer / Business
          </Text>
        </Pressable>
      </View>
      {accountType === "BUSINESS" && (
        <Text style={styles.hint}>
          Retailers/businesses can place bulk orders (10kg+) — revised pricing and shipping are
          shared with you after you submit.
        </Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />

      {accountType === "BUSINESS" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Business / retailer name"
            value={businessName}
            onChangeText={setBusinessName}
          />
          <TextInput
            style={styles.input}
            placeholder="GST number (optional)"
            autoCapitalize="characters"
            value={gstNumber}
            onChangeText={(v) => setGstNumber(v.toUpperCase())}
          />
        </>
      )}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
      </Pressable>

      <Pressable onPress={() => router.replace("/login")}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151" },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggleButton: { flex: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, alignItems: "center" },
  toggleButtonActive: { backgroundColor: "#111827", borderColor: "#111827" },
  toggleText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  toggleTextActive: { color: "#fff" },
  hint: { fontSize: 12, color: "#92400e", backgroundColor: "#fef3c7", borderRadius: 8, padding: 10 },
  error: { color: "#dc2626", fontSize: 13 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, fontSize: 15 },
  button: { backgroundColor: "#111827", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600" },
  link: { textAlign: "center", color: "#2563eb", fontSize: 13, marginTop: 12 },
});
