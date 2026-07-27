"use client";

import useSWR from "swr";
import Link from "next/link";
import ExportCsvButton from "@/components/shared/ExportCsvButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPanel } from "@/components/ui/Spinner";

type VendorProduct = {
  _id: string;
  productName: string;
  variantName: string;
  vendorCost: number;
  mrp: number;
  approvalStatus: string;
};

type Tone = "success" | "warning" | "danger" | "info" | "neutral";
const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export default function VendorProductsPage() {
  const { data, isLoading: loading, mutate: refetchProducts } = useSWR("/api/vendor-products");
  const products: VendorProduct[] = data?.data || [];

  async function handleDelete(id: string) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    try {
      await fetch(`/api/vendor-products/${id}`, { method: "DELETE" });
      refetchProducts();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Products"
        description="Manage submitted products"
        actions={
          <>
            <ExportCsvButton
              filename="vendor-products"
              rows={products}
              columns={[
                { header: "Product", value: (r: VendorProduct) => r.productName },
                { header: "Variant", value: (r: VendorProduct) => r.variantName },
                { header: "Cost", value: (r: VendorProduct) => r.vendorCost },
                { header: "MRP", value: (r: VendorProduct) => r.mrp },
                { header: "Status", value: (r: VendorProduct) => r.approvalStatus },
              ]}
            />
            <Link href="/vendor/products/new">
              <Button>New Product</Button>
            </Link>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs text-ink-3">
                <th className="p-3 text-left font-medium">Product</th>
                <th className="p-3 text-left font-medium">Variant</th>
                <th className="p-3 text-right font-medium">Cost</th>
                <th className="p-3 text-right font-medium">MRP</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6}><LoadingPanel label="Loading products…" /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={6}><EmptyState kind="empty" title="No products found" /></td></tr>
              ) : (
                products.map((item) => (
                  <tr key={item._id} className="hover:bg-surface-2 transition-colors">
                    <td className="p-3 text-ink">{item.productName}</td>
                    <td className="p-3 text-ink-2">{item.variantName}</td>
                    <td className="p-3 text-right tabular text-ink">₹{item.vendorCost}</td>
                    <td className="p-3 text-right tabular text-ink">₹{item.mrp}</td>
                    <td className="p-3 text-center">
                      <Badge tone={STATUS_TONE[item.approvalStatus] ?? "neutral"}>{item.approvalStatus}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2">
                        <Link href={`/vendor/products/${item._id}`}>
                          <Button variant="secondary" size="sm">Edit</Button>
                        </Link>
                        <Link href={`/vendor/products/${item._id}/bom`}>
                          <Button variant="secondary" size="sm">BOM</Button>
                        </Link>
                        {item.approvalStatus === "DRAFT" && (
                          <Button variant="danger" size="sm" onClick={() => handleDelete(item._id)}>Delete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
