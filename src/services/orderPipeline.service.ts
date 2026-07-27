import { generateInvoice } from "@/services/invoice.service";
import { generateReceipt } from "@/services/receipt.service";

/* ================= MAIN PIPELINE ================= */
export async function processOrderAfterPayment({
  orderId,
  payment,
}: any) {
  // 1. Receipt first (payment proof)
  const receipt = await generateReceipt(orderId, payment);

  // 2. Invoice generation
  const invoice = await generateInvoice(orderId);

  return {
    receipt,
    invoice,
  };
}
