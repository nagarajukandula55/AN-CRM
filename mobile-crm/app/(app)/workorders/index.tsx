import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { listJobSheets, type JobSheet } from "@/api/crm";

const ACCENT = "#5B3DF5";
const FILTERS = ["ALL", "CREATED", "REPAIR_IN_PROGRESS", "PART_PENDING", "REPAIR_COMPLETED", "CLOSED"];

export default function WorkordersScreen() {
  const [jobs, setJobs] = useState<JobSheet[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (activeFilter: string) => {
    try {
      const data = await listJobSheets(activeFilter);
      setJobs(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load(filter);
    }, [filter, load])
  );

  return (
    <View style={styles.screen}>
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, filter === item && styles.filterChipActive]}
            onPress={() => setFilter(item)}
          >
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        )}
      />
      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j._id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} tintColor={ACCENT} />}
          ListEmptyComponent={<Text style={styles.empty}>No workorders found.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/(app)/workorders/${item._id}`)}>
              <View>
                <Text style={styles.rowNumber}>{item.jobSheetNumber}</Text>
                <Text style={styles.rowMeta}>{item.customerName || "—"} · {item.customerPhone || ""}</Text>
              </View>
              <Text style={styles.rowStatus}>{item.status.replace(/_/g, " ")}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  filterBar: { paddingVertical: 12, flexGrow: 0 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "#16161F", borderWidth: 1, borderColor: "#26263A" },
  filterChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  filterText: { color: "#9A9AB0", fontSize: 12, fontWeight: "600" },
  filterTextActive: { color: "#fff" },
  empty: { color: "#6B6B80", textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16161F", borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  rowNumber: { color: "#fff", fontWeight: "600", fontSize: 14 },
  rowMeta: { color: "#9A9AB0", fontSize: 12, marginTop: 2 },
  rowStatus: { color: ACCENT, fontSize: 11, fontWeight: "600" },
});
