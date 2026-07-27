import AnuKnowledge from "@/models/AnuKnowledge";

/**
 * Auto-teaches ANu whenever an integration or AI provider gets configured,
 * instead of relying only on an admin manually using "Teach ANu" (the
 * widget's quick-add) or a code deploy to STATIC_KNOWLEDGE. Called
 * best-effort from the routes that actually save this state (api/
 * integrations/route.ts, api/ai/providers/route.ts) — must never break the
 * save itself if this fails, same convention as notification.service.ts.
 *
 * Upserts by {businessId, topic} so repeatedly toggling the same
 * integration on/off updates one entry instead of accumulating stale
 * duplicates in ANu's context.
 */
async function upsertKnowledge(businessId: string, topic: string, summary: string) {
  try {
    await AnuKnowledge.findOneAndUpdate(
      { businessId, topic },
      { $set: { summary, addedBy: "system:auto-learn" } },
      { upsert: true }
    );
  } catch (err) {
    console.error("[anu-auto-learn] failed to upsert knowledge:", err);
  }
}

export async function learnIntegrationStatus({
  businessId,
  provider,
  isActive,
}: {
  businessId: string;
  provider: string;
  isActive: boolean;
}) {
  const topic = `Integration: ${provider}`;
  const summary = isActive
    ? `The ${provider} integration is connected and active for this business — it can be used for the features it supports (e.g. notifications, messaging, or email depending on the provider). Configured under Settings > Integrations.`
    : `The ${provider} integration has been configured for this business but is currently turned off (not active). An admin can re-enable it under Settings > Integrations.`;
  await upsertKnowledge(businessId, topic, summary);
}

export async function learnAiProviderStatus({
  businessId,
  provider,
  isEnabled,
}: {
  businessId: string;
  provider: string;
  isEnabled: boolean;
}) {
  const topic = `AI Provider: ${provider}`;
  const summary = isEnabled
    ? `The ${provider} AI provider is enabled for this business (configured under Settings > AI) and can be used for AI Studio content/image generation and, if it's Anthropic or OpenAI, for ANu (this assistant) itself.`
    : `The ${provider} AI provider has an API key saved for this business but is currently disabled. An admin can re-enable it under Settings > AI.`;
  await upsertKnowledge(businessId, topic, summary);
}
