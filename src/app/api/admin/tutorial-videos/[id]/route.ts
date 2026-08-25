import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import TutorialVideo from "@/models/TutorialVideo";
import { getEnrichedSession } from "@/lib/auth/session-enriched";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const { title, description, category, videoUrl, thumbnailUrl, isPublished, sortOrder } = body;

    if (!title?.trim() || !category?.trim()) {
      return NextResponse.json({ success: false, message: "Title and category are required" }, { status: 400 });
    }

    await connectDB();
    const video = await TutorialVideo.findByIdAndUpdate(
      id,
      {
        title: title.trim(),
        description: description?.trim() || "",
        category: category.trim(),
        videoUrl: videoUrl?.trim() || "",
        thumbnailUrl: thumbnailUrl?.trim() || "",
        isPublished: !!isPublished,
        sortOrder: sortOrder || 0,
      },
      { new: true }
    );
    if (!video) return NextResponse.json({ success: false, message: "Video not found" }, { status: 404 });

    return NextResponse.json({ success: true, video });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user || !session.isSuperAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }
    const { id } = await params;
    await connectDB();
    const video = await TutorialVideo.findByIdAndDelete(id);
    if (!video) return NextResponse.json({ success: false, message: "Video not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
