import { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { getProductBySlug } from "@/api/products";
import { useCart } from "@/context/CartContext";

export default function ProductDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [product, setProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cart = useCart();

  useEffect(() => {
    if (!slug) return;
    getProductBySlug(slug)
      .then((data) => setProduct(data?.product || data))
      .catch((err) => setError(err?.message || "Failed to load product"))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "Product not found"}</Text>
      </View>
    );
  }

  const price = product.pricing?.sellingPrice ?? product.basePrice ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {product.images?.[0] && <Image source={{ uri: product.images[0] }} style={styles.image} />}
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.price}>₹{price.toLocaleString("en-IN")}</Text>
      {product.description && <Text style={styles.description}>{product.description}</Text>}
      <Pressable
        style={styles.button}
        onPress={() =>
          cart.add({
            id: product.id,
            name: product.name,
            price,
            image: product.images?.[0],
            weightKg: Number(product.weightKg || 0),
          })
        }
      >
        <Text style={styles.buttonText}>Add to Cart</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "#dc2626", fontWeight: "600" },
  container: { padding: 16, gap: 8 },
  image: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: "#f3f4f6" },
  name: { fontSize: 20, fontWeight: "700", marginTop: 8 },
  price: { fontSize: 18, fontWeight: "600", color: "#111827" },
  description: { fontSize: 14, color: "#4b5563", marginTop: 8, lineHeight: 20 },
  button: { backgroundColor: "#111827", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
