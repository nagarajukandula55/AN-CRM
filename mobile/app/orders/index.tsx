import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getMyOrders } from "@/api/orders";
import { useAuth } from "@/context/AuthContext";

interface Order {
  orderId: string;
  amount: number;
  status: string;
  createdAt?: string;
  cart?: { name?: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  CREATED: "#f59e0b",
  PAID: "#10b981",
  SHIPPED: "#3b82f6",
  DELIVERED: "#10b981",
  CANCELLED: "#dc2626",
};

export default function OrdersScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) return;
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      getMyOrders()
        .then((data) => setOrders(data?.orders || []))
        .catch((err) => setError(err?.message || "Failed to load orders"))
        .finally(() => setLoading(false));
    }, [user, authLoading])
  );

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Sign in to see your orders.</Text>
        <Pressable style={styles.loginButton} onPress={() => router.push("/login")}>
          <Text style={styles.loginText}>Sign In</Text>
        </Pressable>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.orderId}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No orders yet.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/orders/${item.orderId}`)}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderId}>{item.orderId}</Text>
            <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[item.status] || "#6b7280") + "22" }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] || "#6b7280" }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.items} numberOfLines={1}>
            {item.cart?.map((c) => c.name).filter(Boolean).join(", ") || `${item.cart?.length || 0} item(s)`}
          </Text>
          <Text style={styles.amount}>₹{Number(item.amount || 0).toLocaleString("en-IN")}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  list: { padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  orderId: { fontWeight: "700", fontSize: 13 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  items: { fontSize: 12, color: "#6b7280", marginBottom: 4 },
  amount: { fontSize: 15, fontWeight: "700" },
  emptyText: { color: "#6b7280", marginBottom: 12 },
  errorText: { color: "#dc2626" },
  loginButton: { backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  loginText: { color: "#fff", fontWeight: "600" },
});
