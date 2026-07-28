import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  function handleSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>{user?.role}</Text>
      </View>
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14", padding: 20 },
  card: { backgroundColor: "#16161F", borderRadius: 12, padding: 18, borderWidth: 1, borderColor: "#26263A", marginBottom: 20 },
  name: { color: "#fff", fontSize: 18, fontWeight: "700" },
  email: { color: "#9A9AB0", fontSize: 13, marginTop: 4 },
  role: { color: "#5B3DF5", fontSize: 12, fontWeight: "600", marginTop: 8 },
  signOutButton: { backgroundColor: "#2A1414", borderRadius: 10, padding: 15, alignItems: "center", borderWidth: 1, borderColor: "#5C2323" },
  signOutText: { color: "#F87171", fontWeight: "600", fontSize: 15 },
});
