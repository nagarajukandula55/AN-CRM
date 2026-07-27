import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, Link } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Sign in to view your profile.</Text>
        <Pressable style={styles.loginButton} onPress={() => router.push("/login")}>
          <Text style={styles.loginText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user.name || "?").charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <View style={styles.menu}>
        <Link href="/orders" asChild>
          <Pressable style={styles.menuItem}>
            <Text style={styles.menuText}>My Orders</Text>
          </Pressable>
        </Link>
        <Link href="/wishlist" asChild>
          <Pressable style={styles.menuItem}>
            <Text style={styles.menuText}>Wishlist</Text>
          </Pressable>
        </Link>
        <Pressable
          style={[styles.menuItem, styles.logoutItem]}
          onPress={async () => {
            await logout();
            router.replace("/");
          }}
        >
          <Text style={[styles.menuText, styles.logoutText]}>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  container: { flex: 1, backgroundColor: "#fff" },
  header: { alignItems: "center", paddingVertical: 32, borderBottomWidth: 1, borderColor: "#f3f4f6" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#111827", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  name: { fontSize: 16, fontWeight: "700", marginTop: 12 },
  email: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  menu: { padding: 16 },
  menuItem: { paddingVertical: 14, borderBottomWidth: 1, borderColor: "#f3f4f6" },
  menuText: { fontSize: 14, fontWeight: "500" },
  logoutItem: { borderBottomWidth: 0, marginTop: 8 },
  logoutText: { color: "#dc2626" },
  emptyText: { color: "#6b7280", marginBottom: 12 },
  loginButton: { backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  loginText: { color: "#fff", fontWeight: "600" },
});
