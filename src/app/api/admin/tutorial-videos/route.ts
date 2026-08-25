import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import TutorialVideo from "@/models/TutorialVideo";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

// GET /api/admin/tutorial-videos — full catalog (published + unpublished
// placeholders) for the admin editor.
export async function GET() {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    await connectDB();
    const videos = await TutorialVideo.find({}).sort({ category: 1, sortOrder: 1 }).lean();
    return NextResponse.json({ success: true, videos });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const body = await req.json();
    const { key, title, description, category, videoUrl, thumbnailUrl, isPublished, sortOrder } = body;

    if (!key?.trim() || !title?.trim() || !category?.trim()) {
      return NextResponse.json({ success: false, message: "Key, title, and category are required" }, { status: 400 });
    }

    await connectDB();
    const existing = await TutorialVideo.findOne({ key: key.trim() });
    if (existing) {
      return NextResponse.json({ success: false, message: `A video with key "${key}" already exists` }, { status: 409 });
    }

    const video = await TutorialVideo.create({
      key: key.trim(),
      title: title.trim(),
      description: description?.trim() || "",
      category: category.trim(),
      videoUrl: videoUrl?.trim() || "",
      thumbnailUrl: thumbnailUrl?.trim() || "",
      isPublished: !!isPublished,
      sortOrder: sortOrder || 0,
    });

    return NextResponse.json({ success: true, video }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
