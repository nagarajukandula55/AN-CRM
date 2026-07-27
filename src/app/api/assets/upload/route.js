import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";
import { getEnrichedSession } from "@/lib/auth/session-enriched";
import { requirePermission } from "@/middleware/permission.guard";
import { buildPermissionCode } from "@/core/access/actions";

export async function POST(req) {
  try {
    const session = await getEnrichedSession();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    try {
      requirePermission(session, buildPermissionCode("assets", "create"));
    } catch (err) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.code === "FORBIDDEN" ? 403 : 401 }
      );
    }

    await connectDB();

    const formData = await req.formData();

    const file = formData.get("file");
    const name = formData.get("name");
    const category = formData.get("category");

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // 🔒 basic validation — previously ONLY images were allowed, which
    // blocked vendor compliance-document uploads (bank passbook/cancelled
    // cheque photos are fine as images, but GST certificates are commonly
    // issued as PDFs). Widened to also accept application/pdf, using
    // Cloudinary's "auto" resource type so both image and raw/PDF uploads
    // go through the same pipeline.
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      return NextResponse.json(
        { error: "Only image files or PDFs are allowed" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const base64 = `data:${file.type};base64,${buffer.toString(
      "base64"
    )}`;

    // 🚀 MAIN UPLOAD (optimized) — resource_type "auto" lets Cloudinary
    // detect image vs. raw/PDF itself rather than hardcoding "image",
    // which would silently corrupt/reject PDF uploads.
    const uploadResult = await cloudinary.uploader.upload(base64, {
      folder: "an-assets",
      resource_type: "auto",
      quality: isImage ? "auto" : undefined,
      fetch_format: isImage ? "auto" : undefined,
    });

    // Thumbnails only make sense for images — Cloudinary's image transform
    // URL helper would produce a broken/irrelevant URL for a PDF's raw
    // resource type.
    const thumbnailUrl = isImage
      ? cloudinary.url(uploadResult.public_id, {
          width: 300,
          crop: "scale",
          quality: "auto",
          fetch_format: "auto",
        })
      : null;

    const asset = await Asset.create({
      name: name || "Untitled Asset",
      category: category || "logo",
      fileUrl: uploadResult.secure_url,
      thumbnailUrl,
      fileType: file.type,
      size: buffer.length,
      tags: [],
    });

    return NextResponse.json({
      success: true,
      asset,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
