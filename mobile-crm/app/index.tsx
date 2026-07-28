import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

/** Entry route -- redirects to /login or /(app) once the stored token (if any) has been checked. */
export default function Index() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/(app)" : "/login");
  }, [loading, user]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B14" }}>
      <ActivityIndicator color="#5B3DF5" size="large" />
    </View>
  );
}
