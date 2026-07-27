import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";

const BULK_MIN_KG = 10;

export default function CartScreen() {
  const router = useRouter();
  const { items, remove, total, totalWeightKg } = useCart();
  const { user } = useAuth();
  const isBulkEligible = user?.accountType === "BUSINESS" && totalWeightKg >= BULK_MIN_KG;

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text>Your cart is empty.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name} × {item.quantity}</Text>
            <Text style={styles.price}>₹{(item.price * item.quantity).toLocaleString("en-IN")}</Text>
            <Pressable onPress={() => remove(item.id)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
      />
      {user?.accountType === "BUSINESS" && (
        <Text style={styles.weightNote}>
          Order weight: {totalWeightKg.toFixed(1)} kg
          {!isBulkEligible ? ` (bulk pricing applies at ${BULK_MIN_KG}kg+)` : ""}
        </Text>
      )}
      {isBulkEligible && (
        <View style={styles.bulkBanner}>
          <Text style={styles.bulkBannerText}>
            Bulk order ({totalWeightKg.toFixed(1)}kg) — you won't pay now. We'll share revised
            pricing and separate shipping charges after you submit.
          </Text>
        </View>
      )}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{isBulkEligible ? "Estimated Total" : "Total"}</Text>
        <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN")}</Text>
      </View>
      <Pressable style={styles.checkoutButton} onPress={() => router.push("/checkout")}>
        <Text style={styles.checkoutText}>{isBulkEligible ? "Submit Bulk Order" : "Checkout"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderColor: "#f3f4f6" },
  name: { flex: 1, fontSize: 14 },
  price: { fontSize: 14, fontWeight: "600", marginHorizontal: 8 },
  remove: { color: "#dc2626", fontSize: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  totalLabel: { fontSize: 16, fontWeight: "600" },
  totalValue: { fontSize: 16, fontWeight: "700" },
  checkoutButton: { backgroundColor: "#111827", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  checkoutText: { color: "#fff", fontWeight: "600" },
  weightNote: { fontSize: 12, color: "#6b7280", marginTop: 8 },
  bulkBanner: { backgroundColor: "#fef3c7", borderRadius: 10, padding: 12, marginTop: 8 },
  bulkBannerText: { fontSize: 13, color: "#92400e", lineHeight: 18 },
});
