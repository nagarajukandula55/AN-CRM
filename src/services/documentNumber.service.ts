import DocumentCounter from "@/models/DocumentCounter";

export async function generateDocumentNumber(
  businessId: string,
  documentType: string
) {
  const counter =
    await DocumentCounter.findOneAndUpdate(
      {
        businessId,
        documentType,
      },
      {
        $inc: {
          current: 1,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );

  const seq = String(
    counter.current
  ).padStart(5, "0");

  const now = new Date();

  const y = now
    .getFullYear()
    .toString()
    .slice(-2);

  const m = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const d = String(
    now.getDate()
  ).padStart(2, "0");

  switch (documentType) {
    case "PO":
      return `PO-${y}${m}${d}-${seq}`;

    case "GRN":
      return `GRN-${y}${m}${d}-${seq}`;

    case "PROD":
      return `PROD-${y}${m}${d}-${seq}`;

    case "BATCH":
      return `BAT-${y}${m}${d}-${seq}`;

    default:
      return `${documentType}-${y}${m}${d}-${seq}`;
  }
}
