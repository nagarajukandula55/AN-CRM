import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/core/db/mongodb";
import { askAnu } from "@/core/anu/anuService";
import type { AnuMessage } from "@/core/anu/types";
import AnuInteractionLog from "@/models/AnuInteractionLog";

// POST /api/anu — ask ANu (the in-house AI assistant) a question, grounded
// in this business's actual enabled modules and platform knowledge. Body:
// { businessId: string, messages: AnuMessage[], language?: string } where
// messages is the full conversation so far (oldest first, caller owns
// history/trimming) and language is an optional explicit reply-language
// override (e.g. "Hindi") — omit it to have ANu auto-match whatever
// language the user's own message is written in.
export async function POST(req: NextRequest) {
  try {
    const h = await headers();
    const userId = h.get("x-user-id");
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const businessId: string | undefined = body?.businessId;
    const messages: AnuMessage[] | undefined = body?.messages;
    const language: string | undefined = body?.language;

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages is required and must be non-empty" }, { status: 400 });
    }

    await connectDB();
    const result = await askAnu({ businessId, userId, messages, language });

    if (result.error) {
      // Not a 500 — this is an expected "not configured yet" state, not a
      // server failure, so the UI can show a friendly setup prompt.
      return NextResponse.json({ success: false, error: result.error }, { status: 200 });
    }

    // Best-effort, fire-and-forget: this is the "natural learning" memory
    // trail buildAnuContext() reads back in on future questions -- must
    // never block or fail the actual reply if the write hiccups.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) {
      AnuInteractionLog.create({
        businessId,
        userId,
        question: lastUserMessage.content,
        answer: result.reply,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, reply: result.reply, provider: result.provider });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
