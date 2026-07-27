/**
 * ONE-TIME: seed realistic sample data across most modules so an admin can
 * see what kind of information belongs in each one, per explicit request
 * ("add some dummy data to every module everywhere so I can get some idea
 * what type of info I can use in that module and what are the actuals").
 *
 * Spread across the two real businesses (E Commerce = product/catalog
 * modules, Service Flow = repair/CRM modules), plus a few shared modules
 * seeded on both. INSERT-ONLY / idempotent: every block checks a
 * "SAMPLE-" prefix or a distinguishing unique key first and skips if
 * already present, so this is safe to re-run.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedSampleData.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Customer from "../src/models/Customer";
import NativeProduct from "../src/models/NativeProduct";
import Brand from "../src/models/Brand";
import DeviceModel from "../src/models/DeviceModel";
import MaterialCategory from "../src/models/MaterialCategory";
import Material from "../src/models/Material";
import Coupon from "../src/models/Coupon";
import Warehouse from "../src/models/Warehouse";
import PurchaseOrder from "../src/models/PurchaseOrder";
import PurchaseOrderItem from "../src/models/PurchaseOrderItem";
import StockTransfer from "../src/models/StockTransfer";
import SalesInvoice from "../src/models/SalesInvoice";
import SalesDocument, { SALES_DOCUMENT_TYPES } from "../src/models/SalesDocument";
import CrmCall from "../src/models/CrmCall";
import CrmJobSheet from "../src/models/CrmJobSheet";
import FaultCode, { DEFAULT_FAULT_CODES } from "../src/models/FaultCode";
import SymptomCode, { DEFAULT_SYMPTOM_CODES } from "../src/models/SymptomCode";
import Solution from "../src/models/Solution";
import ServiceCenterBOM from "../src/models/ServiceCenterBOM";
import EmployeeProfile from "../src/models/EmployeeProfile";
import VendorProfile from "../src/models/VendorProfile";
import { generateDocumentNumber } from "../src/core/numbering/numberingService";

const ECOM_BIZ = "6a53e91f13ec6a86d3ccee44"; // E Commerce
const SERVICE_BIZ = "6a53f3abd8fb1575d5b9150e"; // Service Flow
const ADMIN_USER = "6a5292164eb35e6fb90c5885"; // real super admin, for createdBy refs

async function main() {
  await connectDB();

  // ── Customers (both businesses) ──────────────────────────────────────
  for (const [bizId, names] of [
    [ECOM_BIZ, ["Ravi Kumar", "Priya Sharma", "Amit Singh"]],
    [SERVICE_BIZ, ["Sunita Rao", "Vikram Mehta"]],
  ] as [string, string[]][]) {
    for (const name of names) {
      const exists = await Customer.findOne({ businessId: bizId, name }).catch(() => null);
      if (exists) continue;
      await Customer.create({
        businessId: bizId,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      } as any).catch(() => {});
    }
  }
  console.log("Seeded sample customers.");

  // ── Brands (both — device brands feed Service, product brands feed Ecommerce) ──
  const brandNames = ["Samsung", "Apple", "OnePlus"];
  const brandIds: Record<string, any> = {};
  for (const bizId of [ECOM_BIZ, SERVICE_BIZ]) {
    for (const name of brandNames) {
      let brand = await Brand.findOne({ businessId: bizId, name });
      if (!brand) {
        brand = await Brand.create({ businessId: bizId, name, businessScope: "SINGLE" } as any);
      }
      brandIds[`${bizId}:${name}`] = brand._id;
    }
  }
  console.log("Seeded sample brands.");

  // ── DeviceModel (Service Flow) ──────────────────────────────────────
  const deviceModels = [
    { brand: "Samsung", name: "Galaxy S23" },
    { brand: "Apple", name: "iPhone 14" },
  ];
  for (const dm of deviceModels) {
    const exists = await DeviceModel.findOne({ businessId: SERVICE_BIZ, name: dm.name });
    if (exists) continue;
    await DeviceModel.create({
      businessId: SERVICE_BIZ,
      brandId: brandIds[`${SERVICE_BIZ}:${dm.brand}`],
      name: dm.name,
      businessScope: "SINGLE",
    } as any);
  }
  console.log("Seeded sample device models.");

  // ── MaterialCategory + Material (E Commerce) ─────────────────────────
  let matCat = await MaterialCategory.findOne({ businessId: ECOM_BIZ, name: "Sample Electronics Components" });
  if (!matCat) {
    matCat = await MaterialCategory.create({ businessId: ECOM_BIZ, name: "Sample Electronics Components" } as any);
  }
  const materials = [
    { code: "SAMPLE-MAT-001", name: "USB-C Cable 1m" },
    { code: "SAMPLE-MAT-002", name: "Phone Screen Protector" },
    { code: "SAMPLE-MAT-003", name: "Charging Adapter 20W" },
  ];
  for (const m of materials) {
    const exists = await Material.findOne({ materialCode: m.code });
    if (exists) continue;
    await Material.create({
      businessId: ECOM_BIZ,
      materialCode: m.code,
      materialName: m.name,
      categoryId: matCat._id,
      purchaseUnit: "pcs",
      stockUnit: "pcs",
      consumptionUnit: "pcs",
    } as any);
  }
  console.log("Seeded sample materials.");

  // ── NativeProduct (E Commerce storefront) ────────────────────────────
  const products = [
    { name: "Wireless Bluetooth Earbuds", price: 1999, mrp: 2999 },
    { name: "Smart Fitness Band", price: 1499, mrp: 2199 },
    { name: "Portable Power Bank 10000mAh", price: 999, mrp: 1499 },
  ];
  for (const p of products) {
    const slug = `sample-${p.name.toLowerCase().replace(/\s+/g, "-")}`;
    const exists = await NativeProduct.findOne({ slug });
    if (exists) continue;
    await NativeProduct.create({
      businessId: ECOM_BIZ,
      name: p.name,
      slug,
      price: p.price,
      mrp: p.mrp,
      stock: 50,
    } as any).catch(() => {});
  }
  console.log("Seeded sample products.");

  // ── Coupon (E Commerce) ───────────────────────────────────────────────
  const coupons = [
    { code: "SAMPLE10", discountType: "PERCENTAGE", discountValue: 10 },
    { code: "SAMPLE200", discountType: "FIXED", discountValue: 200 },
  ];
  for (const c of coupons) {
    const exists = await Coupon.findOne({ businessId: ECOM_BIZ, code: c.code });
    if (exists) continue;
    await Coupon.create({
      businessId: ECOM_BIZ,
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      createdBy: ADMIN_USER,
    } as any).catch(() => {});
  }
  console.log("Seeded sample coupons.");

  // ── Warehouse (Service Flow needs a SERVICE_CENTER one) ──────────────
  let serviceWarehouse = await Warehouse.findOne({ businessId: SERVICE_BIZ, warehouseType: "SERVICE_CENTER" });
  if (!serviceWarehouse) {
    serviceWarehouse = await Warehouse.create({
      businessId: SERVICE_BIZ,
      warehouseCode: "SAMPLE-SC-001",
      warehouseName: "Sample Service Center",
      warehouseType: "SERVICE_CENTER",
    } as any);
  }
  console.log("Seeded sample service-center warehouse.");

  // ── PurchaseOrder + Item (E Commerce) ─────────────────────────────────
  const ecomVendor = await VendorProfile.findOne({ businessId: ECOM_BIZ });
  const ecomWarehouse = await Warehouse.findOne({ businessId: ECOM_BIZ });
  const sampleMaterial = await Material.findOne({ materialCode: "SAMPLE-MAT-001" });
  if (ecomVendor && ecomWarehouse && sampleMaterial) {
    const existingPo = await PurchaseOrder.findOne({ poNumber: "SAMPLE-PO-0001" });
    if (!existingPo) {
      const po = await PurchaseOrder.create({
        businessId: ECOM_BIZ,
        vendorId: ecomVendor._id,
        warehouseId: ecomWarehouse._id,
        poNumber: "SAMPLE-PO-0001",
        status: "APPROVED",
        createdBy: ADMIN_USER,
      } as any);
      await PurchaseOrderItem.create({
        purchaseOrderId: po._id,
        businessId: ECOM_BIZ,
        materialId: sampleMaterial._id,
        materialCode: sampleMaterial.materialCode,
        materialName: sampleMaterial.materialName,
        orderedQuantity: 100,
        unit: "pcs",
        unitPrice: 45,
      } as any);
      console.log("Seeded sample purchase order.");
    }
  }

  // ── StockTransfer (E Commerce) ────────────────────────────────────────
  const existingTransfer = await StockTransfer.findOne({ transferNumber: "SAMPLE-TRF-0001" });
  if (!existingTransfer) {
    await StockTransfer.create({
      businessId: ECOM_BIZ,
      transferNumber: "SAMPLE-TRF-0001",
      fromWarehouse: "Native Warehouse",
      toWarehouse: "Sample Overflow Storage",
      items: [{ itemId: sampleMaterial?._id, itemName: "USB-C Cable 1m", quantity: 20, unit: "pcs", unitCost: 45 }],
      status: "DRAFT",
    } as any);
    console.log("Seeded sample stock transfer.");
  }

  // ── SalesInvoice (both) ───────────────────────────────────────────────
  for (const [bizId, custName, invType] of [
    [ECOM_BIZ, "Ravi Kumar", "B2C"],
    [SERVICE_BIZ, "Sunita Rao", "STANDARD"],
  ] as [string, string, string][]) {
    const existing = await SalesInvoice.findOne({ businessId: bizId, "customer.name": custName, notes: "SAMPLE" });
    if (existing) continue;
    const { value: invoiceNumber } = await generateDocumentNumber(bizId, "INVOICE");
    await SalesInvoice.create({
      businessId: bizId,
      invoiceNumber,
      invoiceType: invType,
      customer: { name: custName, phone: "9876543210", address: "Sample Address, City" },
      items: [{ description: "Sample Service/Product Charge", quantity: 1, unitPrice: 500, taxRate: 18, total: 590 }],
      subtotal: 500,
      taxTotal: 90,
      grandTotal: 590,
      status: "SENT",
      notes: "SAMPLE",
    } as any).catch(() => {});
  }
  console.log("Seeded sample sales invoices.");

  // ── SalesDocument (one of each of the 5 types, both businesses) ──────
  for (const bizId of [ECOM_BIZ, SERVICE_BIZ]) {
    for (const docType of SALES_DOCUMENT_TYPES) {
      const existing = await SalesDocument.findOne({ businessId: bizId, docType, "party.name": "Sample Party" });
      if (existing) continue;
      const { value: docNumber } = await generateDocumentNumber(bizId, docType);
      await SalesDocument.create({
        businessId: bizId,
        docType,
        docNumber,
        party: { name: "Sample Party", address: "123 Sample Street", phone: "9123456780", email: "sample.party@example.com" },
        items: [{ description: "Sample line item", quantity: 2, unitPrice: 250, taxRate: 18 }],
        subtotal: 500,
        taxTotal: 90,
        grandTotal: 590,
        createdBy: ADMIN_USER,
      } as any).catch(() => {});
    }
  }
  console.log("Seeded sample sales documents (quotation/challan/credit-debit-note/proforma).");

  // ── CrmCall + CrmJobSheet (Service Flow) ─────────────────────────────
  for (let i = 1; i <= 2; i++) {
    const callNumber = `SAMPLE-CALL-000${i}`;
    const existing = await CrmCall.findOne({ callNumber });
    if (existing) continue;
    await CrmCall.create({
      businessId: SERVICE_BIZ,
      callNumber,
      customerName: i === 1 ? "Sunita Rao" : "Vikram Mehta",
      phone: "9876500000",
      subject: i === 1 ? "Phone screen cracked, needs repair estimate" : "AC not cooling, service request",
    } as any).catch(() => {});
  }
  for (let i = 1; i <= 2; i++) {
    const jobSheetNumber = `SAMPLE-JOB-000${i}`;
    const existing = await CrmJobSheet.findOne({ jobSheetNumber });
    if (existing) continue;
    await CrmJobSheet.create({
      businessId: SERVICE_BIZ,
      jobSheetNumber,
      customerName: i === 1 ? "Sunita Rao" : "Vikram Mehta",
      phone: "9876500000",
      title: i === 1 ? "Screen replacement — Galaxy S23" : "AC gas refill and service",
      createdBy: ADMIN_USER,
    } as any).catch(() => {});
  }
  console.log("Seeded sample CRM calls and job sheets.");

  // ── FaultCode / SymptomCode (reuse the shipped default datasets) ─────
  for (const fc of DEFAULT_FAULT_CODES) {
    const exists = await FaultCode.findOne({ code: fc.code, businessId: null });
    if (exists) continue;
    await FaultCode.create({ ...fc, businessId: null } as any).catch(() => {});
  }
  for (const sc of DEFAULT_SYMPTOM_CODES) {
    const exists = await SymptomCode.findOne({ code: sc.code, businessId: null });
    if (exists) continue;
    await SymptomCode.create({ ...sc, businessId: null } as any).catch(() => {});
  }
  console.log("Seeded default fault codes and symptom codes (platform-wide).");

  // ── Solution (Service Flow) ──────────────────────────────────────────
  const solutions = [
    { code: "SAMPLE-SOL-001", description: "Replace screen assembly and recalibrate touch digitizer" },
    { code: "SAMPLE-SOL-002", description: "Clean charging port and replace battery if health below 80%" },
    { code: "SAMPLE-SOL-003", description: "Refill refrigerant gas and check for leaks in coil" },
  ];
  for (const s of solutions) {
    const exists = await Solution.findOne({ code: s.code });
    if (exists) continue;
    await Solution.create(s as any).catch(() => {});
  }
  console.log("Seeded sample solutions.");

  // ── ServiceCenterBOM (Service Flow) ───────────────────────────────────
  const serviceVendor = await VendorProfile.findOne({ businessId: SERVICE_BIZ });
  if (serviceVendor) {
    const parts = [
      { partCode: "SAMPLE-PART-001", partName: "Galaxy S23 Screen Assembly", hsnCode: "8517", gstRate: 18, rate: 3500 },
      { partCode: "SAMPLE-PART-002", partName: "iPhone 14 Battery", hsnCode: "8507", gstRate: 18, rate: 1800 },
    ];
    for (const p of parts) {
      const exists = await ServiceCenterBOM.findOne({ businessId: SERVICE_BIZ, vendorId: serviceVendor._id, partCode: p.partCode });
      if (exists) continue;
      await ServiceCenterBOM.create({ businessId: SERVICE_BIZ, vendorId: serviceVendor._id, ...p } as any).catch(() => {});
    }
    console.log("Seeded sample service-center BOM (repair parts price list).");
  }

  // ── EmployeeProfile (both) ────────────────────────────────────────────
  for (const [bizId, name, dept] of [
    [ECOM_BIZ, "Sample Warehouse Staff", "Operations"],
    [SERVICE_BIZ, "Sample Repair Technician", "Service"],
  ] as [string, string, string][]) {
    const exists = await EmployeeProfile.findOne({ businessId: bizId, name });
    if (exists) continue;
    await EmployeeProfile.create({
      businessId: bizId,
      name,
      department: dept,
      designation: dept === "Operations" ? "Warehouse Executive" : "Service Technician",
      employmentType: "FULL_TIME",
      status: "ACTIVE",
    } as any).catch(() => {});
  }
  console.log("Seeded sample employee profiles.");

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
