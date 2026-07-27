import type { DocumentRenderData } from "./renderData";

// Loosened from the model's ITemplateBlock (type: TemplateBlockType) so this
// component can also render the template builder's in-progress client-side
// state, which types `type` as a plain string while being edited.
export interface RenderableBlock {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

const fmtMoney = (n?: number) =>
  `₹${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Renders one document's ordered blocks as React, driven by a
 * DocumentTemplate's block config + a DocumentRenderData payload. Used by
 * every print page (invoice/workorder/estimate) AND the template builder's
 * live preview, so "what you configure is what prints" by construction —
 * one render path, not one per document type.
 */
export function DocumentRenderer({
  blocks,
  accentColor,
  logoUrl,
  data,
}: {
  blocks: RenderableBlock[];
  accentColor?: string;
  logoUrl?: string;
  data: DocumentRenderData;
}) {
  const accent = accentColor || "#111827";
  const resolvedLogo = logoUrl || data.company.logoUrl;

  return (
    <div className="text-sm text-gray-900">
      {blocks.map((block) => (
        <div key={block.id} className="mb-6 last:mb-0">
          {renderBlock(block, data, accent, resolvedLogo)}
        </div>
      ))}
    </div>
  );
}

function renderBlock(
  block: RenderableBlock,
  data: DocumentRenderData,
  accent: string,
  logoUrl?: string
) {
  switch (block.type) {
    case "header":
      return (
        <div className="flex items-start justify-between border-b pb-4" style={{ borderColor: accent }}>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: accent }}>
              {(block.config?.title as string) || data.docTypeLabel}
            </h1>
            <p className="text-gray-400 font-mono text-xs mt-1">{data.docNumber}</p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Date: {data.date}</p>
            {data.status && <p>Status: {data.status}</p>}
          </div>
        </div>
      );

    case "company-details":
      return (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">From</p>
            <p className="font-semibold">{data.company.name}</p>
            {data.company.address && <p className="text-xs text-gray-500">{data.company.address}</p>}
            {data.company.phone && <p className="text-xs text-gray-500">{data.company.phone}</p>}
            {data.company.gstin && <p className="text-xs text-gray-500">GSTIN: {data.company.gstin}</p>}
          </div>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 max-w-[160px] object-contain" />
          )}
        </div>
      );

    case "party-details":
      return (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">To</p>
          <p className="font-semibold">{data.party.name}</p>
          {data.party.address && <p className="text-xs text-gray-500">{data.party.address}</p>}
          {data.party.phone && <p className="text-xs text-gray-500">{data.party.phone}</p>}
          {data.party.email && <p className="text-xs text-gray-500">{data.party.email}</p>}
          {data.party.gstin && <p className="text-xs text-gray-500">GSTIN: {data.party.gstin}</p>}
        </div>
      );

    case "items-table":
      return (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 text-left" style={{ borderColor: accent }}>
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 pr-2">HSN</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              <th className="py-2 pr-2 text-right">Tax %</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 pr-2">
                  {item.description}
                  {item.diagnosis && <p className="text-[10px] text-gray-400 mt-0.5">{item.diagnosis}</p>}
                </td>
                <td className="py-2 pr-2 text-gray-500">{item.hsnCode || "—"}</td>
                <td className="py-2 pr-2 text-right">{item.qty} {item.unit || ""}</td>
                <td className="py-2 pr-2 text-right">{fmtMoney(item.unitPrice)}</td>
                <td className="py-2 pr-2 text-right">{item.taxRate}%</td>
                <td className="py-2 text-right">{fmtMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "totals":
      return (
        <div className="flex justify-end">
          <div className="w-60 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtMoney(data.totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{fmtMoney(data.totals.tax)}</span></div>
            {!!data.totals.discount && (
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{fmtMoney(data.totals.discount)}</span></div>
            )}
            <div className="flex justify-between font-semibold text-sm border-t pt-1 mt-1" style={{ borderColor: accent }}>
              <span>Total</span><span>{fmtMoney(data.totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      );

    case "terms": {
      // Was `config.text || data.notes || company.termsAndConditions` --
      // whichever came first WON outright, so whenever a document also had
      // device/issue notes (almost always, for a job sheet), the actual
      // business Terms & Conditions text never rendered at all. These are
      // two different things -- render both, independently, when present.
      const termsText = (block.config?.text as string) || data.company?.termsAndConditions;
      return (
        <div className="space-y-3">
          {data.notes && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Notes</p>
              <p className="text-xs text-gray-600 whitespace-pre-line">{data.notes}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Terms &amp; Conditions</p>
            <p className="text-xs text-gray-600 whitespace-pre-line">{termsText || "—"}</p>
          </div>
        </div>
      );
    }

    case "signature":
      return (
        <div className="flex justify-between pt-8">
          <div className="text-center text-xs text-gray-500">
            <div className="w-40 border-t border-gray-300 pt-1">
              Customer Signature
            </div>
          </div>
          <div className="text-center text-xs text-gray-500">
            {data.company.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.company.signatureUrl} alt="" className="h-10 w-40 object-contain mx-auto" />
            ) : (
              <div className="h-10 w-40 flex items-end justify-center italic text-[10px]">
                Digital document — no physical signature required
              </div>
            )}
            <div className="w-40 border-t border-gray-300 pt-1">
              {(block.config?.label as string) || "Authorized Signatory (Service Centre)"}
            </div>
          </div>
        </div>
      );

    case "custom-text":
      return (
        <p className="text-xs text-gray-500 whitespace-pre-line">{(block.config?.text as string) || ""}</p>
      );

    case "spacer":
      return <div style={{ height: (block.config?.height as number) || 16 }} />;

    default:
      return null;
  }
}

/** Footer disclaimer shown below every rendered document (not a block —
 * fixed placement per document, e.g. "This is an estimate, not a final invoice"). */
export function DocumentFooterText({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="border-t border-gray-200 pt-4 mt-6 text-[10px] text-gray-400">{text}</div>;
}
