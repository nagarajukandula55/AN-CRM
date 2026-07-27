import { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getOrderById, getTimeline } from "@/api/orders";

interface TimelineEvent {
  status?: string;
  label?: string;
  message?: string;
  createdAt?: string;
  date?: string;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getOrderById(id), getTimeline(id)])
      .then(([orderData, timelineData]) => {
        setOrder(orderData?.order || orderData);
        const events = timelineData?.timeline?.length
          ? timelineData.timeline
          : timelineData?.statusHistory?.length
          ? timelineData.statusHistory
          : timelineData?.events || [];
        setTimeline(events);
      })
      .catch((err) => setError(err?.message || "Failed to load order"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "Order not found"}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={order.cart || []}
      keyExtractor={(item, i) => item.productKey || item.name || String(i)}
      ListHeaderComponent={
        <>
          <Text style={styles.orderId}>{order.orderId}</Text>
          <Text style={styles.status}>{order.status}</Text>
          {order.isBulkOrder && (
            <View style={styles.bulkBanner}>
              <Text style={styles.bulkBannerTitle}>Bulk order</Text>
              {order.billingRevision?.status === "SHARED" ? (
                <Text style={styles.bulkBannerText}>
                  Revised total: ₹{Number(order.billingRevision.revisedAmount || 0).toLocaleString("en-IN")}
                  {order.billingRevision.revisedShippingCharges
                    ? ` + ₹${Number(order.billingRevision.revisedShippingCharges).toLocaleString("en-IN")} shipping`
                    : ""}
                  {order.billingRevision.notes ? `\n${order.billingRevision.notes}` : ""}
                </Text>
              ) : (
                <Text style={styles.bulkBannerText}>
                  Awaiting revised pricing and shipping charges — we'll notify you once ready.
                </Text>
              )}
            </View>
          )}
          <Text style={styles.sectionTitle}>Items</Text>
        </>
      }
      renderItem={({ item }) => (
        <View style={styles.itemRow}>
          <Text style={styles.itemName}>{item.name || item.productKey} × {item.qty || 1}</Text>
          <Text style={styles.itemPrice}>₹{Number(item.lineTotal || 0).toLocaleString("en-IN")}</Text>
        </View>
      )}
      ListFooterComponent={
        <>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{Number(order.amount || 0).toLocaleString("en-IN")}</Text>
          </View>

          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Text style={styles.addressText}>
            {order.address?.name}{"\n"}
            {order.address?.address}{order.address?.landmark ? `, ${order.address.landmark}` : ""}{"\n"}
            {order.address?.city}, {order.address?.state} - {order.address?.pincode}{"\n"}
            {order.address?.phone}
          </Text>

          {timeline.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Tracking</Text>
              {timeline.map((event, i) => (
                <View key={i} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>{event.label || event.status}</Text>
                    {event.message && <Text style={styles.timelineMessage}>{event.message}</Text>}
                    {(event.createdAt || event.date) && (
                      <Text style={styles.timelineDate}>{new Date(event.createdAt || event.date!).toLocaleString("en-IN")}</Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "#dc2626" },
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  orderId: { fontSize: 18, fontWeight: "700" },
  status: { fontSize: 13, color: "#6b7280", marginTop: 2, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderColor: "#f3f4f6" },
  itemName: { flex: 1, fontSize: 13 },
  itemPrice: { fontSize: 13, fontWeight: "600" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: "#e5e7eb" },
  totalLabel: { fontSize: 15, fontWeight: "600" },
  totalValue: { fontSize: 15, fontWeight: "700" },
  addressText: { fontSize: 13, color: "#374151", lineHeight: 20 },
  timelineRow: { flexDirection: "row", marginBottom: 12 },
  timelineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#111827", marginTop: 5, marginRight: 10 },
  timelineContent: { flex: 1 },
  timelineLabel: { fontSize: 13, fontWeight: "600" },
  timelineMessage: { fontSize: 12, color: "#6b7280", marginTop: 1 },
  timelineDate: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  bulkBanner: { backgroundColor: "#fef3c7", borderRadius: 10, padding: 12, marginBottom: 12 },
  bulkBannerTitle: { fontSize: 13, fontWeight: "700", color: "#92400e" },
  bulkBannerText: { fontSize: 13, color: "#92400e", lineHeight: 18, marginTop: 4 },
});
