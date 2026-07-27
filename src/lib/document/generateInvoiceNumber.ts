import { getNextInvoiceSequence } from "./invoiceCounter";

function pad(num: number, size: number) {
  return String(num).padStart(size, "0");
}

function formatDate(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function randomSuffix(len = 6) {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

/**
 * FORMAT:
 * NA-260430-000001-CWDZYA
 */
export async function generateInvoiceNumber(
  business: any
) {
  const dateKey = formatDate();
  const seq = await getNextInvoiceSequence(
    business._id.toString(),
    dateKey
  );

  const prefix = business?.documents?.invoices?.numbering?.prefix || "NA";
  const padding = business?.documents?.invoices?.numbering?.padding || 6;

  const seqPart = pad(seq, padding);
  const randomPart = randomSuffix(6);

  return `${prefix}-${dateKey}-${seqPart}-${randomPart}`;
}
