import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TextInput, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { listMaterials, type Material } from "@/api/materials";

const ACCENT = "#2563EB";

const PART_TYPE_LABEL: Record<string, string> = {
  SPARE_PART: "Spare Part",
  LABOUR: "Labour",
  CONSUMABLE: "Consumable",
};

/**
 * The Material/BOM catalog, browsable read-only on mobile — the piece
 * flagged as "totally missing." Backed by the same /api/service-center-bom
 * the web Material Catalog page and the engineer repair screen's "Add from
 * Catalog" search both use, so a part code here is always the same part
 * code everywhere. Live stock-quantity tracking (InventoryItem/movements —
 * a separate system from this price/spec catalog) isn't wired into mobile
 * yet; see README.
 */
export default function CatalogScreen() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (search?: string) => {
    try {
      const data = await listMaterials(search);
      setMaterials(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(query); }, []));

  function handleSearch(text: string) {
    setQuery(text);
    setLoading(true);
    load(text);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Catalog</Text>
        <Text style={styles.subtitle}>Material / BOM — part code, HSN, rate, tax</Text>
        <TextInput
          style={styles.search}
          placeholder="Search parts…"
          placeholderTextColor="#6B6B80"
          value={query}
          onChangeText={handleSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={materials}
          keyExtractor={(m) => m._id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(query); }} tintColor={ACCENT} />}
          ListEmptyComponent={<Text style={styles.empty}>No materials found.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.partName}>{item.partName}</Text>
                <Text style={styles.partMeta}>
                  {item.partCode} · {PART_TYPE_LABEL[item.partType] || item.partType} · HSN {item.hsnCode}
                  {item.isSerialized ? " · SN tracked" : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.rate}>₹{item.rate?.toLocaleString("en-IN")}</Text>
                <Text style={styles.gst}>{item.gstRate}% GST</Text>
              </View>
            </View>
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
  subtitle: { color: "#9A9AB0", fontSize: 12, marginTop: 3, marginBottom: 12 },
  search: { backgroundColor: "#16161F", borderRadius: 10, borderWidth: 1, borderColor: "#26263A", color: "#fff", padding: 11, fontSize: 13.5 },
  empty: { color: "#6B6B80", textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#16161F", borderRadius: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: "#26263A" },
  partName: { color: "#fff", fontSize: 13.5, fontWeight: "600" },
  partMeta: { color: "#9A9AB0", fontSize: 11, marginTop: 3 },
  rate: { color: "#fff", fontSize: 13.5, fontWeight: "600", fontVariant: ["tabular-nums"] },
  gst: { color: "#6B6B80", fontSize: 10.5, marginTop: 2 },
});
