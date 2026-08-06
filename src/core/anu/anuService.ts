import type { AnuQueryInput, AnuQueryResult } from "./types";
import { buildAnuContext, localAnswer } from "./knowledgeBase";
import { getSharedIntegration } from "@/lib/centralApiRead";

/**
 * ANu's provider call layer. Deliberately thin: resolve which providers this
 * business has configured (via the EXISTING AIConfig model — reused, not
 * duplicated, same as the rest of this rebuild's "reuse what already works"
 * principle), call them in priority order, return a normalized result.
 * Swapping/adding a provider later means editing this file only —
 * anuService's callers (the API route, any future UI) never see
 * provider-specific shapes.
 *
 * Providers are tried in order — Anthropic, OpenAI, Google, OpenRouter —
 * falling through to the next enabled+keyed provider whenever a call fails
 * (rate limit, exhausted free-tier quota, transient error, ...), so a
 * business with several providers configured doesn't go dark the moment
 * one hits its limit. If none are configured or all fail, ANu returns a
 * clear error rather than silently no-opping — so the UI can prompt an
 * admin to add an API key in Settings > AI instead of looking broken.
 */

async function callAnthropic(apiKey: string, model: string, systemPrompt: string, messages: AnuQueryInput["messages"]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Anthropic API returned no content.");
  return text;
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, messages: AnuQueryInput["messages"]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI API returned no content.");
  return text;
}

async function callGoogle(apiKey: string, model: string, systemPrompt: string, messages: AnuQueryInput["messages"]): Promise<string> {
  const modelName = model || "gemini-1.5-pro";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Google API returned no content.");
  return text;
}

async function callOpenRouter(apiKey: string, model: string, systemPrompt: string, messages: AnuQueryInput["messages"]): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter API returned no content.");
  return text;
}

type ProviderName = "anthropic" | "openai" | "google" | "openrouter";

export async function askAnu(input: AnuQueryInput): Promise<AnuQueryResult> {
  const systemPrompt = await buildAnuContext(input.businessId, input.language);

  // Central-api is now the ONLY source for Anu's AI credentials -- per
  // explicit direction, every integration (including AI) is managed
  // centrally across every AN Group site, full stop. This app's local
  // AIConfig model is no longer read here at all; a business that wants
  // its own distinct AI provider/key gets that via a business-specific
  // override on central-api's dashboard (routes/integrations.js's
  // businessId-scoped GET/PUT), the platform-wide "ANU_AI" default
  // otherwise. AIConfig is still used for the separate AI Studio
  // image-generation feature, untouched here.
  const chain: Array<{ name: ProviderName; call: () => Promise<string> }> = [];

  const shared = await getSharedIntegration<{ provider?: ProviderName; apiKey?: string; model?: string }>(
    "ANU_AI",
    input.businessId
  );
  if (shared?.apiKey && shared?.provider) {
    const callers: Record<ProviderName, (key: string, model: string) => Promise<string>> = {
      anthropic: (key, model) => callAnthropic(key, model, systemPrompt, input.messages),
      openai: (key, model) => callOpenAI(key, model, systemPrompt, input.messages),
      google: (key, model) => callGoogle(key, model, systemPrompt, input.messages),
      openrouter: (key, model) => callOpenRouter(key, model, systemPrompt, input.messages),
    };
    const caller = callers[shared.provider];
    if (caller) {
      chain.push({ name: shared.provider, call: () => caller(shared.apiKey!, shared.model!) });
    }
  }

  const failures: string[] = [];
  for (const provider of chain) {
    try {
      const reply = await provider.call();
      return { reply, provider: provider.name };
    } catch (err: any) {
      // Exhausted quota, rate limit, transient error, etc. — move on to the
      // next configured provider instead of failing the whole request.
      failures.push(`${provider.name}: ${err?.message || "unknown error"}`);
    }
  }

  // No LLM provider configured (or all configured ones failed) -- fall back
  // to local keyword retrieval over the same knowledge base instead of hard
  // erroring. Not the deferred "locally-hosted model" path (see
  // types.ts's decision note) -- plain text matching, no model involved.
  const lastUserMessage = [...input.messages].reverse().find((m) => m.role === "user");
  const localReply = lastUserMessage ? await localAnswer(input.businessId, lastUserMessage.content) : null;
  if (localReply) {
    return { reply: localReply, provider: "none" };
  }

  if (failures.length > 0) {
    return {
      reply: "",
      provider: "none",
      error: `Every configured AI provider failed to answer this. (${failures.join("; ")})`,
    };
  }

  return {
    reply: "",
    provider: "none",
    error:
      "I don't have anything on that yet. Add an Anthropic, OpenAI, Google, or OpenRouter API key from Admin > AI Studio (not Settings — that page only shows status) for full conversational answers, or teach me about this from the graduation-cap icon.",
  };
}
