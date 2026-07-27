import Order from "@/models/Order";
import crypto from "crypto";

/* ================= INVOICE NUMBER GENERATOR ================= */
export function generateInvoiceNumber({
  prefix = "NA",
  date = new Date(),
  sequence = 1,
}: {
  prefix?: string;
  date?: Date;
  sequence: number;
}) {
  const yyMMdd = date
    .toISOString()
    .slice(2, 10)
    .replace(/-/g, "");

  const random = crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase();

  return `${prefix}-${yyMMdd}-${String(sequence).padStart(
    6,
    "0"
  )}-${random}`;
}

/* ================= RECEIPT NUMBER ================= */
export function generateReceiptNumber() {
  const ts = Date.now();
  const random = crypto
    .randomBytes(2)
    .toString("hex")
    .toUpperCase();

  return `RCPT-${ts}-${random}`;
}

/* ================= INVOICE HASH ================= */
export function generateDocumentHash(data: any) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}
