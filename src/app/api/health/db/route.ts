import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";

/**
 * GET /api/health/db — public diagnostic endpoint.
 * Open http://localhost:3000/api/health/db in a browser to instantly see
 * whether the database connection works and how long it takes.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await connectDB();
    const pingStart = Date.now();
    await mongoose.connection.db?.admin().ping();
    return NextResponse.json({
      ok: true,
      connectMs: pingStart - startedAt,
      pingMs: Date.now() - pingStart,
      host: mongoose.connection.host,
      dbName: mongoose.connection.name,
      readyState: mongoose.connection.readyState, // 1 = connected
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        afterMs: Date.now() - startedAt,
        error: err?.message || String(err),
        hint:
          "Check MONGODB_URI in .env.local — special characters in the password must be URL-encoded (@ → %40), and your IP must be allowlisted in MongoDB Atlas (Network Access).",
      },
      { status: 500 }
    );
  }
}
