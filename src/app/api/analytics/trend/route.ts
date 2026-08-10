/**
 * GET /api/analytics/trend?granularity=DAY|WEEK|MONTH|YEAR&businessId=...
 *
 * Powers the Analytics page's Daily/Weekly/Monthly/Yearly view with a
 * year-on-date comparison: for each bucket in the current period (last 30
 * days / 12 weeks / 12 months / 5 years, depending on granularity), returns
 * both this period's revenue+calls AND the same bucket exactly one year
 * earlier -- so the page can render "this week vs. same week last year"
 * comparison clusters for both series, per explicit direction ("year and
 * year as on date comparisons and graphs and also comparison clusters on
 * both calls and revenue both").
 *
 * Revenue = SalesInvoice.grandTotal where status PAID (same definition
 * api/analytics/overview already uses). Calls = CrmCall count, all
 * statuses (every call logged, not just converted ones -- "calls" here
 * means call volume, matching how api/analytics/overview's totalCalls is
 * defined).
 *
 * Both the current and prior-year ranges are aggregated with the same
 * $dateTrunc-based $group so bucket boundaries line up exactly; the prior
 * range is the current range shifted back exactly one calendar year
 * (setFullYear(-1)), not a fixed day-count offset, so "Mar 2025" always
 * lines up with "Mar 2024" even across leap years.
 */
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import SalesInvoice from "@/models/SalesInvoice";
import CrmCall from "@/models/CrmCall";
import CrmJobSheet from "@/models/CrmJobSheet";
import Business from "@/models/Business";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";
import { resolveAuthorizedBusinessId } from "@/lib/auth/resolveAuthorizedBusinessId";

type Granularity = "DAY" | "WEEK" | "MONTH" | "YEAR";

const BUCKET_COUNT: Record<Granularity, number> = { DAY: 30, WEEK: 12, MONTH: 12, YEAR: 5 };
const TRUNC_UNIT: Record<Granularity, "day" | "week" | "month" | "year"> = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

// SECURITY/CORRECTNESS: $dateTrunc (used in fetchSeries below) truncates
// in UTC by default, so every bucket boundary Mongo returns is UTC-
// anchored. This file's bucket-loop start/end math used to be built with
// LOCAL setters (setDate/setMonth/setFullYear/setHours) while bucketKey
// read the result back with UTC getters (getUTCFullYear/getUTCMonth) for
// MONTH/YEAR, and toISOString() (also UTC) for DAY/WEEK -- so on any
// server/dev machine whose local timezone isn't UTC (this app's IST
// userbase, or a developer's own machine, as opposed to Vercel's UTC
// runtime), local midnight is NOT the same instant as UTC midnight, and
// the loop-computed keys silently drifted from what Mongo actually
// grouped by. With 30 DAY buckets a one-bucket drift was easy to miss;
// with only 12 WEEK/MONTH or 5 YEAR buckets, the whole chart came up
// empty. Every date computed below is now built and read with UTC
// methods throughout, matching $dateTrunc's own UTC anchoring exactly
// regardless of the host machine's timezone. Labels alone still use
// toLocaleDateString for readable display -- that's cosmetic, not part
// of the key/lookup path.
function shiftYears(d: Date, years: number): Date {
  const copy = new Date(d);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

// Monday-aligned, matching $dateTrunc's startOfWeek: "monday" below --
// without this, the JS-computed bucket boundaries never lined up with
// where Mongo actually truncated each week to, so every WEEK lookup
// missed and the chart showed no data at all.
function alignToMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getUTCDay(); // Sun=0..Sat=6
  const diff = (day + 6) % 7; // days since most recent Monday
  copy.setUTCDate(copy.getUTCDate() - diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function startOfBucketRange(granularity: Granularity, now: Date): Date {
  const count = BUCKET_COUNT[granularity];
  const start = new Date(now);
  if (granularity === "DAY") start.setUTCDate(start.getUTCDate() - (count - 1));
  else if (granularity === "WEEK") start.setUTCDate(start.getUTCDate() - (count - 1) * 7);
  else if (granularity === "MONTH") start.setUTCMonth(start.getUTCMonth() - (count - 1), 1);
  else start.setUTCFullYear(start.getUTCFullYear() - (count - 1), 0, 1);
  start.setUTCHours(0, 0, 0, 0);
  return granularity === "WEEK" ? alignToMonday(start) : start;
}

function bucketLabel(granularity: Granularity, d: Date): string {
  if (granularity === "DAY") return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
  if (granularity === "WEEK") return `Wk of ${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}`;
  if (granularity === "MONTH") return d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  return String(d.getUTCFullYear());
}

function bucketKey(granularity: Granularity, d: Date): string {
  if (granularity === "YEAR") return String(d.getUTCFullYear());
  if (granularity === "MONTH") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  // DAY and WEEK both truncate to a day boundary via $dateTrunc -- WEEK's
  // truncated value is the Monday (or configured start) of that week, so a
  // plain ISO-date key works for both.
  return d.toISOString().slice(0, 10);
}

async function fetchSeries(
  granularity: Granularity,
  rangeStart: Date,
  rangeEnd: Date,
  businessId: string | null,
  isSC: boolean
) {
  const unit = TRUNC_UNIT[granularity];

  // aggregate() bypasses Mongoose's query-casting layer (unlike .find()),
  // so a plain string businessId here never matched the real ObjectId
  // field -- both series silently read all-zero for any scoped business.
  const businessObjectId = businessId && mongoose.Types.ObjectId.isValid(businessId) ? new mongoose.Types.ObjectId(businessId) : null;

  const invoiceMatch: Record<string, any> = {
    isDeleted: { $ne: true },
    status: "PAID",
    createdAt: { $gte: rangeStart, $lte: rangeEnd },
  };
  if (businessObjectId) invoiceMatch.businessId = businessObjectId;

  // SC has no calls/appointment pipeline -- its "calls" series is
  // workorder-creation volume instead (see api/analytics/overview's
  // identical isSC swap and analytics/page.tsx for the label change).
  const callMatch: Record<string, any> = { createdAt: { $gte: rangeStart, $lte: rangeEnd } };
  if (businessObjectId) callMatch.businessId = businessObjectId;
  if (isSC) callMatch.isDeleted = { $ne: true };

  // startOfWeek: "monday" only matters (and is only valid) for unit
  // "week" -- Mongo rejects it for other units, so it's added
  // conditionally rather than unconditionally on every $dateTrunc call.
  const truncSpec: Record<string, any> = { date: "$createdAt", unit };
  if (unit === "week") truncSpec.startOfWeek = "monday";

  const [revenueRows, callRows] = await Promise.all([
    SalesInvoice.aggregate([
      { $match: invoiceMatch },
      { $group: { _id: { $dateTrunc: truncSpec }, revenue: { $sum: "$grandTotal" } } },
    ]),
    (isSC ? CrmJobSheet : CrmCall).aggregate([
      { $match: callMatch },
      { $group: { _id: { $dateTrunc: truncSpec }, calls: { $sum: 1 } } },
    ]),
  ]);

  const revenueByKey = new Map(revenueRows.map((r: any) => [bucketKey(granularity, new Date(r._id)), r.revenue as number]));
  const callsByKey = new Map(callRows.map((r: any) => [bucketKey(granularity, new Date(r._id)), r.calls as number]));
  return { revenueByKey, callsByKey };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session as any, buildPermissionCode("reports", "view"));
    } catch (err: any) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    // SECURITY: businessId used to be trusted straight from the query
    // param with no ownership check -- see resolveAuthorizedBusinessId's
    // own comment and api/analytics/overview's matching fix.
    const businessId = await resolveAuthorizedBusinessId(
      session.user.id,
      searchParams.get("businessId"),
      session.isSuperAdmin,
      session.business?.businessId || null
    );
    if (!businessId && !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "No business context for this account" }, { status: 400 });
    }
    const granularity = (searchParams.get("granularity") || "MONTH").toUpperCase() as Granularity;
    if (!BUCKET_COUNT[granularity]) {
      return NextResponse.json({ success: false, message: "granularity must be DAY, WEEK, MONTH, or YEAR" }, { status: 400 });
    }

    // See api/analytics/overview's matching comment -- BRAND/POS were
    // removed entirely (SC-only platform now), but legacy rows can still
    // carry an unbackfilled "" operatingMode, so this must default to SC
    // rather than require an exact "SC" match.
    const business = businessId ? await Business.findById(businessId).select("operatingMode").lean<any>() : null;
    const isSC = business?.operatingMode !== "BRAND" && business?.operatingMode !== "POS";

    const now = new Date();
    const currentStart = startOfBucketRange(granularity, now);
    const priorStart = shiftYears(currentStart, -1);
    const priorEnd = shiftYears(now, -1);

    const [current, prior] = await Promise.all([
      fetchSeries(granularity, currentStart, now, businessId, isSC),
      fetchSeries(granularity, priorStart, priorEnd, businessId, isSC),
    ]);

    const count = BUCKET_COUNT[granularity];
    const buckets = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(currentStart);
      if (granularity === "DAY") d.setUTCDate(d.getUTCDate() + i);
      else if (granularity === "WEEK") d.setUTCDate(d.getUTCDate() + i * 7);
      else if (granularity === "MONTH") d.setUTCMonth(d.getUTCMonth() + i);
      else d.setUTCFullYear(d.getUTCFullYear() + i);

      const priorD = shiftYears(d, -1);
      const key = bucketKey(granularity, d);
      const priorKey = bucketKey(granularity, priorD);

      buckets.push({
        label: bucketLabel(granularity, d),
        revenue: current.revenueByKey.get(key) || 0,
        calls: current.callsByKey.get(key) || 0,
        priorYearLabel: bucketLabel(granularity, priorD),
        priorYearRevenue: prior.revenueByKey.get(priorKey) || 0,
        priorYearCalls: prior.callsByKey.get(priorKey) || 0,
      });
    }

    const totalCurrentRevenue = buckets.reduce((s, b) => s + b.revenue, 0);
    const totalPriorRevenue = buckets.reduce((s, b) => s + b.priorYearRevenue, 0);
    const totalCurrentCalls = buckets.reduce((s, b) => s + b.calls, 0);
    const totalPriorCalls = buckets.reduce((s, b) => s + b.priorYearCalls, 0);

    return NextResponse.json({
      success: true,
      granularity,
      isSC,
      buckets,
      summary: {
        revenue: {
          current: totalCurrentRevenue,
          priorYear: totalPriorRevenue,
          changePct: totalPriorRevenue > 0 ? ((totalCurrentRevenue - totalPriorRevenue) / totalPriorRevenue) * 100 : null,
        },
        calls: {
          current: totalCurrentCalls,
          priorYear: totalPriorCalls,
          changePct: totalPriorCalls > 0 ? ((totalCurrentCalls - totalPriorCalls) / totalPriorCalls) * 100 : null,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
