import { useEffect, useState } from "react";
import { View, Text, FlatList, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { getProducts } from "@/api/products";

interface Product {
  id: string;
  name: string;
  slug: string;
  images?: string[];
  basePrice?: number;
  pricing?: { sellingPrice?: number };
}

export default function HomeScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProducts({ limit: 40 })
      .then((data) => setProducts(data?.products || data?.data || []))
      .catch((err) => setError(err?.message || "Failed to load products"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorHint}>Check app.json's extra.anApiUrl / anBusinessId.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id}
      numColumns={2}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={
        <View style={styles.nav}>
          <Link href="/cart" asChild>
            <Pressable><Text style={styles.navLink}>Cart</Text></Pressable>
          </Link>
          <Link href="/orders" asChild>
            <Pressable><Text style={styles.navLink}>Orders</Text></Pressable>
          </Link>
          <Link href="/wishlist" asChild>
            <Pressable><Text style={styles.navLink}>Wishlist</Text></Pressable>
          </Link>
          <Link href="/profile" asChild>
            <Pressable><Text style={styles.navLink}>Profile</Text></Pressable>
          </Link>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text>No products found.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const price = item.pricing?.sellingPrice ?? item.basePrice ?? 0;
        return (
          <Link href={`/product/${item.slug}`} asChild>
            <Pressable style={styles.card}>
              {item.images?.[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]} />
              )}
              <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
              <Text style={styles.price}>₹{price.toLocaleString("en-IN")}</Text>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "#dc2626", fontWeight: "600", textAlign: "center" },
  errorHint: { color: "#6b7280", fontSize: 12, marginTop: 8, textAlign: "center" },
  list: { padding: 8 },
  row: { gap: 8 },
  nav: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 10, marginBottom: 4, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  navLink: { fontSize: 13, fontWeight: "600", color: "#111827" },
  card: { flex: 1, margin: 4, backgroundColor: "#fff", borderRadius: 12, padding: 8, borderWidth: 1, borderColor: "#e5e7eb" },
  image: { width: "100%", aspectRatio: 1, borderRadius: 8, backgroundColor: "#f3f4f6" },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  name: { marginTop: 6, fontSize: 13, fontWeight: "500" },
  price: { marginTop: 2, fontSize: 14, fontWeight: "700" },
});
