/**
 * ANu — the in-house AI assistant embedded in the platform.
 *
 * DECISION (locked in, see PROGRESS.md): ANu is API-based for now (calls an
 * external LLM API — Anthropic/OpenAI/etc., using the business's configured
 * AIConfig credentials), NOT a locally/offline-hosted model. True local
 * hosting was explicitly deferred to a future phase per negotiation with the
 * user — this phase must not silently try to bundle a local model.
 *
 * ANu's job: answer "how do I..." / "what can I do..." questions about the
 * platform itself (a guide, grounded in this app's actual modules/features —
 * not a generic chatbot), and eventually help drive UI actions (create a
 * module, grant access, etc.) on the user's behalf. This file defines the
 * request/response shape used by core/anu/anuService.ts and the /api/anu
 * route — kept intentionally small so it's easy to swap providers later.
 */

export interface AnuMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AnuQueryInput {
  businessId: string;
  userId: string;
  /** Full conversation so far, oldest first. Caller is responsible for trimming/pagination. */
  messages: AnuMessage[];
  /**
   * Explicit reply language (e.g. "Hindi", "Tamil", "English"), or omitted
   * to auto-detect from the user's own message language. Indian-market
   * platform, many users are far more comfortable asking (and reading
   * answers) in their own language than in English -- this is purely an
   * instruction to the model, no separate translation step or model swap
   * needed since the configured providers already handle this natively.
   */
  language?: string;
}

export interface AnuQueryResult {
  reply: string;
  /** Which underlying provider actually answered (useful for debugging / cost tracking). */
  provider: "anthropic" | "openai" | "google" | "openrouter" | "none";
  /** Set when ANu could not run at all (e.g. no API key configured for this business). */
  error?: string;
}

/**
 * A single fact ANu is told about the platform so it can act as a grounded
 * guide instead of hallucinating features that don't exist. Kept as plain
 * strings (not code) deliberately — this is a knowledge/context list, not an
 * executable action list. Action-taking (letting ANu actually perform
 * changes, not just describe them) is a later phase, out of scope here.
 */
export interface AnuKnowledgeEntry {
  topic: string;
  summary: string;
}
