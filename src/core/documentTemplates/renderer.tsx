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

    case "party-details": {
      // Workorder/Service Record borrow the reference service-report
      // layout's bordered label:value row style instead of a plain
      // address block, and add the device identity as its own row (was
      // previously buried inside the free-text notes block).
      const isServiceStyle = data.docTypeLabel === "WORK ORDER" || data.docTypeLabel === "SERVICE RECORD";
      if (isServiceStyle) {
        const Row = ({ label, value }: { label: string; value?: string }) =>
          value ? (
            <div className="flex border-b border-gray-100 py-1.5 text-xs">
              <span className="w-32 shrink-0 text-gray-400">{label}</span>
              <span className="text-gray-800">{value}</span>
            </div>
          ) : null;
        return (
          <div>
            <Row label="Customer Name" value={data.party.name} />
            <Row label="Contact No." value={data.party.phone} />
            {data.party.address && <Row label="Address" value={data.party.address} />}
            {data.device?.brand && <Row label="Brand" value={data.device.brand} />}
            {data.device?.model && <Row label="Model" value={data.device.model} />}
            {data.device?.imeiOrSerial && <Row label="IMEI / Serial No." value={data.device.imeiOrSerial} />}
          </div>
        );
      }
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
    }

    case "items-table":
      return (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 text-left bg-gray-50" style={{ borderColor: accent }}>
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

    case "totals": {
      // Service Record borrows the reference report's bold, highlighted
      // "Paid Amount" line instead of a plain "Total" -- this document
      // represents money actually collected, not just a running total.
      const isServiceRecord = data.docTypeLabel === "SERVICE RECORD";
      return (
        <div className="flex justify-end">
          <div className="w-60 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtMoney(data.totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{fmtMoney(data.totals.tax)}</span></div>
            {!!data.totals.discount && (
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{fmtMoney(data.totals.discount)}</span></div>
            )}
            <div className="flex justify-between font-semibold border-t pt-1 mt-1" style={{ borderColor: accent, fontSize: isServiceRecord ? "0.95rem" : undefined }}>
              <span>{isServiceRecord ? "Paid Amount" : "Total"}</span><span>{fmtMoney(data.totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      );
    }

    case "terms": {
      // Was `config.text || data.notes || company.termsAndConditions` --
      // whichever came first WON outright, so whenever a document also had
      // device/issue notes (almost always, for a job sheet), the actual
      // business Terms & Conditions text never rendered at all. These are
      // two different things -- render both, independently, when present.
      const termsText = (block.config?.text as string) || data.company?.termsAndConditions;
      const isServiceStyle = data.docTypeLabel === "WORK ORDER" || data.docTypeLabel === "SERVICE RECORD";
      if (isServiceStyle) {
        return (
          <div className="space-y-3">
            {data.notes && (
              <div className="border border-gray-200 rounded p-3">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Notes</p>
                <p className="text-xs text-gray-600 whitespace-pre-line">{data.notes}</p>
              </div>
            )}
            {termsText && (
              <div className="border border-gray-200 rounded p-3">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Terms &amp; Conditions</p>
                <p className="text-[11px] leading-relaxed text-gray-600 whitespace-pre-line">{termsText}</p>
              </div>
            )}
          </div>
        );
      }
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

    case "signature": {
      // When signedByName is set (currently: CrmJobSheet's ccoName on a
      // Workorder print), the issuer's signatory sits on the LEFT with
      // their actual name and the customer's on the right -- per explicit
      // direction. Every other document type leaves this field unset and
      // keeps the original customer-left/issuer-right arrangement.
      const issuerBlock = (
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
            {data.company.signedByName && <span className="block text-gray-400">{data.company.signedByName}</span>}
          </div>
        </div>
      );
      const customerBlock = (
        <div className="text-center text-xs text-gray-500">
          <div className="w-40 border-t border-gray-300 pt-1">
            Customer Signature
          </div>
        </div>
      );
      // Footer strip borrowed from the reference service-report layout --
      // shown below the signature line(s) on Workorder/Service Record
      // prints only, using whatever address/phone/hours/hotline this
      // document actually has (footerBand for hours/hotline, company for
      // address/phone -- see adapters.ts).
      const footerBandItems = [
        data.company.address,
        data.company.phone && `Phone: ${data.company.phone}`,
        data.footerBand?.hours && `Service Hours: ${data.footerBand.hours}`,
        data.footerBand?.hotline && `Hotline: ${data.footerBand.hotline}`,
      ].filter(Boolean) as string[];
      const footerBand = footerBandItems.length > 0 && (
        <div className="mt-6 pt-3 border-t border-gray-200 text-[10px] text-gray-400">
          {footerBandItems.join("  •  ")}
        </div>
      );
      if (data.docTypeLabel === "WORK ORDER") {
        return (
          <div>
            <p className="text-[11px] font-medium text-gray-700 mb-4">Signature constitutes agreement to the above terms.</p>
            <div className="flex justify-between">
              {data.company.signedByName ? issuerBlock : customerBlock}
              {data.company.signedByName ? customerBlock : issuerBlock}
            </div>
            {footerBand}
          </div>
        );
      }
      if (data.docTypeLabel === "SERVICE RECORD") {
        return (
          <div>
            <p className="text-[11px] font-medium text-gray-700 mb-4">Signature constitutes agreement to the above terms. <span className="inline-block w-56 border-b border-gray-400 align-middle ml-2" /></p>
            {footerBand}
          </div>
        );
      }
      return (
        <div className="flex justify-between pt-8">
          {data.company.signedByName ? issuerBlock : customerBlock}
          {data.company.signedByName ? customerBlock : issuerBlock}
        </div>
      );
    }

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
