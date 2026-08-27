import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { listLedgerParties, type LedgerParty } from "@/api/ledger";

const ACCENT = "#2563EB";

export default function LedgerScreen() {
  const [parties, setParties] = useState<LedgerParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listLedgerParties();
      setParties(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Ledger Book</Text>
        <Text style={styles.subtitle}>Party-wise outstanding balance</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={parties}
          keyExtractor={(p) => p.key}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ACCENT} />}
          ListEmptyComponent={<Text style={styles.empty}>No customer transactions yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/(app)/ledger/${encodeURIComponent(item.key)}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
              </View>
              <Text style={[styles.balance, item.balance > 0 ? styles.balanceDue : styles.balanceClear]}>
                ₹{Math.abs(item.balance).toLocaleString("en-IN")}
                {item.balance > 0 ? " due" : item.balance < 0 ? " advance" : ""}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  header: { padding: 16, paddingBottom: 10 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  subtitle: { color: "#9A9AB0", fontSize: 12, marginTop: 3 },
  empty: { color: "#6B6B80", textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16161F", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  name: { color: "#fff", fontWeight: "600", fontSize: 14 },
  phone: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  balance: { fontSize: 13, fontWeight: "700" },
  balanceDue: { color: "#F87171" },
  balanceClear: { color: "#4ADE80" },
});
