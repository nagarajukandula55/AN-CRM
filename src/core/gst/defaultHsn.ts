/**
 * Default HSN code pre-filled on a new spare-part/material entry -- this
 * app is primarily used by mobile/electronics service centers, so most
 * parts added are electronic spares (screens, batteries, connectors,
 * boards) rather than a random mix of goods. 8517 covers "parts of
 * telephone sets, including smartphones, and other apparatus for
 * transmission/reception of voice/images/data" -- the closest single HSN
 * for the bulk of what gets added here. Always just a starting point in a
 * plain editable text field, never enforced -- a vendor stocking a
 * different category of spare (e.g. laptop/appliance parts under a
 * different HSN) can change it per part exactly as before.
 */
export const DEFAULT_SPARE_PART_HSN = "8517";

/**
 * SAC (Services Accounting Code) for a flat "Service Charge"/repair-labour
 * invoice line -- these aren't goods so an HSN doesn't apply; 9987 covers
 * "Maintenance, repair and installation (except construction) services".
 * Same "always editable, never enforced" spirit as DEFAULT_SPARE_PART_HSN
 * above -- just means the printed invoice line no longer shows a blank
 * HSN/SAC column for the Service Charge row.
 */
export const DEFAULT_SERVICE_CHARGE_HSN = "9987";
