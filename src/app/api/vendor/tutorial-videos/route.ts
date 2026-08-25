import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { connectDB } from "@/lib/mongodb";
import TutorialVideo from "@/models/TutorialVideo";

// GET /api/vendor/tutorial-videos — published catalog for the vendor Help
// Center (/vendor/help). Auth-gated like the rest of /api/vendor/* even
// though the content itself isn't vendor-specific.
export async function GET() {
  try {
    const headersList = await headers();
    const userId = headersList.get("x-user-id");
    if (!userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const videos = await TutorialVideo.find({ isPublished: true }).sort({ category: 1, sortOrder: 1 }).lean();
    return NextResponse.json({ success: true, videos });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
