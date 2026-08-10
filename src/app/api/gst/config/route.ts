import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import GstPortalConfig from "@/models/GstPortalConfig";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

/* =========================================================
 * GET /api/gst/config?businessId=
 * Fetch this business's GST portal config. Secrets (apiKey/apiSecret) are
 * redacted to a boolean "isSet" flag — never sent back to the client, same
 * pattern the AI Settings page already uses for AIConfig.
 * =======================================================*/
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("gst", "view"));

    const { searchParams } = new URL(req.url);
    // SECURITY: businessId used to be trusted straight from the query
    // param with no ownership check.
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const config = await GstPortalConfig.findOne({
      businessId: new Types.ObjectId(businessId),
    }).lean();

    if (!config) {
      return NextResponse.json({ success: true, data: null });
    }

    const { apiKey, apiSecret, ...safe } = config as any;
    return NextResponse.json({
      success: true,
      data: { ...safe, apiKeySet: !!apiKey, apiSecretSet: !!apiSecret },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* =========================================================
 * PUT /api/gst/config
 * Create/update this business's GST portal config.
 * Body: businessId, gstin, provider, apiKey, apiSecret, username,
 *       isEnabled, autoSubmit
 * =======================================================*/
export async function PUT(req: NextRequest) {
  try {
    await connectDB();
    const h = await headers();
    const userId = h.get("x-user-id");
    const session = await getEnrichedSession();
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    requirePermission(session as any, buildPermissionCode("gst", "edit"));

    const body = await req.json();
    const { gstin, provider, apiKey, apiSecret, username, isEnabled, autoSubmit } = body;

    // SECURITY: body.businessId used to be trusted directly -- any user
    // with the generic gst.edit permission could overwrite another
    // business's GST portal API key/secret.
    const businessId = await resolveAuthorizedBusinessId(
      userId,
      body.businessId,
      session.isSuperAdmin,
      session.business?.businessId || null
    );

    if (!businessId || !gstin) {
      return NextResponse.json({ error: "businessId and gstin are required" }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      gstin,
      updatedBy: new Types.ObjectId(userId),
    };
    if (provider !== undefined) update.provider = provider;
    if (username !== undefined) update.username = username;
    if (isEnabled !== undefined) update.isEnabled = isEnabled;
    if (autoSubmit !== undefined) update.autoSubmit = autoSubmit;
    // Only overwrite secrets when a new value is actually sent — an empty
    // PUT from the settings form (which never re-sends existing secrets)
    // must not silently blank out a previously-saved key.
    if (apiKey) update.apiKey = apiKey;
    if (apiSecret) update.apiSecret = apiSecret;

    const config = await GstPortalConfig.findOneAndUpdate(
      { businessId: new Types.ObjectId(businessId) },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    const { apiKey: _k, apiSecret: _s, ...safe } = config as any;

    logAction({
      action: "UPDATE",
      entity: "GstConfig",
      entityId: (config as any)?._id?.toString(),
      after: update,
      req,
      actor: { id: userId ?? undefined, businessId: businessId?.toString() },
    });

    return NextResponse.json({
      success: true,
      data: { ...safe, apiKeySet: !!(config as any).apiKey, apiSecretSet: !!(config as any).apiSecret },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
