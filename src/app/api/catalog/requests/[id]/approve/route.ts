import { NextRequest, NextResponse } from "next/server";
import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/mongodb";
import CatalogChangeRequest from "@/models/CatalogChangeRequest";
import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import Variant from "@/models/Variant";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { logAction } from "@/lib/audit/logAction";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function exactCI(name: string) {
  return new RegExp(`^${escapeRegex(name.trim())}$`, "i");
}

// POST /api/catalog/requests/[id]/approve
//
// Approval is deliberately NOT gated by the generic CATALOG.APPROVE
// permission -- same reasoning as vendor-products' approve route (see that
// file's top comment): a broadly-grantable permission can be over-granted
// to a vendor "full access" role, which would let someone approve (and so
// effectively self-serve) their own catalog request. Only AN Group's own
// Super Admin may approve one.
export async function POST(req: NextRequest, context: any) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    if (!session.isSuperAdmin) {
      return NextResponse.json(
        { success: false, message: "Only an AN Group Super Admin can approve a catalog change request." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid request id" }, { status: 400 });
    }

    await connectDB();

    const request = await CatalogChangeRequest.findById(id);
    if (!request) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }
    if (request.status === "APPROVED") {
      return NextResponse.json({ success: false, message: "Already approved" }, { status: 400 });
    }

    const nameRegex = exactCI(request.name);
    let resultEntity: any = null;

    // Guard against a race where the same name was added via another path
    // (masters UI, another approved request, etc.) between request-time and
    // approval-time -- if the real entity now already exists, just link the
    // request to it rather than erroring or creating a duplicate.
    if (request.kind === "BRAND") {
      resultEntity = await Brand.findOne({ businessId: request.businessId, category: request.category, name: nameRegex });
      if (!resultEntity) {
        resultEntity = await Brand.create({
          name: request.name,
          category: request.category,
          businessId: request.businessId,
          businessScope: "SINGLE",
        });
      }
    } else if (request.kind === "SERIES") {
      resultEntity = await Series.findOne({ businessId: request.businessId, brandId: request.brandId, name: nameRegex });
      if (!resultEntity) {
        resultEntity = await Series.create({
          name: request.name,
          brandId: request.brandId,
          businessId: request.businessId,
          businessScope: "SINGLE",
        });
      }
    } else if (request.kind === "MODEL") {
      resultEntity = await DeviceModel.findOne({ businessId: request.businessId, brandId: request.brandId, name: nameRegex });
      if (!resultEntity) {
        resultEntity = await DeviceModel.create({
          name: request.name,
          brandId: request.brandId,
          seriesId: request.seriesId || null,
          businessId: request.businessId,
          businessScope: "SINGLE",
        });
      }
    } else if (request.kind === "VARIANT") {
      resultEntity = await Variant.findOne({ businessId: request.businessId, modelId: request.modelId, name: nameRegex });
      if (!resultEntity) {
        resultEntity = await Variant.create({
          name: request.name,
          modelId: request.modelId,
          businessId: request.businessId,
          businessScope: "SINGLE",
        });
      }
    }

    request.status = "APPROVED";
    request.reviewedBy = new Types.ObjectId(session.user.id) as any;
    request.reviewedAt = new Date();
    request.resultEntityId = resultEntity?._id;
    await request.save();

    logAction({
      action: "UPDATE",
      entity: "CatalogChangeRequest",
      entityId: id,
      after: { status: "APPROVED", resultEntityId: resultEntity?._id },
      req,
      actor: { id: session.user.id },
    });

    return NextResponse.json({ success: true, request, resultEntity });
  } catch (err: any) {
    console.error("Catalog request approve error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
