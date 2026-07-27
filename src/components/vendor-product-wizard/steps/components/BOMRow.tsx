"use client";

import MaterialSearchSelect from "@/components/shared/MaterialSearchSelect";

const RATE_UNITS = ["kg", "g", "l", "ml", "pcs"];

// A row silently started as "Ingredient" by default (the initial state in
// StepBOM's addRow()) unless the vendor manually flipped the Type dropdown
// -- in practice, packaging materials (pouch, label, carton) very often got
// left as Ingredient, which leaked them into the Compliance step's
// ingredients list/nutrition/allergen estimate (that step only reads
// INGREDIENT-classified rows, correctly, but the classification itself was
// wrong at the source). Prefer the material's own `materialType` (set once,
// authoritatively, on the Material record) when it's picked; fall back to a
// name hint only for materials that predate that field.
const PACKAGING_NAME_HINT = /pouch|box|carton|label|sticker|container|wrapper|\bbag\b|bottle|\bcap\b|\blid\b|tape|jar/i;

const PACKAGING_MATERIAL_TYPES = new Set(["PACKAGING_MATERIAL", "LABEL", "BOX", "CONSUMABLE"]);

function guessMaterialType(materialName: string, sourceMaterialType?: string): BOMRowData["materialType"] {
  if (sourceMaterialType === "SERVICE") return "OTHER";
  if (sourceMaterialType && PACKAGING_MATERIAL_TYPES.has(sourceMaterialType)) return "PACKAGING";
  if (sourceMaterialType === "RAW_MATERIAL" || sourceMaterialType === "SEMI_FINISHED") return "INGREDIENT";
  return PACKAGING_NAME_HINT.test(materialName || "") ? "PACKAGING" : "INGREDIENT";
}

interface BOMRowData {
  bomId?: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  wastagePercent: number;
  currentRate: number;
  materialType: "INGREDIENT" | "PACKAGING" | "OTHER";
  rateUnit: string;
}

interface Props {
  row: BOMRowData;
  index: number;
  updateRow: (
    index: number,
    field: keyof BOMRowData,
    value: any
  ) => void;
  saveRow: (row: BOMRowData) => void;
  deleteRow: (id: string) => void;
  error?: string;
  justSaved?: boolean;
}

export default function BOMRow({
  row,
  index,
  updateRow,
  saveRow,
  deleteRow,
  error,
  justSaved,
}: Props) {
  return (
    <div className="border rounded p-3 space-y-2">
    <div className="grid grid-cols-7 gap-2">

      <MaterialSearchSelect
        value={row.materialId ? { _id: row.materialId, materialName: row.materialName, materialCode: "", unit: row.unit } : null}
        allowVendorCreate
        onSelect={(m: any) => {
          updateRow(index, "materialId", m._id);
          updateRow(index, "materialName", m.materialName);
          updateRow(index, "unit", m.unit);
          updateRow(index, "rateUnit", m.unit);
          // Auto-fill from the material's own current price so the vendor
          // doesn't have to re-type the same rate on every product that
          // uses this material -- they can still override it below.
          if (m.currentPrice) updateRow(index, "currentRate", m.currentPrice);
          // Only guess on a fresh row (no material picked yet) -- never
          // override a Type the vendor already deliberately set.
          if (!row.materialId) updateRow(index, "materialType", guessMaterialType(m.materialName, m.materialType));
        }}
      />

      <select
        className="border rounded p-2"
        title="Is this material an ingredient, packaging, or something else?"
        value={row.materialType || "INGREDIENT"}
        onChange={(e) => updateRow(index, "materialType", e.target.value)}
      >
        <option value="INGREDIENT">Ingredient</option>
        <option value="PACKAGING">Packaging</option>
        <option value="OTHER">Other</option>
      </select>

      <input
        type="number"
        className="border rounded p-2"
        placeholder="Qty"
        title="Quantity of this material required"
        value={row.quantity}
        onFocus={(e) => e.target.select()}
        onChange={(e) =>
          updateRow(index, "quantity", Number(e.target.value))
        }
      />

      <input
        className="border rounded p-2"
        placeholder="Unit"
        title="Unit of measurement (e.g. kg, pcs)"
        value={row.unit}
        onChange={(e) =>
          updateRow(index, "unit", e.target.value)
        }
      />

      <input
        type="number"
        className="border rounded p-2"
        placeholder="Wastage %"
        title="Wastage percentage for this material"
        value={row.wastagePercent}
        onFocus={(e) => e.target.select()}
        onChange={(e) =>
          updateRow(
            index,
            "wastagePercent",
            Number(e.target.value)
          )
        }
      />

      <div className="flex gap-1">
        <input
          type="number"
          className="border rounded p-2 min-w-0 flex-1"
          placeholder="Rate"
          title="Rate quoted per the unit selected to the right (e.g. price per kg) — quantity above can be in a smaller unit (e.g. 250 g used), converted automatically"
          value={row.currentRate}
          onFocus={(e) => e.target.select()}
          onChange={(e) =>
            updateRow(
              index,
              "currentRate",
              Number(e.target.value)
            )
          }
        />
        <select
          className="border rounded p-1 text-xs w-16"
          title="Unit the rate above is quoted per (e.g. ₹/kg)"
          value={row.rateUnit || row.unit}
          onChange={(e) => updateRow(index, "rateUnit", e.target.value)}
        >
          {RATE_UNITS.map((u) => (
            <option key={u} value={u}>/{u}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1">
        <button
          onClick={() => saveRow(row)}
          disabled={!row.materialId}
          title={!row.materialId ? "Select a material above first" : undefined}
          className="bg-green-600 text-white rounded px-3 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>

        {row.bomId && (
          <button
            onClick={() => deleteRow(row.bomId!)}
            className="bg-red-600 text-white rounded px-3"
          >
            Delete
          </button>
        )}
      </div>

    </div>

    {error && (
      <p className="text-xs text-red-600">{error}</p>
    )}
    {justSaved && !error && (
      <p className="text-xs text-emerald-600">✓ Saved</p>
    )}
    {!row.bomId && !error && !justSaved && row.materialId && (
      <p className="text-xs text-amber-600">Not saved yet — click Save to add this to the BOM.</p>
    )}
    </div>
  );
}
