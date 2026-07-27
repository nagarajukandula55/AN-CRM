/**
 * ONE-TIME: seed real, commonsense fault/symptom codes for every Device
 * Category, so Fault Code / Symptom Code pickers aren't empty ("uncategorized")
 * for anything outside Mobile. Per explicit request ("we need to device
 * faults and symptoms of Mobile, TV, Tablet etc for all available Product
 * Category types").
 *
 * Mobile already has a decent starter set (DEFAULT_FAULT_CODES /
 * DEFAULT_SYMPTOM_CODES in FaultCode.ts/SymptomCode.ts, auto-seeded
 * globally on first API call) -- this script backfills `deviceCategory:
 * "MOBILE"` onto the subset of those whose existing `category` (component)
 * is genuinely mobile-relevant, and adds a fresh set of 10-15 fault codes +
 * 8-10 symptom codes, grouped by component, for every other category.
 *
 * IDEMPOTENT: every code is looked up by its unique {businessId, code} key
 * before creating; an existing default code only gets `deviceCategory`
 * backfilled if unset, never overwritten.
 *
 * HOW TO RUN:
 *   npx tsx --env-file=.env.local scripts/seedFaultSymptomCodes.ts
 */

import { connectDB } from "../src/core/db/mongodb";
import Business from "../src/models/Business";
import FaultCode, { DEFAULT_FAULT_CODES } from "../src/models/FaultCode";
import SymptomCode, { DEFAULT_SYMPTOM_CODES } from "../src/models/SymptomCode";
import type { DeviceCategory } from "../src/core/catalog/deviceCategory";

type CodeSeed = { code: string; description: string; category: string };

// Existing DEFAULT_FAULT_CODES/DEFAULT_SYMPTOM_CODES component categories
// that are genuinely mobile-relevant -- everything else (Electricals,
// Electronics, Accessory) stays uncategorized since those entries are
// ambiguous/appliance-leaning and the dedicated per-category codes below
// already cover that ground properly.
const MOBILE_RELEVANT_FAULT_CATEGORIES = new Set(["Display", "Battery", "Charging", "Camera", "Network", "Software", "General"]);
// FC-024 ("No picture but has sound (TV)") is mislabeled under "Display" in
// the original generic list -- it's TV-specific, not mobile.
const TV_MISLABELED_CODES: Record<string, DeviceCategory> = { "FC-024": "TELEVISION", "FC-025": "TELEVISION" };

const FAULT_DATA: Partial<Record<DeviceCategory, CodeSeed[]>> = {
  LAPTOP: [
    { code: "FC-LAP-001", description: "Screen flickering / lines on screen", category: "Display" },
    { code: "FC-LAP-002", description: "Screen hinge broken or loose", category: "Display" },
    { code: "FC-LAP-003", description: "Battery not charging", category: "Battery" },
    { code: "FC-LAP-004", description: "Battery draining fast", category: "Battery" },
    { code: "FC-LAP-005", description: "Keys not working / sticky keyboard", category: "Keyboard" },
    { code: "FC-LAP-006", description: "Trackpad not responding", category: "Trackpad" },
    { code: "FC-LAP-007", description: "Hard disk / SSD failure - not booting", category: "Storage" },
    { code: "FC-LAP-008", description: "Slow performance due to storage issue", category: "Storage" },
    { code: "FC-LAP-009", description: "Laptop not powering on", category: "Motherboard" },
    { code: "FC-LAP-010", description: "Overheating / fan noise", category: "Cooling" },
    { code: "FC-LAP-011", description: "OS crash / blue screen", category: "Software" },
    { code: "FC-LAP-012", description: "USB / charging port not working", category: "Ports" },
    { code: "FC-LAP-013", description: "Liquid damage", category: "General" },
    { code: "FC-LAP-014", description: "Physical damage to body", category: "General" },
  ],
  DESKTOP: [
    { code: "FC-DSK-001", description: "Monitor - no display output", category: "Display" },
    { code: "FC-DSK-002", description: "Power supply failure - system not turning on", category: "PSU" },
    { code: "FC-DSK-003", description: "Random shutdowns / restarts", category: "Motherboard" },
    { code: "FC-DSK-004", description: "Hard disk / SSD failure", category: "Storage" },
    { code: "FC-DSK-005", description: "Slow boot / performance issue", category: "Storage" },
    { code: "FC-DSK-006", description: "Keyboard / mouse not detected", category: "Peripherals" },
    { code: "FC-DSK-007", description: "CPU / cabinet fan noise or failure", category: "Cooling" },
    { code: "FC-DSK-008", description: "Overheating", category: "Cooling" },
    { code: "FC-DSK-009", description: "OS not booting", category: "Software" },
    { code: "FC-DSK-010", description: "Frequent crashes / BSOD", category: "Software" },
    { code: "FC-DSK-011", description: "No display, no power (dead system)", category: "General" },
    { code: "FC-DSK-012", description: "Physical damage to cabinet / ports", category: "General" },
  ],
  TABLET: [
    { code: "FC-TAB-001", description: "Screen cracked / physically damaged", category: "Display" },
    { code: "FC-TAB-002", description: "Screen not turning on", category: "Display" },
    { code: "FC-TAB-003", description: "Touch screen unresponsive", category: "Touch" },
    { code: "FC-TAB-004", description: "Battery draining fast", category: "Battery" },
    { code: "FC-TAB-005", description: "Battery not charging", category: "Battery" },
    { code: "FC-TAB-006", description: "Charging port loose", category: "Charging" },
    { code: "FC-TAB-007", description: "Camera not working", category: "Camera" },
    { code: "FC-TAB-008", description: "Speaker not working", category: "Audio" },
    { code: "FC-TAB-009", description: "Device hangs / freezes", category: "Software" },
    { code: "FC-TAB-010", description: "Software update failed", category: "Software" },
    { code: "FC-TAB-011", description: "Power / volume button not working", category: "Buttons" },
    { code: "FC-TAB-012", description: "Water damage", category: "General" },
  ],
  TELEVISION: [
    { code: "FC-TV-001", description: "No picture, has sound", category: "Display Panel" },
    { code: "FC-TV-002", description: "Lines / spots on screen", category: "Display Panel" },
    { code: "FC-TV-003", description: "Screen cracked", category: "Display Panel" },
    { code: "FC-TV-004", description: "Backlight not working (dim / dark screen)", category: "Backlight" },
    { code: "FC-TV-005", description: "TV not switching on", category: "Power Supply" },
    { code: "FC-TV-006", description: "TV switches off automatically", category: "Power Supply" },
    { code: "FC-TV-007", description: "No sound / distorted sound", category: "Audio" },
    { code: "FC-TV-008", description: "Remote control not working", category: "Remote" },
    { code: "FC-TV-009", description: "Wi-Fi / smart features not working", category: "Connectivity" },
    { code: "FC-TV-010", description: "HDMI / USB port not detecting", category: "Ports" },
    { code: "FC-TV-011", description: "Software update failure / apps crashing", category: "Software" },
    { code: "FC-TV-012", description: "Physical damage to screen / body", category: "General" },
  ],
  REFRIGERATOR: [
    { code: "FC-REF-001", description: "Not cooling properly", category: "Cooling" },
    { code: "FC-REF-002", description: "Compressor not running", category: "Compressor" },
    { code: "FC-REF-003", description: "Compressor making loud noise", category: "Compressor" },
    { code: "FC-REF-004", description: "Door not sealing properly (gasket worn)", category: "Door Seal" },
    { code: "FC-REF-005", description: "Ice maker / freezer not freezing", category: "Ice-Making" },
    { code: "FC-REF-006", description: "Water leakage from unit", category: "Drainage" },
    { code: "FC-REF-007", description: "Drain blockage", category: "Drainage" },
    { code: "FC-REF-008", description: "Refrigerator not powering on", category: "Electrical" },
    { code: "FC-REF-009", description: "Thermostat / temperature control faulty", category: "Electrical" },
    { code: "FC-REF-010", description: "Interior light not working", category: "Lighting" },
    { code: "FC-REF-011", description: "Excessive frost buildup", category: "General" },
    { code: "FC-REF-012", description: "Unusual odor from unit", category: "General" },
  ],
  WASHING_MACHINE: [
    { code: "FC-WM-001", description: "Water not draining", category: "Drainage" },
    { code: "FC-WM-002", description: "Motor not running", category: "Motor" },
    { code: "FC-WM-003", description: "Unusual noise from motor", category: "Motor" },
    { code: "FC-WM-004", description: "Drum not rotating", category: "Drum" },
    { code: "FC-WM-005", description: "Door lock not working", category: "Door Lock" },
    { code: "FC-WM-006", description: "Water not filling", category: "Water Inlet" },
    { code: "FC-WM-007", description: "Inlet valve leakage", category: "Water Inlet" },
    { code: "FC-WM-008", description: "Machine not powering on", category: "Electrical" },
    { code: "FC-WM-009", description: "PCB / control panel fault", category: "Electrical" },
    { code: "FC-WM-010", description: "Not spinning properly", category: "Spin" },
    { code: "FC-WM-011", description: "Excessive vibration", category: "General" },
    { code: "FC-WM-012", description: "Water leakage from body", category: "General" },
  ],
  AIR_CONDITIONER: [
    { code: "FC-AC-001", description: "Not cooling properly", category: "Cooling" },
    { code: "FC-AC-002", description: "Compressor not starting", category: "Compressor" },
    { code: "FC-AC-003", description: "Compressor making loud noise", category: "Compressor" },
    { code: "FC-AC-004", description: "Gas leakage / low refrigerant", category: "Gas" },
    { code: "FC-AC-005", description: "Water leakage from indoor unit", category: "Drainage" },
    { code: "FC-AC-006", description: "Drain pipe blocked", category: "Drainage" },
    { code: "FC-AC-007", description: "Remote control not responding", category: "Remote" },
    { code: "FC-AC-008", description: "AC not powering on", category: "Electrical" },
    { code: "FC-AC-009", description: "PCB fault", category: "Electrical" },
    { code: "FC-AC-010", description: "Filter clogged / needs cleaning", category: "Filter" },
    { code: "FC-AC-011", description: "Foul smell from AC", category: "General" },
    { code: "FC-AC-012", description: "Outdoor unit noise / vibration", category: "General" },
  ],
  MICROWAVE: [
    { code: "FC-MW-001", description: "Not heating food properly", category: "Heating" },
    { code: "FC-MW-002", description: "Magnetron failure", category: "Heating" },
    { code: "FC-MW-003", description: "Turntable not rotating", category: "Turntable" },
    { code: "FC-MW-004", description: "Door not closing properly", category: "Door" },
    { code: "FC-MW-005", description: "Door latch / switch faulty", category: "Door" },
    { code: "FC-MW-006", description: "Buttons not responding", category: "Control Panel" },
    { code: "FC-MW-007", description: "Display not working", category: "Control Panel" },
    { code: "FC-MW-008", description: "Microwave not powering on", category: "Electrical" },
    { code: "FC-MW-009", description: "Sparking inside cavity", category: "Electrical" },
    { code: "FC-MW-010", description: "Interior light not working", category: "Lighting" },
    { code: "FC-MW-011", description: "Unusual noise during operation", category: "General" },
  ],
  SMARTWATCH: [
    { code: "FC-SW-001", description: "Screen not turning on", category: "Display" },
    { code: "FC-SW-002", description: "Screen cracked / damaged", category: "Display" },
    { code: "FC-SW-003", description: "Battery draining fast", category: "Battery" },
    { code: "FC-SW-004", description: "Not charging", category: "Battery" },
    { code: "FC-SW-005", description: "Charging pins / dock faulty", category: "Charging" },
    { code: "FC-SW-006", description: "Strap broken / loose", category: "Strap" },
    { code: "FC-SW-007", description: "Heart rate / step sensor not working", category: "Sensors" },
    { code: "FC-SW-008", description: "Device hangs / unresponsive", category: "Software" },
    { code: "FC-SW-009", description: "Bluetooth / app sync failure", category: "Software" },
    { code: "FC-SW-010", description: "Water damage", category: "Water Resistance" },
  ],
  HEADPHONE_EARBUD: [
    { code: "FC-AUD-001", description: "No sound output", category: "Speaker" },
    { code: "FC-AUD-002", description: "Distorted / crackling sound", category: "Speaker" },
    { code: "FC-AUD-003", description: "Battery draining fast", category: "Battery" },
    { code: "FC-AUD-004", description: "Not charging", category: "Battery" },
    { code: "FC-AUD-005", description: "Not pairing / connection drops", category: "Bluetooth" },
    { code: "FC-AUD-006", description: "Microphone not working (calls)", category: "Microphone" },
    { code: "FC-AUD-007", description: "Controls not responding", category: "Buttons" },
    { code: "FC-AUD-008", description: "One side / earbud not working", category: "General" },
    { code: "FC-AUD-009", description: "Water damage", category: "General" },
    { code: "FC-AUD-010", description: "Physical damage to casing", category: "General" },
  ],
  PRINTER_SCANNER: [
    { code: "FC-PRN-001", description: "Print quality poor (streaks / faded)", category: "Print Head" },
    { code: "FC-PRN-002", description: "Cartridge not detected", category: "Print Head" },
    { code: "FC-PRN-003", description: "Print head clogged", category: "Print Head" },
    { code: "FC-PRN-004", description: "Paper jam", category: "Paper Feed" },
    { code: "FC-PRN-005", description: "Paper not feeding", category: "Paper Feed" },
    { code: "FC-PRN-006", description: "Not connecting to Wi-Fi / USB", category: "Connectivity" },
    { code: "FC-PRN-007", description: "Not detected by computer", category: "Connectivity" },
    { code: "FC-PRN-008", description: "Printer not powering on", category: "Electrical" },
    { code: "FC-PRN-009", description: "Error code on display panel", category: "Control Panel" },
    { code: "FC-PRN-010", description: "Scanner not working (multi-function)", category: "General" },
  ],
};

const SYMPTOM_DATA: Partial<Record<DeviceCategory, CodeSeed[]>> = {
  LAPTOP: [
    { code: "SY-LAP-001", description: "Laptop does not power on", category: "General" },
    { code: "SY-LAP-002", description: "Blank / black screen", category: "Display" },
    { code: "SY-LAP-003", description: "Overheats during use", category: "General" },
    { code: "SY-LAP-004", description: "Slow performance / lag", category: "Software" },
    { code: "SY-LAP-005", description: "Battery drains fast", category: "Battery" },
    { code: "SY-LAP-006", description: "Does not charge", category: "Battery" },
    { code: "SY-LAP-007", description: "Unusual noise from fan", category: "General" },
    { code: "SY-LAP-008", description: "Keyboard / trackpad unresponsive", category: "General" },
    { code: "SY-LAP-009", description: "Frequent crashes / restarts", category: "Software" },
  ],
  DESKTOP: [
    { code: "SY-DSK-001", description: "System does not power on", category: "General" },
    { code: "SY-DSK-002", description: "No display on monitor", category: "Display" },
    { code: "SY-DSK-003", description: "Random shutdowns", category: "General" },
    { code: "SY-DSK-004", description: "Overheats during use", category: "General" },
    { code: "SY-DSK-005", description: "Slow performance", category: "Software" },
    { code: "SY-DSK-006", description: "Unusual noise", category: "General" },
    { code: "SY-DSK-007", description: "Peripherals not responding", category: "General" },
    { code: "SY-DSK-008", description: "Frequent restarts", category: "Software" },
  ],
  TABLET: [
    { code: "SY-TAB-001", description: "Tablet does not power on", category: "General" },
    { code: "SY-TAB-002", description: "Blank screen", category: "Display" },
    { code: "SY-TAB-003", description: "Touch not responding", category: "Display" },
    { code: "SY-TAB-004", description: "Battery drains fast", category: "Battery" },
    { code: "SY-TAB-005", description: "Does not charge", category: "Battery" },
    { code: "SY-TAB-006", description: "No sound from speaker", category: "Audio" },
    { code: "SY-TAB-007", description: "Frequent freezing / hangs", category: "Software" },
    { code: "SY-TAB-008", description: "Physical damage visible", category: "General" },
  ],
  TELEVISION: [
    { code: "SY-TV-001", description: "TV does not switch on", category: "General" },
    { code: "SY-TV-002", description: "No picture but has sound", category: "Display" },
    { code: "SY-TV-003", description: "No sound but has picture", category: "Audio" },
    { code: "SY-TV-004", description: "Screen flickering", category: "Display" },
    { code: "SY-TV-005", description: "Remote not responding", category: "General" },
    { code: "SY-TV-006", description: "Auto power off", category: "General" },
    { code: "SY-TV-007", description: "Smart features / apps not working", category: "Software" },
    { code: "SY-TV-008", description: "Distorted picture / lines on screen", category: "Display" },
  ],
  REFRIGERATOR: [
    { code: "SY-REF-001", description: "Not cooling", category: "General" },
    { code: "SY-REF-002", description: "Water leakage", category: "General" },
    { code: "SY-REF-003", description: "Loud / unusual noise", category: "General" },
    { code: "SY-REF-004", description: "Frost buildup", category: "General" },
    { code: "SY-REF-005", description: "Door not closing properly", category: "General" },
    { code: "SY-REF-006", description: "Does not power on", category: "General" },
    { code: "SY-REF-007", description: "Interior light not working", category: "General" },
    { code: "SY-REF-008", description: "Bad odor", category: "General" },
  ],
  WASHING_MACHINE: [
    { code: "SY-WM-001", description: "Machine does not power on", category: "General" },
    { code: "SY-WM-002", description: "Water not draining", category: "General" },
    { code: "SY-WM-003", description: "Excessive vibration / noise", category: "General" },
    { code: "SY-WM-004", description: "Not spinning", category: "General" },
    { code: "SY-WM-005", description: "Water leakage", category: "General" },
    { code: "SY-WM-006", description: "Door does not lock", category: "General" },
    { code: "SY-WM-007", description: "Water not filling", category: "General" },
    { code: "SY-WM-008", description: "Foul odor from drum", category: "General" },
  ],
  AIR_CONDITIONER: [
    { code: "SY-AC-001", description: "Not cooling", category: "General" },
    { code: "SY-AC-002", description: "Water leakage from indoor unit", category: "General" },
    { code: "SY-AC-003", description: "Unusual noise from unit", category: "General" },
    { code: "SY-AC-004", description: "Does not power on", category: "General" },
    { code: "SY-AC-005", description: "Remote not responding", category: "General" },
    { code: "SY-AC-006", description: "Foul smell while running", category: "General" },
    { code: "SY-AC-007", description: "Ice formation on unit", category: "General" },
    { code: "SY-AC-008", description: "Frequent auto shut-off", category: "General" },
  ],
  MICROWAVE: [
    { code: "SY-MW-001", description: "Not heating food", category: "General" },
    { code: "SY-MW-002", description: "Does not power on", category: "General" },
    { code: "SY-MW-003", description: "Turntable not rotating", category: "General" },
    { code: "SY-MW-004", description: "Sparking inside", category: "General" },
    { code: "SY-MW-005", description: "Door not closing properly", category: "General" },
    { code: "SY-MW-006", description: "Unusual noise", category: "General" },
    { code: "SY-MW-007", description: "Display / buttons not responding", category: "General" },
    { code: "SY-MW-008", description: "Burning smell", category: "General" },
  ],
  SMARTWATCH: [
    { code: "SY-SW-001", description: "Does not power on", category: "General" },
    { code: "SY-SW-002", description: "Blank / black screen", category: "Display" },
    { code: "SY-SW-003", description: "Battery drains fast", category: "Battery" },
    { code: "SY-SW-004", description: "Does not charge", category: "Battery" },
    { code: "SY-SW-005", description: "Not syncing with phone app", category: "Software" },
    { code: "SY-SW-006", description: "Touch not responding", category: "Display" },
    { code: "SY-SW-007", description: "Sensor readings inaccurate", category: "Sensors" },
    { code: "SY-SW-008", description: "Physical damage to strap / body", category: "General" },
  ],
  HEADPHONE_EARBUD: [
    { code: "SY-AUD-001", description: "No sound output", category: "Speaker" },
    { code: "SY-AUD-002", description: "Distorted / crackling sound", category: "Speaker" },
    { code: "SY-AUD-003", description: "Does not charge", category: "Battery" },
    { code: "SY-AUD-004", description: "Battery drains fast", category: "Battery" },
    { code: "SY-AUD-005", description: "Bluetooth not connecting", category: "Bluetooth" },
    { code: "SY-AUD-006", description: "Connection drops intermittently", category: "Bluetooth" },
    { code: "SY-AUD-007", description: "One side not working", category: "General" },
    { code: "SY-AUD-008", description: "Mic not working on calls", category: "Microphone" },
  ],
  PRINTER_SCANNER: [
    { code: "SY-PRN-001", description: "Does not power on", category: "General" },
    { code: "SY-PRN-002", description: "Paper jam", category: "Paper Feed" },
    { code: "SY-PRN-003", description: "Poor print quality", category: "Print Head" },
    { code: "SY-PRN-004", description: "Not connecting to network / USB", category: "Connectivity" },
    { code: "SY-PRN-005", description: "Cartridge / ink error", category: "Print Head" },
    { code: "SY-PRN-006", description: "Paper not feeding", category: "Paper Feed" },
    { code: "SY-PRN-007", description: "Error code displayed", category: "Control Panel" },
    { code: "SY-PRN-008", description: "Scanner not functioning", category: "General" },
  ],
};

async function backfillMobileDefaults() {
  let faultBackfilled = 0, symptomBackfilled = 0;

  for (const f of DEFAULT_FAULT_CODES) {
    const existing = await FaultCode.findOne({ businessId: null, code: f.code });
    if (!existing || existing.deviceCategory) continue;
    const target = TV_MISLABELED_CODES[f.code] || (MOBILE_RELEVANT_FAULT_CATEGORIES.has(f.category || "") ? "MOBILE" : null);
    if (!target) continue;
    existing.deviceCategory = target;
    await existing.save();
    faultBackfilled++;
  }

  for (const s of DEFAULT_SYMPTOM_CODES) {
    const existing = await SymptomCode.findOne({ businessId: null, code: s.code });
    if (!existing || existing.deviceCategory) continue;
    existing.deviceCategory = "MOBILE";
    await existing.save();
    symptomBackfilled++;
  }

  console.log(`Backfilled deviceCategory on ${faultBackfilled} default fault codes and ${symptomBackfilled} default symptom codes (global, businessId=null).`);
}

async function seedForBusiness(businessId: string) {
  let faultsCreated = 0, symptomsCreated = 0;

  for (const [category, codes] of Object.entries(FAULT_DATA)) {
    for (const seed of codes!) {
      const exists = await FaultCode.findOne({ businessId, code: seed.code });
      if (exists) continue;
      await FaultCode.create({
        businessId,
        code: seed.code,
        description: seed.description,
        category: seed.category,
        deviceCategory: category as DeviceCategory,
        businessScope: "SINGLE",
      } as any);
      faultsCreated++;
    }
  }

  for (const [category, codes] of Object.entries(SYMPTOM_DATA)) {
    for (const seed of codes!) {
      const exists = await SymptomCode.findOne({ businessId, code: seed.code });
      if (exists) continue;
      await SymptomCode.create({
        businessId,
        code: seed.code,
        description: seed.description,
        category: seed.category,
        deviceCategory: category as DeviceCategory,
        businessScope: "SINGLE",
      } as any);
      symptomsCreated++;
    }
  }

  console.log(`  businessId=${businessId}: ${faultsCreated} fault codes, ${symptomsCreated} symptom codes created.`);
}

async function main() {
  await connectDB();

  await backfillMobileDefaults();

  const businesses = await Business.find({}).select("_id name").lean();
  console.log(`Seeding fault/symptom codes for ${businesses.length} business(es)...`);

  for (const biz of businesses) {
    console.log(`Business: ${(biz as any).name || biz._id}`);
    await seedForBusiness(String(biz._id));
  }

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
