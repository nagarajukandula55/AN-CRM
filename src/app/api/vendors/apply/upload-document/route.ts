import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { connectDB } from "@/lib/mongodb";
import Asset from "@/models/Asset";

/**
 * POST /api/vendors/apply/upload-document — PUBLIC, unauthenticated upload
 * for the vendor-application form (/vendor-apply). The general asset
 * upload endpoint (/api/assets/upload) requires a signed-in session with
 * assets:create, which a prospective vendor filling out a public
 * application form doesn't have -- that combination meant every document
 * upload on this page silently 401'd in production. This is a narrowly
 * scoped, unauthenticated sibling: image/PDF only, size-capped, and always
 * tagged category "vendor-application" so uploaded documents are
 * distinguishable from authenticated-user assets.
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10MB — plenty for a scanned document/photo

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      return NextResponse.json(
        { success: false, error: "Only image files or PDFs are allowed" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "File is too large (max 10MB)" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const uploadResult = await cloudinary.uploader.upload(base64, {
      folder: "an-vendor-applications",
      resource_type: "auto",
      quality: isImage ? "auto" : undefined,
      fetch_format: isImage ? "auto" : undefined,
    });

    const thumbnailUrl = isImage
      ? cloudinary.url(uploadResult.public_id, {
          width: 300,
          crop: "scale",
          quality: "auto",
          fetch_format: "auto",
        })
      : null;

    const asset = await Asset.create({
      name: file.name || "Vendor application document",
      category: "vendor-application",
      fileUrl: uploadResult.secure_url,
      thumbnailUrl,
      fileType: file.type,
      size: buffer.length,
      tags: ["vendor-application"],
    });

    return NextResponse.json({ success: true, asset });
  } catch (error: any) {
    console.error("Vendor application document upload error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Upload failed" }, { status: 500 });
  }
}
