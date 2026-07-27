import { useCallback, useState } from "react";
import { View, Text, FlatList, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useFocusEffect, useRouter, Link } from "expo-router";
import { getServerWishlist, removeServerWishlistItem } from "@/api/wishlist";
import { useAuth } from "@/context/AuthContext";

interface WishlistItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  image?: string;
}

export default function WishlistScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
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
      getServerWishlist()
        .then(setItems)
        .catch((err) => setError(err?.message || "Failed to load wishlist"))
        .finally(() => setLoading(false));
    }, [user, authLoading])
  );

  async function handleRemove(productId: string) {
    setItems((prev) => prev.filter((i) => i.id !== productId));
    try {
      await removeServerWishlistItem(productId);
    } catch {
      /* best-effort — item stays removed locally even if the server call fails */
    }
  }

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
        <Text style={styles.emptyText}>Sign in to see your wishlist.</Text>
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
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>Your wishlist is empty.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Link href={`/product/${item.slug}`} asChild>
            <Pressable style={styles.rowMain}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.imagePlaceholder]} />
              )}
              <View style={styles.rowText}>
                <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
                <Text style={styles.price}>₹{Number(item.price || 0).toLocaleString("en-IN")}</Text>
              </View>
            </Pressable>
          </Link>
          <Pressable onPress={() => handleRemove(item.id)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  list: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", padding: 10, marginBottom: 10 },
  rowMain: { flexDirection: "row", alignItems: "center", flex: 1 },
  image: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#f3f4f6" },
  imagePlaceholder: {},
  rowText: { marginLeft: 10, flex: 1 },
  name: { fontSize: 13, fontWeight: "500" },
  price: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  remove: { color: "#dc2626", fontSize: 12, marginLeft: 8 },
  emptyText: { color: "#6b7280", marginBottom: 12 },
  errorText: { color: "#dc2626" },
  loginButton: { backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  loginText: { color: "#fff", fontWeight: "600" },
});
