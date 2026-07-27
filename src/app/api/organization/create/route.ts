import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import crypto from "crypto";

import Organization from "@/models/Organization";
import Business from "@/models/Business";
import Warehouse from "@/models/Warehouse";
import Counter from "@/models/Counter";

import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { validateGSTINAgainstState } from "@/lib/validation/gst";
import { logAction } from "@/lib/audit/logAction";

/* =========================================================
   ORGANIZATION CODE GENERATOR (AN0001)
========================================================= */

function padNumber(num: number, size: number): string {
  return num.toString().padStart(size, "0");
}

async function generateOrgCode(): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { key: "ORG_CODE" },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );

  return `AN${padNumber(counter.value, 4)}`;
}

/* =========================================================
   SYS CODE GENERATOR
========================================================= */

function generateSysCode(): string {
  return `org_${crypto.randomBytes(6).toString("hex")}`;
}

/* =========================================================
   SLUG GENERATOR
========================================================= */

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/* =========================================================
   CREATE ORGANIZATION API
========================================================= */

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    requirePermission(session, buildPermissionCode("businesses", "create"));

    const body = await req.json();

    const {
      name,
      legalName,
      email,
      phone,
      website,
      gstNumber,
      panNumber,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Organization name is required" },
        { status: 400 }
      );
    }

    // Server-side GSTIN re-validation — mirrors the check in
    // /api/businesses/create so a bypassed client-side check (direct API
    // call, disabled JS, etc.) can't slip an invalid/mismatched GSTIN in.
    if (gstNumber && String(gstNumber).trim()) {
      const gstResult = validateGSTINAgainstState(gstNumber, state);
      if (!gstResult.valid) {
        return NextResponse.json(
          { error: gstResult.reason || "Invalid GSTIN" },
          { status: 400 }
        );
      }
    }

    /* =========================================================
       STEP 1: GENERATE IDS
    ========================================================= */

    const code = await generateOrgCode();
    const sysCode = generateSysCode();
    const slug = generateSlug(name);

    /* =========================================================
       STEP 2: CREATE ORGANIZATION
    ========================================================= */

    const organization = await Organization.create({
      name,
      code,
      sysCode,
      slug,

      legalName,
      email,
      phone,
      website,

      gstNumber,
      panNumber,

      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,

      ownerId: new Types.ObjectId(session.user.id),

      timezone: "Asia/Kolkata",
      currency: "INR",

      plan: "FREE",

      features: {
        inventory: true,
        purchase: true,
        sales: true,
        finance: true,
        production: true,
        crm: true,
      },

      isActive: true,
      isDeleted: false,

      createdBy: new Types.ObjectId(session.user.id),
    });

    /* =========================================================
       STEP 3: CREATE DEFAULT BUSINESS
    ========================================================= */

    const business = await Business.create({
      organizationId: organization._id,
      name: `${name} - Main Business`,
      code: `${code}-B1`,
      type: "OTHER",
      isActive: true,
    });

    /* =========================================================
       STEP 4: CREATE DEFAULT WAREHOUSE
    ========================================================= */

    const warehouse = await Warehouse.create({
      organizationId: organization._id,
      businessId: business._id,
      name: "Main Warehouse",
      location: city || null,
      isActive: true,
    });

    /* =========================================================
       STEP 5: RESPONSE
    ========================================================= */

    logAction({
      action: "CREATE",
      entity: "Organization",
      entityId: organization?._id?.toString(),
      after: organization,
      req,
      actor: { id: session.user.id, businessId: business?._id?.toString() },
    });

    return NextResponse.json({
      success: true,
      message: "Organization created successfully",
      data: {
        organization,
        business,
        warehouse,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}
