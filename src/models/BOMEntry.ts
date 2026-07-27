/**
 * BOMEntry — semantic alias for ServiceCenterBOM (see that file's header
 * for the full field mapping to the standard Material/BOM spec: Material
 * Code, Material Description, Mode, SN, HSN, Rate, Tax%).
 *
 * ServiceCenterBOM IS the canonical BOM model now, usable by Brand, SC and
 * POS alike -- this module exists purely so new, non-service-center code
 * (Brand/POS material lists) can `import BOM from "@/models/BOMEntry"`
 * without every call site having to know the model's original
 * service-center-specific name. Same Mongoose model/collection underneath
 * -- not a fork, not a migration.
 */

export {
  default,
  type IServiceCenterBOM as IBOMEntry,
  type ServiceCenterBOMPartType as BOMEntryMode,
} from "./ServiceCenterBOM";
