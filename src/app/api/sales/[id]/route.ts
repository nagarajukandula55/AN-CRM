import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getInvoiceById } from "@/services/sales.service";

export async function GET(_: Request, { params }: any) {
  await connectDB();

  const data = await getInvoiceById(params.id);

  return NextResponse.json({
    success: true,
    data,
  });
}
