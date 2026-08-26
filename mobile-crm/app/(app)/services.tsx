import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from "react-native";
import { useSubscription } from "@/context/SubscriptionContext";
import { PLANS, TIER_RANK, type PlanKey } from "@/data/plans";
import Constants from "expo-constants";

const ACCENT = "#5B3DF5";
const AN_CRM_API = (Constants.expoConfig?.extra?.anCrmApiUrl as string) || "";

/**
 * "Services we are offering" -- what AN-CRM sells (2-tier Pro/Ultimate,
 * SC is the only operating mode now), shown against what this vendor
 * already has. Upgrading itself stays on the web app's Razorpay Checkout
 * (see README's native-checkout gap) -- this screen deep-links to
 * /vendor/billing rather than half-building payment UI natively.
 */
export default function ServicesScreen() {
  const { billing, loading } = useSubscription();
  const [opening, setOpening] = useState(false);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  const blocked = billing?.status === "EXPIRED" || billing?.status === "NOT_SET";
  const currentTier = (billing?.subscription?.planKey as PlanKey) || "BASIC";
  const currentRank = TIER_RANK[currentTier] ?? -1;

  async function openWebPlanPage() {
    setOpening(true);
    try {
      await Linking.openURL(`${AN_CRM_API}/vendor/billing`);
    } finally {
      setOpening(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Services</Text>
      <Text style={styles.sub}>Service Center plans -- what you have and what you can add.</Text>

      {blocked && (
        <View style={styles.warnCard}>
          <Text style={styles.warnText}>
            {billing?.status === "NOT_SET" ? "You have no active plan yet -- subscribe below to unlock the portal." : "Your subscription has expired -- renew below to restore access."}
          </Text>
        </View>
      )}

      {PLANS.map((plan) => {
        const rank = TIER_RANK[plan.key];
        const isCurrent = plan.key === currentTier && !blocked;
        const isIncluded = rank <= currentRank && !blocked;
        return (
          <View key={plan.key} style={[styles.card, isCurrent && styles.cardCurrent]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{plan.name}</Text>
              {isCurrent ? (
                <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Your Plan</Text></View>
              ) : (
                <Text style={styles.cardPrice}>₹{plan.monthlyPriceINR.toLocaleString("en-IN")}/mo</Text>
              )}
            </View>
            {plan.features.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Text style={[styles.featureDot, isIncluded && styles.featureDotActive]}>{isIncluded ? "✓" : "○"}</Text>
                <Text style={[styles.featureText, !isIncluded && styles.featureTextLocked]}>{f}</Text>
              </View>
            ))}
            {plan.hasCommsQuota && (
              <Text style={styles.commsNote}>Includes bundled WhatsApp customer notifications</Text>
            )}
            {(!isCurrent && (rank > currentRank || blocked)) && (
              <TouchableOpacity style={styles.upgradeButton} onPress={openWebPlanPage} disabled={opening}>
                <Text style={styles.upgradeButtonText}>{opening ? "Opening…" : `${blocked ? "Subscribe to" : "Upgrade to"} ${plan.name}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      <TouchableOpacity style={styles.manageLink} onPress={openWebPlanPage}>
        <Text style={styles.manageLinkText}>Manage billing & view invoices on the web app →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B0B14" },
  center: { flex: 1, backgroundColor: "#0B0B14", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  sub: { color: "#9A9AB0", fontSize: 13, marginTop: 4, marginBottom: 16 },
  warnCard: { backgroundColor: "#2A1414", borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#5C2323" },
  warnText: { color: "#F87171", fontSize: 13 },
  card: { backgroundColor: "#16161F", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#26263A", marginBottom: 14 },
  cardCurrent: { borderColor: ACCENT },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cardPrice: { color: "#9A9AB0", fontSize: 13 },
  currentBadge: { backgroundColor: "#221A45", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  currentBadgeText: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  featureDot: { color: "#3A3A50", fontSize: 13, width: 16 },
  featureDotActive: { color: "#4ADE80" },
  featureText: { color: "#D0D0E0", fontSize: 13, flex: 1 },
  featureTextLocked: { color: "#6B6B80" },
  commsNote: { color: "#9A9AB0", fontSize: 11, fontStyle: "italic", marginTop: 4 },
  upgradeButton: { backgroundColor: ACCENT, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 10 },
  upgradeButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  manageLink: { alignItems: "center", paddingVertical: 16 },
  manageLinkText: { color: ACCENT, fontSize: 13, fontWeight: "600" },
});
