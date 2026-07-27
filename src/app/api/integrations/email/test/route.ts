import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import Integration from "@/models/Integration";
import { Resend } from "resend";

/* =========================================================
 * POST /api/integrations/email/test
 * Sends a one-off test email using this business's saved EMAIL
 * integration config, so the admin can confirm credentials work before
 * relying on it for real invoice emails. Previously referenced by the
 * Integrations UI's "Send Test Email" button but never implemented.
 * Currently only actually sends for provider RESEND — SMTP/SendGrid/
 * Mailgun/SES test-sending would need those specific SDKs wired in,
 * which is a separate follow-up; this returns a clear error for those
 * rather than silently pretending to succeed.
 * Body: { toEmail: string }
 * =======================================================*/
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const businessId = h.get("x-active-business-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!businessId) {
      return NextResponse.json({ success: false, error: "No active business selected" }, { status: 400 });
    }

    const body = await req.json();
    const toEmail = body?.toEmail;
    if (!toEmail) {
      return NextResponse.json({ success: false, error: "toEmail is required" }, { status: 400 });
    }

    const integration = await Integration.findOne({ businessId, provider: "EMAIL" }).lean();
    const cfg = (integration as any)?.config;
    if (!cfg) {
      return NextResponse.json({ success: false, error: "No email configuration saved for this business yet" }, { status: 400 });
    }

    if (cfg.provider === "RESEND") {
      const apiKey = cfg.resendApiKey || process.env.RESEND_API_KEY;
      const from = cfg.resendFromEmail || cfg.fromEmail || process.env.RESEND_FROM;
      if (!apiKey || !from) {
        return NextResponse.json(
          { success: false, error: "Resend API key and From Email are required to send a test email" },
          { status: 400 }
        );
      }
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from,
        to: toEmail,
        subject: "Test email from your ERP integration settings",
        html: `<p>This is a test email confirming your Resend configuration is working correctly.</p>`,
      });
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Test sending for provider "${cfg.provider || "SMTP"}" isn't wired up yet — currently only Resend supports a live test send. Configure Resend to test, or use this provider for real invoice emails once it's connected elsewhere.`,
      },
      { status: 501 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
