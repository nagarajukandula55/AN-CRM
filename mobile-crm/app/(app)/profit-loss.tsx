import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { getProfitLoss, type ProfitLossReport } from "@/api/profitLoss";

const ACCENT = "#5B3DF5";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const RANGES: { label: string; days: number }[] = [
  { label: "This Month", days: -1 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
];

export default function ProfitLossScreen() {
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(0);

  const load = useCallback(async (idx: number) => {
    setLoading(true);
    try {
      const now = new Date();
      let from: Date;
      const range = RANGES[idx];
      if (range.days === -1) {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        from = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
      }
      const data = await getProfitLoss(isoDate(from), isoDate(now));
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(rangeIdx); }, [rangeIdx, load]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Profit & Loss</Text>
      <Text style={styles.sub}>Cash-basis P&L: Revenue − Cost of Goods − Expenses.</Text>

      <View style={styles.rangeRow}>
        {RANGES.map((r, i) => (
          <TouchableOpacity key={r.label} style={[styles.rangeChip, rangeIdx === i && styles.rangeChipActive]} onPress={() => setRangeIdx(i)}>
            <Text style={[styles.rangeText, rangeIdx === i && styles.rangeTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : !report ? (
        <Text style={styles.empty}>Couldn't load the report.</Text>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Row label="Revenue" value={report.revenue} />
            <Row label="Cost of Goods (COGS)" value={-report.cogs} muted />
            <Divider />
            <Row label="Gross Profit" value={report.grossProfit} bold />
            <Row label="Expenses" value={-report.expenses} muted />
            <Divider />
            <Row label="Net Profit" value={report.netProfit} bold highlight={report.netProfit >= 0} />
          </View>

          <Text style={styles.sectionTitle}>Expenses by Category</Text>
          <View style={styles.summaryCard}>
            {Object.entries(report.expenseByCategory)
              .filter(([, amt]) => amt > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amt]) => (
                <Row key={cat} label={cat} value={-amt} muted />
              ))}
            {Object.values(report.expenseByCategory).every((v) => v === 0) && (
              <Text style={styles.empty}>No expenses in this range.</Text>
            )}
          </View>

          <Text style={styles.footerNote}>{report.invoiceCount} invoice{report.invoiceCount === 1 ? "" : "s"} in range · {new Date(report.range.from).toLocaleDateString("en-IN")} – {new Date(report.range.to).toLocaleDateString("en-IN")}</Text>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, bold, muted, highlight }: { label: string; value: number; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  const negative = value < 0;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.bold, muted && styles.muted]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, negative && styles.negative, highlight && styles.positive]}>
        {negative ? "-" : ""}₹{Math.abs(value).toLocaleString("en-IN")}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  back: { color: ACCENT, fontSize: 14, fontWeight: "600" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  sub: { color: "#9A9AB0", fontSize: 12.5, marginTop: 4, marginBottom: 16 },
  rangeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  rangeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#16161F", borderWidth: 1, borderColor: "#26263A" },
  rangeChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  rangeText: { color: "#9A9AB0", fontSize: 12, fontWeight: "600" },
  rangeTextActive: { color: "#fff" },
  summaryCard: { backgroundColor: "#16161F", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#26263A", marginBottom: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { color: "#9A9AB0", fontSize: 13 },
  rowValue: { color: "#fff", fontSize: 13, fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700", fontSize: 14.5 },
  muted: { color: "#6B6B80" },
  negative: { color: "#F87171" },
  positive: { color: "#4ADE80" },
  divider: { height: 1, backgroundColor: "#26263A", marginVertical: 6 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "600", marginBottom: 10 },
  empty: { color: "#6B6B80", fontSize: 13, textAlign: "center", paddingVertical: 8 },
  footerNote: { color: "#6B6B80", fontSize: 11, textAlign: "center", marginBottom: 30 },
});
