/* =========================================================
UNIT GROUPS
========================================================= */

const WEIGHT_UNITS: Record<string, number> = {
  MG: 0.000001,
  GM: 0.001,
  KG: 1,
  TON: 1000,
};

const VOLUME_UNITS: Record<string, number> = {
  ML: 0.001,
  LTR: 1,
};

const COUNT_UNITS: Record<string, number> = {
  PCS: 1,
  NOS: 1,
  BOX: 1,
  PACK: 1,
  BOTTLE: 1,
  JAR: 1,
  BAG: 1,
};

/* =========================================================
GET UNIT GROUP
========================================================= */

function getUnitGroup(unit: string) {
  const u = unit?.toUpperCase();

  if (WEIGHT_UNITS[u]) return "WEIGHT";

  if (VOLUME_UNITS[u]) return "VOLUME";

  if (COUNT_UNITS[u]) return "COUNT";

  return null;
}

/* =========================================================
CONVERT QUANTITY
========================================================= */

export function convertQuantity(
  quantity: number,
  fromUnit: string,
  toUnit: string
): number {
  const from = fromUnit?.toUpperCase();
  const to = toUnit?.toUpperCase();

  if (!from || !to) {
    throw new Error("Invalid unit");
  }

  if (from === to) {
    return quantity;
  }

  const fromGroup = getUnitGroup(from);
  const toGroup = getUnitGroup(to);

  if (!fromGroup || !toGroup) {
    throw new Error(
      `Unsupported unit conversion: ${from} → ${to}`
    );
  }

  if (fromGroup !== toGroup) {
    throw new Error(
      `Cannot convert ${from} → ${to}`
    );
  }

  /* ================= WEIGHT ================= */

  if (fromGroup === "WEIGHT") {
    const baseKg =
      quantity * WEIGHT_UNITS[from];

    return baseKg / WEIGHT_UNITS[to];
  }

  /* ================= VOLUME ================= */

  if (fromGroup === "VOLUME") {
    const baseLtr =
      quantity * VOLUME_UNITS[from];

    return baseLtr / VOLUME_UNITS[to];
  }

  /* ================= COUNT ================= */

  return quantity;
}

/* =========================================================
CONVERT TO STOCK UNIT
========================================================= */

export function convertToStockUnit(
  quantity: number,
  material: any,
  sourceUnit?: string
): number {
  const fromUnit =
    sourceUnit ||
    material.consumptionUnit;

  const toUnit =
    material.stockUnit;

  return convertQuantity(
    quantity,
    fromUnit,
    toUnit
  );
}

/* =========================================================
CONVERT TO CONSUMPTION UNIT
========================================================= */

export function convertToConsumptionUnit(
  quantity: number,
  material: any,
  sourceUnit?: string
): number {
  const fromUnit =
    sourceUnit ||
    material.stockUnit;

  const toUnit =
    material.consumptionUnit;

  return convertQuantity(
    quantity,
    fromUnit,
    toUnit
  );
}

/* =========================================================
CONVERT TO PURCHASE UNIT
========================================================= */

export function convertToPurchaseUnit(
  quantity: number,
  material: any,
  sourceUnit?: string
): number {
  const fromUnit =
    sourceUnit ||
    material.stockUnit;

  const toUnit =
    material.purchaseUnit;

  return convertQuantity(
    quantity,
    fromUnit,
    toUnit
  );
}

/* =========================================================
RATE CONVERSION
========================================================= */

export function convertRate(
  rate: number,
  fromUnit: string,
  toUnit: string
): number {
  const qty = convertQuantity(
    1,
    toUnit,
    fromUnit
  );

  return rate / qty;
}
