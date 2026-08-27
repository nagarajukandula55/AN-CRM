import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/api/client";

const ACCENT = "#2563EB";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!emailOrUsername.trim() || !password) {
      setError("Enter your email/username and password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signIn(emailOrUsername.trim(), password);
      router.replace("/(app)");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.logoWrap}>
        <View style={styles.logoMark}>
          <Text style={styles.logoText}>AN</Text>
        </View>
        <Text style={styles.appName}>AN-CRM</Text>
        <Text style={styles.tagline}>Service Center Portal</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Email or Username</Text>
        <TextInput
          style={styles.input}
          value={emailOrUsername}
          onChangeText={setEmailOrUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="you@business.com"
          placeholderTextColor="#6B6B80"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#6B6B80"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign In"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14", justifyContent: "center", padding: 24 },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  logoMark: { width: 56, height: 56, borderRadius: 14, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  logoText: { color: "#fff", fontWeight: "700", fontSize: 20 },
  appName: { color: "#fff", fontSize: 24, fontWeight: "700" },
  tagline: { color: "#9A9AB0", fontSize: 13, marginTop: 4 },
  form: { gap: 8 },
  label: { color: "#9A9AB0", fontSize: 13, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 14, fontSize: 15 },
  error: { color: "#F87171", fontSize: 13, marginTop: 10 },
  button: { backgroundColor: ACCENT, borderRadius: 10, padding: 15, alignItems: "center", marginTop: 20 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
