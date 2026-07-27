import { connectDB } from "@/lib/mongodb";
import Product from "@/models/Product";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function Page({
  params,
}: PageProps) {
  await connectDB();

  const { slug } = await params;

  const product = await Product.findOne({
    "seo.slug": slug,
  }).populate("variants");

  if (!product) {
    notFound();
  }

  return (
    <div>
      <h1>{product.productName}</h1>
    </div>
  );
}
