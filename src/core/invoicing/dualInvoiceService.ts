import SalesInvoice from "@/models/SalesInvoice";

/**
 * "B2B2C" is not a distinct invoice type in this system -- it's the label
 * for a B2B leg + B2C leg sharing the same sourceOrderId. This returns
 * that full chain for a given source (e.g. a CRM job sheet's
 * "CRM_JOBSHEET:<id>" sourceOrderId) so a print/view page can show "part
 * of a B2B2C chain" with links to the sibling invoice(s).
 *
 * This file previously also generated marketplace dual-invoices from a
 * storefront Order record (vendor B2B leg + customer B2C leg) -- that
 * function (generateDualInvoicesForOrder) and its Order-model dependency
 * were removed as part of stripping AN-CRM's leftover ecommerce/
 * marketplace surface area; getB2B2CChain below never depended on Order,
 * only on SalesInvoice, so it's unaffected.
 */
export async function getB2B2CChain(sourceOrderId: string) {
  const invoices = await SalesInvoice.find({ sourceOrderId }).sort({ invoiceType: 1, createdAt: 1 }).lean();
  const b2b = invoices.filter((inv: any) => inv.invoiceType === "B2B");
  const b2c = invoices.filter((inv: any) => inv.invoiceType === "B2C");
  return {
    isB2B2C: b2b.length > 0 && b2c.length > 0,
    b2b,
    b2c,
  };
}
