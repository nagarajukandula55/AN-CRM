import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { getLedgerParty, type LedgerPartyDetail } from "@/api/ledger";

const ACCENT = "#2563EB";

export default function LedgerPartyScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<LedgerPartyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const data = await getLedgerParty(decodeURIComponent(key));
      setDetail(data);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Couldn't load this party's ledger.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.name}>{detail.party.name}</Text>
      {detail.party.phone ? <Text style={styles.phone}>{detail.party.phone}</Text> : null}

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Closing Balance</Text>
        <Text style={[styles.balanceValue, detail.closingBalance > 0 ? styles.due : styles.clear]}>
          ₹{Math.abs(detail.closingBalance).toLocaleString("en-IN")}
          {detail.closingBalance > 0 ? " due" : detail.closingBalance < 0 ? " advance" : ""}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Transactions</Text>
      {detail.transactions.length === 0 ? (
        <Text style={styles.empty}>No transactions.</Text>
      ) : (
        detail.transactions.map((t, i) => (
          <View key={i} style={styles.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.txType}>{t.type} · {t.reference}</Text>
              <Text style={styles.txDate}>{new Date(t.date).toLocaleDateString("en-IN")}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.txAmount, t.amount < 0 ? styles.clear : styles.due]}>
                {t.amount < 0 ? "-" : "+"}₹{Math.abs(t.amount).toLocaleString("en-IN")}
              </Text>
              <Text style={styles.txBalance}>Bal ₹{t.balance.toLocaleString("en-IN")}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  center: { flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" },
  back: { color: ACCENT, fontSize: 14, fontWeight: "600" },
  empty: { color: "#6B6B80" },
  name: { color: "#fff", fontSize: 20, fontWeight: "700" },
  phone: { color: "#9A9AB0", fontSize: 13, marginTop: 2 },
  balanceCard: { backgroundColor: "#16161F", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#26263A", marginTop: 16, marginBottom: 20 },
  balanceLabel: { color: "#9A9AB0", fontSize: 12 },
  balanceValue: { fontSize: 22, fontWeight: "700", marginTop: 4 },
  due: { color: "#F87171" },
  clear: { color: "#4ADE80" },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "600", marginBottom: 10 },
  txRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#16161F", borderRadius: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  txType: { color: "#fff", fontSize: 13, fontWeight: "600" },
  txDate: { color: "#9A9AB0", fontSize: 11.5, marginTop: 2 },
  txAmount: { fontSize: 13, fontWeight: "700" },
  txBalance: { color: "#6B6B80", fontSize: 11, marginTop: 2 },
});
