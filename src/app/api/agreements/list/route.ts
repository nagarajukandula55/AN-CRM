import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Agreement from "@/models/Agreement";

export async function GET(req: Request) {
  try {
    await connectDB();
    const userId = req.headers.get("x-user-id");
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type");

    const filter: any = { isDeleted: false };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const agreements = await Agreement.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, agreements });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
