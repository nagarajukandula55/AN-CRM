import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { ChatMessage } from "@/models/ChatMessage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  const since = url.searchParams.get("since") || new Date(Date.now() - 5000).toISOString();
  const userId = req.headers.get("x-user-id");

  if (!roomId || !userId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Poll every 2 seconds for new messages
      let lastCheck = new Date(since);
      let count = 0;
      const maxPolls = 150; // 5 minutes

      send({ type: "connected", roomId });

      const poll = async () => {
        if (count >= maxPolls) { controller.close(); return; }
        count++;

        try {
          await connectDB();
          const messages = await ChatMessage.find({
            roomId,
            createdAt: { $gt: lastCheck },
            isDeleted: false,
          }).sort({ createdAt: 1 }).lean();

          if (messages.length > 0) {
            lastCheck = new Date(messages[messages.length - 1].createdAt as any);
            send({ type: "messages", messages });
          }

          send({ type: "ping", ts: new Date().toISOString() });
        } catch (e) {
          send({ type: "error", message: String(e) });
        }

        setTimeout(poll, 2000);
      };

      await poll();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
