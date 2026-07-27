/**
 * Multi-provider AI orchestrator with failover.
 *
 * Tries providers in priority order, skipping any that aren't configured
 * (missing API key), and moving to the next configured provider on any
 * failure (network error, non-2xx response -- covers rate-limits/quota
 * exhaustion without needing per-provider error parsing). Returns as soon as
 * one succeeds; if all configured providers fail (or none are configured),
 * returns an error object describing what was tried -- callers should
 * handle this gracefully, nothing here throws.
 *
 * Credentials come from two places, in this order: a per-business
 * AI-provider Integration record (see src/models/Integration.ts,
 * AI_PROVIDER_KEYS) fetched by callers via loadBusinessCredentials(), or --
 * when no businessId/record is given, e.g. this app's own background jobs
 * like ops-report -- process.env. This lets AN Dev Studio and any other app
 * fetch a business's configured keys through /api/ai/hub/complete without
 * ANgroup itself needing separate env vars per provider per deployment.
 */

import Integration, { AiProviderConfig } from "@/models/Integration";

export interface AIProvider {
  name: string;
  isConfigured(creds: Record<string, string>): boolean;
  call(creds: Record<string, string>, prompt: string, systemPrompt?: string): Promise<string>;
}

type FailoverResult = { text: string; providerUsed: string } | { error: string };

async function chatCompletionCall(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} request failed: ${res.status} ${res.statusText} ${body}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${url} response had no content`);
  return text;
}

class GroqProvider implements AIProvider {
  name = "groq";
  isConfigured(creds: Record<string, string>) {
    return !!(creds.apiKey || process.env.GROQ_API_KEY);
  }
  call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    return chatCompletionCall(
      "https://api.groq.com/openai/v1/chat/completions",
      creds.apiKey || process.env.GROQ_API_KEY!,
      creds.model || "llama-3.1-8b-instant",
      prompt,
      systemPrompt,
    );
  }
}

class CerebrasProvider implements AIProvider {
  name = "cerebras";
  isConfigured(creds: Record<string, string>) {
    return !!creds.apiKey;
  }
  call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    return chatCompletionCall(
      "https://api.cerebras.ai/v1/chat/completions",
      creds.apiKey,
      creds.model || "llama3.1-8b",
      prompt,
      systemPrompt,
    );
  }
}

class MistralProvider implements AIProvider {
  name = "mistral";
  isConfigured(creds: Record<string, string>) {
    return !!creds.apiKey;
  }
  call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    return chatCompletionCall(
      "https://api.mistral.ai/v1/chat/completions",
      creds.apiKey,
      creds.model || "mistral-small-latest",
      prompt,
      systemPrompt,
    );
  }
}

class CloudflareProvider implements AIProvider {
  name = "cloudflare";
  isConfigured(creds: Record<string, string>) {
    return !!(creds.apiKey && creds.accountId);
  }
  async call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    const model = creds.model || "@cf/meta/llama-3.1-8b-instruct";
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt },
          ],
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cloudflare request failed: ${res.status} ${res.statusText} ${body}`);
    }
    const data = await res.json();
    const text = data?.result?.response;
    if (!text) throw new Error("Cloudflare response had no content");
    return text;
  }
}

class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  isConfigured(creds: Record<string, string>) {
    return !!(creds.apiKey || process.env.OPENROUTER_API_KEY);
  }
  call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    return chatCompletionCall(
      "https://openrouter.ai/api/v1/chat/completions",
      creds.apiKey || process.env.OPENROUTER_API_KEY!,
      creds.model || "meta-llama/llama-3.1-8b-instruct:free",
      prompt,
      systemPrompt,
    );
  }
}

class GeminiProvider implements AIProvider {
  name = "gemini";
  isConfigured(creds: Record<string, string>) {
    return !!(creds.apiKey || process.env.GEMINI_API_KEY);
  }
  async call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    const apiKey = creds.apiKey || process.env.GEMINI_API_KEY;
    const model = creds.model || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini request failed: ${res.status} ${res.statusText} ${body}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response had no content");
    return text;
  }
}

class HuggingFaceProvider implements AIProvider {
  name = "huggingface";
  isConfigured(creds: Record<string, string>) {
    return !!creds.apiKey;
  }
  async call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    const model = creds.model || "meta-llama/Llama-3.1-8B-Instruct";
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HuggingFace request failed: ${res.status} ${res.statusText} ${body}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("HuggingFace response had no content");
    return text;
  }
}

class OllamaProvider implements AIProvider {
  name = "ollama";
  isConfigured(creds: Record<string, string>) {
    return !!creds.baseUrl;
  }
  async call(creds: Record<string, string>, prompt: string, systemPrompt?: string) {
    const res = await fetch(`${creds.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: creds.model || "llama3.1",
        stream: false,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText} ${body}`);
    }
    const data = await res.json();
    const text = data?.message?.content;
    if (!text) throw new Error("Ollama response had no content");
    return text;
  }
}

const PROVIDER_REGISTRY: Record<string, AIProvider> = {
  GROQ: new GroqProvider(),
  CEREBRAS: new CerebrasProvider(),
  MISTRAL: new MistralProvider(),
  CLOUDFLARE: new CloudflareProvider(),
  OPENROUTER: new OpenRouterProvider(),
  GEMINI: new GeminiProvider(),
  HUGGINGFACE: new HuggingFaceProvider(),
  OLLAMA: new OllamaProvider(),
};

/** Default order — mirrors AN Dev Studio's own ProviderManager fallback chain. */
const DEFAULT_ORDER = ["OLLAMA", "GROQ", "CEREBRAS", "MISTRAL", "CLOUDFLARE", "OPENROUTER", "GEMINI", "HUGGINGFACE"];

export interface BusinessCredentials {
  provider: string;
  credentials: Record<string, string>;
  priority?: number;
}

/** Loads active AI-provider Integration records for a business, ready to hand to callAIWithFailover(). */
export async function loadBusinessCredentials(businessId: string): Promise<BusinessCredentials[]> {
  const docs = await Integration.find({
    businessId,
    provider: { $in: Object.keys(PROVIDER_REGISTRY) },
    isActive: true,
  }).lean();

  return docs.map((d) => {
    const cfg = d.config as AiProviderConfig;
    return { provider: d.provider, credentials: cfg?.credentials || {}, priority: cfg?.priority };
  });
}

export async function callAIWithFailover(
  prompt: string,
  systemPrompt?: string,
  businessCreds: BusinessCredentials[] = [],
): Promise<FailoverResult> {
  const byProvider = new Map(businessCreds.map((c) => [c.provider, c]));

  const order = [...businessCreds]
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    .map((c) => c.provider)
    .concat(DEFAULT_ORDER.filter((p) => !byProvider.has(p)));

  const candidates = order
    .map((key) => ({ key, provider: PROVIDER_REGISTRY[key], creds: byProvider.get(key)?.credentials || {} }))
    .filter((c) => c.provider && c.provider.isConfigured(c.creds));

  if (candidates.length === 0) {
    return {
      error:
        "No AI provider is configured. Add credentials for at least one provider " +
        "(Groq, Cerebras, Mistral, Cloudflare, OpenRouter, Gemini, HuggingFace, or a local Ollama URL) " +
        "under Integrations → AI, or set GROQ_API_KEY/GEMINI_API_KEY/OPENROUTER_API_KEY in the environment.",
    };
  }

  const failures: string[] = [];

  for (const { key, provider, creds } of candidates) {
    try {
      const text = await provider.call(creds, prompt, systemPrompt);
      return { text, providerUsed: key.toLowerCase() };
    } catch (err: any) {
      const reason = err?.message || String(err);
      console.error(`[ai-orchestrator] provider "${key}" failed: ${reason}`);
      failures.push(`${key}: ${reason}`);
    }
  }

  return { error: `All configured AI providers failed. ${failures.join(" | ")}` };
}
