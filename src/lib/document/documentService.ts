import { generateInvoiceNumber } from "./generateInvoiceNumber";
import { detectGSTType, getGSTMode } from "./gstEngine";

export async function createInvoiceDocument({
  business,
  order,
  sellerState,
}: any) {
  const invoiceNumber = await generateInvoiceNumber(business);

  const gstType = detectGSTType(order.address);
  const gstMode = getGSTMode(order.address.state, sellerState);

  const invoice = {
    invoiceNumber,
    generatedAt: new Date(),

    type: gstType,
    gstMode,

    billingSnapshot: {
      orderId: order.orderId,
      customer: order.address,
      items: order.items,
      billing: order.billing,
    },
  };

  return invoice;
}
