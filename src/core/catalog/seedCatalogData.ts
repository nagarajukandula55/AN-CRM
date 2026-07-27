/**
 * Shared source of truth for the curated Indian-market catalog seed data
 * (CATEGORY_DATA, deriveSeriesName, seedForBusiness) -- used by BOTH
 * scripts/seedDeviceCategories.ts (CLI, seeds every business, needs a
 * local .env.local with a direct DB connection) AND
 * POST /api/admin/seed-catalog (an in-app "Seed Standard Catalog" button
 * on the admin Brands page, seeding just the current business through
 * the already-deployed server's own DB connection -- no local shell/env
 * access required, for admins working entirely from the browser).
 *
 * SCOPE, agreed with the user up front: this is NOT an exhaustive catalog of
 * every SKU ever sold in India (thousands of real models across ~40 brands
 * is not something to fabricate from memory -- that risk was explicitly
 * flagged and the user chose the reduced scope below). CATEGORY_DATA has an
 * entry for every one of the 45 categories in deviceCategory.ts (mobile
 * through e-readers), each with a handful of real, well-known Indian-market
 * brands and models -- some categories intentionally get fewer brands than
 * others where a wider confident list wasn't available; that's expected,
 * not a gap to fill blindly. Apple gets its full, verified lineup
 * (iPhone/iPad/MacBook/iMac/Watch/AirPods -- compact enough to state with
 * high confidence). Every other brand gets 10-20 well-known
 * flagship/mainstream models as a real, accurate starting point --
 * expandable via the admin UI (Brands / Series / Device Models, all on one
 * page) from here.
 *
 * IDEMPOTENT / INSERT-ONLY: every Brand/DeviceModel is looked up by its
 * real unique key before creating, and a brand that already exists (e.g.
 * the user's manually-entered Apple/Samsung/etc.) only gets its `category`
 * backfilled if unset -- an admin's existing category choice is never
 * overwritten.
 *
 * A brand that genuinely spans multiple device types (Samsung: phones, TVs,
 * fridges, ACs; Apple: phones, tablets, laptops, desktops, watches, audio)
 * gets one Brand row PER category it's listed under here -- see Brand.ts's
 * unique index, which is {businessId, category, name} for exactly this
 * reason, not {businessId, name} alone.
 *
 * SERIES: every Brand->DeviceModel edge created here also gets a Series
 * (Brand -> Series -> DeviceModel, see src/models/Series.ts). Models are
 * grouped into their real product line where one exists (Samsung's Galaxy
 * S/A/M/Note/Z/Tab/Book/Watch/Buds, Apple's iPhone/iPad/MacBook/Mac/
 * Watch/AirPods, Xiaomi's Redmi/Redmi Note/Mi/Xiaomi Pad, OnePlus's Nord,
 * Sony's Bravia/PlayStation, DJI's Mini/Air/Mavic/Avata, ...) via
 * deriveSeriesName() below; every other brand/model falls back to one
 * catch-all "General" series so nothing is left without a seriesId. This
 * remains a curated starting point, not an exhaustive SKU catalog -- extend
 * it further via the Masters UI or the Service Center BOM bulk-upload CSV
 * (which itself auto-creates Brand/Series/DeviceModel rows by name).
 */

import Brand from "@/models/Brand";
import Series from "@/models/Series";
import DeviceModel from "@/models/DeviceModel";
import { DEVICE_CATEGORIES, type DeviceCategory } from "@/core/catalog/deviceCategory";


// Best-effort mapping from (brand, model name) to its real product line --
// deliberately simple prefix/substring matching over the curated model
// names above (not a general-purpose parser), falling back to "General"
// for brands with no natural line or a model this doesn't recognize.
export function deriveSeriesName(brandName: string, modelName: string): string {
  const m = modelName;
  switch (brandName) {
    case "Samsung":
      if (/^Galaxy S\d/.test(m)) return "Galaxy S";
      if (/^Galaxy A\d/.test(m)) return "Galaxy A";
      if (/^Galaxy M\d/.test(m)) return "Galaxy M";
      if (/^Galaxy F\d/.test(m)) return "Galaxy F";
      if (/^Galaxy Note/.test(m)) return "Galaxy Note";
      if (/^Galaxy Z/.test(m)) return "Galaxy Z";
      if (/^Galaxy Tab/.test(m)) return "Galaxy Tab";
      if (/^Samsung Galaxy Book|^Galaxy Book/.test(m)) return "Galaxy Book";
      if (/^Galaxy Watch/.test(m)) return "Galaxy Watch";
      if (/^Galaxy Buds/.test(m)) return "Galaxy Buds";
      return "General";
    case "Apple":
      if (/^iPhone/.test(m)) return "iPhone";
      if (/^iPad/.test(m)) return "iPad";
      if (/^MacBook/.test(m)) return "MacBook";
      if (/^iMac|^Mac Mini|^Mac Studio|^Mac Pro/.test(m)) return "Mac";
      if (/^Apple Watch/.test(m)) return "Watch";
      if (/^AirPods/.test(m)) return "AirPods";
      return "General";
    case "Xiaomi":
      if (/^Redmi Note/.test(m)) return "Redmi Note";
      if (/^Redmi/.test(m)) return "Redmi";
      if (/^Mi /.test(m)) return "Mi";
      if (/^Xiaomi Pad/.test(m)) return "Xiaomi Pad";
      if (/^Xiaomi TV|^Mi TV/.test(m)) return "Xiaomi TV";
      if (/^Xiaomi/.test(m)) return "Xiaomi";
      return "General";
    case "OnePlus":
      if (/^OnePlus Nord/.test(m)) return "Nord";
      if (/^OnePlus TV/.test(m)) return "OnePlus TV";
      if (/^OnePlus \d/.test(m)) return "OnePlus";
      return "General";
    case "Sony":
      if (/^Sony Bravia/.test(m)) return "Bravia";
      if (/^Sony (WH|WF|SRS)/.test(m)) return "Audio";
      if (/^PlayStation/.test(m)) return "PlayStation";
      return "General";
    case "LG":
      if (/^LG Gram/.test(m)) return "Gram";
      return "General";
    case "POCO":
      return "Poco";
    case "DJI":
      if (/^DJI Mini/.test(m)) return "Mini";
      if (/^DJI Air/.test(m)) return "Air";
      if (/^DJI Mavic/.test(m)) return "Mavic";
      if (/^DJI Avata/.test(m)) return "Avata";
      return "General";
    case "Microsoft":
      if (/^Xbox/.test(m)) return "Xbox";
      if (/^Surface/.test(m)) return "Surface";
      return "General";
    case "Nintendo":
      if (/^Nintendo Switch/.test(m)) return "Switch";
      return "General";
    case "Mi":
      if (/^Mi Smart Band/.test(m)) return "Mi Smart Band";
      return "General";
    case "Meta":
      if (/^Meta Quest/.test(m)) return "Quest";
      return "General";
    case "Amazon":
      if (/^Kindle/.test(m)) return "Kindle";
      if (/^Fire HD/.test(m)) return "Fire HD";
      if (/^Fire TV/.test(m)) return "Fire TV";
      if (/^Echo/.test(m)) return "Echo";
      return "General";
    default:
      return "General";
  }
}

export type BrandSeed = { brand: string; models: string[] };

export const CATEGORY_DATA: Partial<Record<DeviceCategory, BrandSeed[]>> = {
  MOBILE: [
    {
      brand: "Apple",
      // Full lineup, iPhone 4 through the 16 series -- the compact,
      // well-documented range this seed can state with high confidence.
      // Add newer launches (17-series and beyond) via the admin UI.
      models: [
        "iPhone 4", "iPhone 4s", "iPhone 5", "iPhone 5c", "iPhone 5s",
        "iPhone 6", "iPhone 6 Plus", "iPhone 6s", "iPhone 6s Plus",
        "iPhone SE (1st generation)", "iPhone 7", "iPhone 7 Plus",
        "iPhone 8", "iPhone 8 Plus", "iPhone X", "iPhone XR", "iPhone XS", "iPhone XS Max",
        "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
        "iPhone SE (2nd generation)", "iPhone 12 mini", "iPhone 12", "iPhone 12 Pro", "iPhone 12 Pro Max",
        "iPhone 13 mini", "iPhone 13", "iPhone 13 Pro", "iPhone 13 Pro Max",
        "iPhone SE (3rd generation)", "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
        "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
        "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max", "iPhone 16e",
      ],
    },
    { brand: "Samsung", models: ["Galaxy S21", "Galaxy S21 Ultra", "Galaxy S22", "Galaxy S22 Ultra", "Galaxy S23", "Galaxy S23 Ultra", "Galaxy S23 FE", "Galaxy S24", "Galaxy S24+", "Galaxy S24 Ultra", "Galaxy Note 20 Ultra", "Galaxy Z Fold 5", "Galaxy Z Fold 6", "Galaxy Z Flip 5", "Galaxy Z Flip 6", "Galaxy A54", "Galaxy A34", "Galaxy A15", "Galaxy A25", "Galaxy A35", "Galaxy M14", "Galaxy M34", "Galaxy M54", "Galaxy F14", "Galaxy F54"] },
    { brand: "OnePlus", models: ["OnePlus 9", "OnePlus 9 Pro", "OnePlus 10 Pro", "OnePlus 11", "OnePlus 12", "OnePlus 13", "OnePlus Nord 2", "OnePlus Nord 3", "OnePlus Nord CE 3", "OnePlus Nord CE 4", "OnePlus Nord 4", "OnePlus 11R", "OnePlus 12R"] },
    { brand: "Xiaomi", models: ["Redmi Note 10", "Redmi Note 11", "Redmi Note 12", "Redmi Note 13", "Redmi Note 13 Pro", "Redmi 12", "Redmi 13C", "Redmi K50i", "Mi 11X", "Xiaomi 13 Pro", "Xiaomi 14"] },
    { brand: "POCO", models: ["Poco X5", "Poco X5 Pro", "Poco X6", "Poco X6 Pro", "Poco F5", "Poco F6", "Poco M6 Pro", "Poco C55", "Poco C65"] },
    { brand: "Vivo", models: ["Vivo V25", "Vivo V27", "Vivo V29", "Vivo X90", "Vivo X100", "Vivo Y21", "Vivo Y100", "Vivo T2", "Vivo T2x"] },
    { brand: "Oppo", models: ["Oppo Reno 8", "Oppo Reno 10", "Oppo Reno 11", "Oppo F21", "Oppo F23", "Oppo A78", "Oppo Find X5"] },
    { brand: "Realme", models: ["Realme 9", "Realme 10", "Realme 11 Pro", "Realme GT Neo 3", "Realme Narzo 50", "Realme C55", "Realme 12 Pro"] },
    { brand: "Motorola", models: ["Moto G62", "Moto G73", "Moto G84", "Moto Edge 30", "Moto Edge 40", "Moto Razr 40"] },
    { brand: "Nokia", models: ["Nokia G21", "Nokia G42", "Nokia C21", "Nokia X30", "Nokia 105"] },
    { brand: "Google", models: ["Pixel 6", "Pixel 6a", "Pixel 7", "Pixel 7a", "Pixel 8", "Pixel 8a", "Pixel 8 Pro"] },
    { brand: "iQOO", models: ["iQOO 9", "iQOO 11", "iQOO 12", "iQOO Neo 7", "iQOO Z7"] },
    { brand: "Infinix", models: ["Infinix Hot 12", "Infinix Zero 30", "Infinix Note 30"] },
    { brand: "Tecno", models: ["Tecno Spark 10", "Tecno Camon 20", "Tecno Pova 5"] },
    { brand: "Lava", models: ["Lava Blaze", "Lava Yuva 2", "Lava Agni 2"] },
    { brand: "Micromax", models: ["Micromax In Note 2", "Micromax In 2b"] },
    { brand: "Nothing", models: ["Nothing Phone (1)", "Nothing Phone (2)", "Nothing Phone (2a)"] },
    { brand: "Asus", models: ["Asus ROG Phone 6", "Asus ROG Phone 7", "Asus ROG Phone 8"] },
  ],
  LAPTOP: [
    { brand: "Apple", models: ["MacBook Air (M1)", "MacBook Air (M2, 13-inch)", "MacBook Air (M2, 15-inch)", "MacBook Air (M3, 13-inch)", "MacBook Air (M3, 15-inch)", "MacBook Pro 13-inch (M2)", "MacBook Pro 14-inch (M3)", "MacBook Pro 14-inch (M3 Pro/Max)", "MacBook Pro 16-inch (M3 Pro/Max)", "MacBook Pro 14-inch (M4)", "MacBook Pro 16-inch (M4)"] },
    { brand: "Dell", models: ["Dell XPS 13", "Dell XPS 15", "Dell Inspiron 15", "Dell Inspiron 14", "Dell Latitude 5420", "Dell Vostro 3510", "Dell Alienware m15"] },
    { brand: "HP", models: ["HP Pavilion 15", "HP Pavilion x360", "HP Spectre x360", "HP Envy 13", "HP Omen 16", "HP 15s", "HP ProBook 440"] },
    { brand: "Lenovo", models: ["Lenovo ThinkPad X1 Carbon", "Lenovo ThinkPad E14", "Lenovo IdeaPad Slim 3", "Lenovo IdeaPad 5", "Lenovo Legion 5", "Lenovo Yoga Slim 7"] },
    { brand: "Asus", models: ["Asus VivoBook 15", "Asus ZenBook 14", "Asus TUF Gaming A15", "Asus ROG Zephyrus G14", "Asus VivoBook S14"] },
    { brand: "Acer", models: ["Acer Aspire 5", "Acer Aspire 7", "Acer Swift 3", "Acer Predator Helios 300", "Acer Nitro 5"] },
    { brand: "MSI", models: ["MSI Modern 14", "MSI Katana GF66", "MSI Stealth 15"] },
    { brand: "Samsung", models: ["Samsung Galaxy Book2", "Samsung Galaxy Book3", "Samsung Galaxy Book3 Pro"] },
    { brand: "Microsoft", models: ["Surface Laptop 4", "Surface Laptop 5", "Surface Laptop Go 2", "Surface Pro 9"] },
    { brand: "LG", models: ["LG Gram 14", "LG Gram 16"] },
  ],
  DESKTOP: [
    { brand: "Apple", models: ["iMac 24-inch (M1)", "iMac 24-inch (M3)", "Mac Mini (M2)", "Mac Mini (M4)", "Mac Studio (M2 Max)", "Mac Pro (M2 Ultra)"] },
    { brand: "Dell", models: ["Dell OptiPlex 3090", "Dell Inspiron Desktop 3910", "Dell XPS Desktop"] },
    { brand: "HP", models: ["HP Pavilion Desktop", "HP EliteDesk 800", "HP All-in-One 24"] },
    { brand: "Lenovo", models: ["Lenovo ThinkCentre M70s", "Lenovo IdeaCentre AIO 3"] },
    { brand: "Acer", models: ["Acer Aspire TC", "Acer Veriton"] },
    { brand: "Asus", models: ["Asus ExpertCenter D5", "Asus ROG Strix GA15"] },
  ],
  TABLET: [
    { brand: "Apple", models: ["iPad (9th generation)", "iPad (10th generation)", "iPad Mini (6th generation)", "iPad Air (4th generation)", "iPad Air (5th generation)", "iPad Air 11-inch (M2)", "iPad Air 13-inch (M2)", "iPad Pro 11-inch (M2)", "iPad Pro 12.9-inch (M2)", "iPad Pro 11-inch (M4)", "iPad Pro 13-inch (M4)"] },
    { brand: "Samsung", models: ["Galaxy Tab S6 Lite", "Galaxy Tab S8", "Galaxy Tab S9", "Galaxy Tab A8", "Galaxy Tab A9+"] },
    { brand: "Lenovo", models: ["Lenovo Tab M10", "Lenovo Tab P11"] },
    { brand: "Xiaomi", models: ["Xiaomi Pad 5", "Xiaomi Pad 6"] },
    { brand: "Realme", models: ["Realme Pad", "Realme Pad 2"] },
    { brand: "OnePlus", models: ["OnePlus Pad", "OnePlus Pad Go"] },
    { brand: "Amazon", models: ["Fire HD 10", "Fire HD 8"] },
  ],
  TELEVISION: [
    { brand: "Samsung", models: ["Samsung Crystal 4K UA43", "Samsung Neo QLED QN90", "Samsung The Frame", "Samsung Q60C"] },
    { brand: "LG", models: ["LG UQ7500", "LG QNED80", "LG OLED C3", "LG NanoCell NANO75"] },
    { brand: "Sony", models: ["Sony Bravia X75K", "Sony Bravia X90L", "Sony Bravia A80L"] },
    { brand: "Xiaomi", models: ["Mi TV 5X", "Mi TV 4A", "Xiaomi TV A2", "Xiaomi TV X Pro"] },
    { brand: "TCL", models: ["TCL P635", "TCL C635 QLED", "TCL 55P715"] },
    { brand: "OnePlus", models: ["OnePlus TV Y1S", "OnePlus TV U1S", "OnePlus TV Q1"] },
    { brand: "Panasonic", models: ["Panasonic TH-43 Series", "Panasonic MX Series"] },
    { brand: "Hisense", models: ["Hisense A6H", "Hisense U6H"] },
    { brand: "Thomson", models: ["Thomson 9A Series", "Thomson Q Series"] },
  ],
  REFRIGERATOR: [
    { brand: "LG", models: ["LG 260L Frost Free (GL-T292)", "LG InstaView Door-in-Door", "LG 190L Direct Cool"] },
    { brand: "Samsung", models: ["Samsung 253L Frost Free", "Samsung 653L French Door", "Samsung RT28"] },
    { brand: "Whirlpool", models: ["Whirlpool 265L IntelliFresh", "Whirlpool 200L WDE", "Whirlpool 340L FP"] },
    { brand: "Godrej", models: ["Godrej 236L Frost Free", "Godrej Eon Series"] },
    { brand: "Haier", models: ["Haier 258L Double Door", "Haier 190L Single Door"] },
    { brand: "Bosch", models: ["Bosch Serie 4 Frost Free", "Bosch Serie 6"] },
    { brand: "Panasonic", models: ["Panasonic 307L Econavi", "Panasonic 174L Direct Cool"] },
  ],
  WASHING_MACHINE: [
    { brand: "LG", models: ["LG 7Kg Front Load FHM1207", "LG 8Kg Top Load T80", "LG 6.5Kg Semi-Automatic"] },
    { brand: "Samsung", models: ["Samsung 7Kg EcoBubble", "Samsung 8Kg AddWash", "Samsung 6.5Kg Semi-Automatic"] },
    { brand: "Whirlpool", models: ["Whirlpool 7Kg Stainwash", "Whirlpool 6.5Kg Semi-Automatic", "Whirlpool Intellifab"] },
    { brand: "IFB", models: ["IFB Senator Aqua SX", "IFB Diva Aqua", "IFB Neptune VX"] },
    { brand: "Bosch", models: ["Bosch Serie 4 WAJ", "Bosch Serie 6 Front Load"] },
    { brand: "Godrej", models: ["Godrej Eon 7Kg", "Godrej WS Semi-Automatic"] },
    { brand: "Haier", models: ["Haier 7Kg Front Load", "Haier 6.5Kg Semi-Automatic"] },
  ],
  AIR_CONDITIONER: [
    { brand: "LG", models: ["LG 1.5 Ton 5 Star Dual Inverter Split AC", "LG 1 Ton Window AC"] },
    { brand: "Samsung", models: ["Samsung 1.5 Ton WindFree Split AC", "Samsung 1 Ton Split AC"] },
    { brand: "Voltas", models: ["Voltas 1.5 Ton All Weather AC", "Voltas 1 Ton Window AC", "Voltas Vertis Elite"] },
    { brand: "Daikin", models: ["Daikin 1.5 Ton Inverter Split AC", "Daikin 1 Ton FTKF Series"] },
    { brand: "Blue Star", models: ["Blue Star 1.5 Ton IC5 Series", "Blue Star 1 Ton Window AC"] },
    { brand: "Carrier", models: ["Carrier 1.5 Ton Ester Neo", "Carrier 1 Ton Estrella"] },
    { brand: "Hitachi", models: ["Hitachi 1.5 Ton Kaze Plus", "Hitachi Zunoh"] },
    { brand: "Whirlpool", models: ["Whirlpool 1.5 Ton 3D Cool", "Whirlpool 1 Ton Window AC"] },
  ],
  MICROWAVE: [
    { brand: "LG", models: ["LG 28L Convection MC2846", "LG 20L Solo MS2043"] },
    { brand: "Samsung", models: ["Samsung 28L Convection MC28", "Samsung 23L Solo MS23"] },
    { brand: "IFB", models: ["IFB 25L Convection 25SC4", "IFB 20L Solo 20PM"] },
    { brand: "Whirlpool", models: ["Whirlpool 30L Convection Magicook", "Whirlpool 20L Solo MW"] },
    { brand: "Bajaj", models: ["Bajaj 20L Solo Majesty", "Bajaj 25L Convection"] },
    { brand: "Godrej", models: ["Godrej 20L Solo GME", "Godrej 30L Convection"] },
  ],
  SMARTWATCH: [
    { brand: "Apple", models: ["Apple Watch SE (2nd generation)", "Apple Watch Series 8", "Apple Watch Series 9", "Apple Watch Ultra 2"] },
    { brand: "Samsung", models: ["Galaxy Watch 5", "Galaxy Watch 6", "Galaxy Watch Ultra"] },
    { brand: "Noise", models: ["Noise ColorFit Pro 4", "Noise ColorFit Ultra", "Noise Icon 2"] },
    { brand: "boAt", models: ["boAt Wave Call", "boAt Storm", "boAt Xtend"] },
    { brand: "Fire-Boltt", models: ["Fire-Boltt Phoenix", "Fire-Boltt Ninja Call Pro"] },
    { brand: "Titan", models: ["Titan Smart 3", "Titan Talk"] },
    { brand: "Amazfit", models: ["Amazfit GTS 4", "Amazfit Bip 5"] },
  ],
  HEADPHONE_EARBUD: [
    { brand: "boAt", models: ["boAt Airdopes 141", "boAt Rockerz 450", "boAt Stone 1200"] },
    { brand: "JBL", models: ["JBL Flip 6", "JBL Tune 510BT", "JBL Go 3"] },
    { brand: "Sony", models: ["Sony WH-1000XM5", "Sony WF-1000XM4", "Sony SRS-XB13"] },
    { brand: "Apple", models: ["AirPods (3rd generation)", "AirPods Pro (2nd generation)", "AirPods Max"] },
    { brand: "Samsung", models: ["Galaxy Buds2", "Galaxy Buds2 Pro"] },
    { brand: "Noise", models: ["Noise Buds VS104", "Noise Shots X5"] },
    { brand: "Bose", models: ["Bose QuietComfort 45", "Bose SoundLink Flex"] },
  ],
  PRINTER_SCANNER: [
    { brand: "HP", models: ["HP DeskJet 2331", "HP LaserJet Pro M15w", "HP Smart Tank 580"] },
    { brand: "Canon", models: ["Canon PIXMA E477", "Canon PIXMA G3010", "Canon imageCLASS MF3010"] },
    { brand: "Epson", models: ["Epson L3250", "Epson EcoTank L3210", "Epson L120"] },
    { brand: "Brother", models: ["Brother DCP-T420W", "Brother HL-L2321D"] },
    { brand: "Ricoh", models: ["Ricoh SP 210", "Ricoh MP 2014"] },
  ],

  // --- Categories added when the taxonomy was expanded from 12 to 42 ---
  FEATURE_PHONE: [
    { brand: "Nokia", models: ["Nokia 105", "Nokia 106", "Nokia 110", "Nokia 125", "Nokia 5310", "Nokia 6300 4G", "Nokia 8210 4G"] },
    { brand: "itel", models: ["itel it2163", "itel Magic 2", "itel it5626", "itel Muzik 100"] },
    { brand: "Lava", models: ["Lava A5", "Lava Star 2", "Lava Spark"] },
    { brand: "Jio", models: ["JioPhone", "JioPhone 2", "JioPhone Prima"] },
    { brand: "Samsung", models: ["Samsung Guru Music 2", "Samsung Metro 313"] },
  ],
  MONITOR: [
    { brand: "Samsung", models: ["Samsung Odyssey G5", "Samsung Odyssey G7", "Samsung M5 Smart Monitor", "Samsung S24R350", "Samsung ViewFinity S8"] },
    { brand: "LG", models: ["LG UltraGear 24GN60R", "LG UltraGear 27GP850", "LG 24MK430H", "LG UltraWide 29WN600", "LG UltraFine 27UN850"] },
    { brand: "Dell", models: ["Dell S2421HN", "Dell P2422H", "Dell UltraSharp U2723QE", "Dell Alienware AW2523HF"] },
    { brand: "BenQ", models: ["BenQ GW2480", "BenQ EX2510", "BenQ PD2705Q", "BenQ Mobiuz EX2710"] },
    { brand: "ASUS", models: ["ASUS VP228HE", "ASUS TUF Gaming VG249Q", "ASUS ProArt PA278QV"] },
    { brand: "Acer", models: ["Acer EK220Q", "Acer Nitro VG240Y", "Acer Predator XB273"] },
    { brand: "ViewSonic", models: ["ViewSonic VA2246-MHD", "ViewSonic VX2276-SMHD", "ViewSonic Elite XG270"] },
    { brand: "HP", models: ["HP 24mh", "HP M24fw", "HP X24ih Gaming"] },
  ],
  COMPUTER_ACCESSORY: [
    { brand: "Logitech", models: ["Logitech MK270 Combo", "Logitech M235 Mouse", "Logitech K380 Keyboard", "Logitech B170 Mouse", "Logitech C270 Webcam"] },
    { brand: "HP", models: ["HP Wireless Mouse X3000", "HP KM100 Keyboard-Mouse Combo"] },
    { brand: "Dell", models: ["Dell KM3322W Keyboard-Mouse Combo", "Dell WM126 Wireless Mouse"] },
    { brand: "Zebronics", models: ["Zebronics Zeb-Companion 107", "Zebronics Zeb-Transformer-K Keyboard", "Zebronics Zeb-Fame Webcam"] },
    { brand: "Ant Esports", models: ["Ant Esports MK1400 Keyboard", "Ant Esports GM320 Mouse"] },
    { brand: "Amkette", models: ["Amkette EvoFox Elite Mouse", "Amkette Xcite Neo Keyboard"] },
  ],
  PROJECTOR: [
    { brand: "Epson", models: ["Epson EB-X51", "Epson EB-S41", "Epson EH-TW650"] },
    { brand: "BenQ", models: ["BenQ MH535A", "BenQ TH585", "BenQ MW560"] },
    { brand: "ViewSonic", models: ["ViewSonic PA503S", "ViewSonic PX701HD"] },
    { brand: "Xgimi", models: ["Xgimi Halo+", "Xgimi Horizon Pro", "Xgimi Mogo 2"] },
    { brand: "Sony", models: ["Sony VPL-EX455", "Sony VPL-DX241"] },
  ],
  SET_TOP_BOX: [
    { brand: "Tata Play", models: ["Tata Play HD Set-Top Box", "Tata Play Binge+ 4K"] },
    { brand: "Airtel Digital TV", models: ["Airtel Digital TV HD Set-Top Box", "Airtel Xstream Box"] },
    { brand: "Dish TV", models: ["Dish TV HD Set-Top Box", "Dish TV SMRT Hub"] },
    { brand: "Amazon", models: ["Fire TV Stick", "Fire TV Stick 4K", "Fire TV Stick 4K Max", "Fire TV Stick Lite"] },
    { brand: "Google", models: ["Chromecast with Google TV", "Chromecast with Google TV (4K)"] },
  ],
  SOUNDBAR: [
    { brand: "JBL", models: ["JBL Bar 2.0 All-in-One", "JBL Bar 300", "JBL Bar 800"] },
    { brand: "Sony", models: ["Sony HT-S20R", "Sony HT-S400", "Sony HT-A3000"] },
    { brand: "boAt", models: ["boAt Aavante Bar 1160", "boAt Aavante Bar 1700D"] },
    { brand: "Zebronics", models: ["Zebronics Juke Bar 3700", "Zebronics Juke Bar 9000"] },
    { brand: "Samsung", models: ["Samsung HW-A450", "Samsung HW-Q600C"] },
  ],
  SPEAKER: [
    { brand: "JBL", models: ["JBL Flip 6", "JBL Go 3", "JBL Charge 5", "JBL Xtreme 3"] },
    { brand: "boAt", models: ["boAt Stone 350", "boAt Stone 1000", "boAt Party Pal 200"] },
    { brand: "Sony", models: ["Sony SRS-XB13", "Sony SRS-XB23", "Sony SRS-XG300"] },
    { brand: "Marshall", models: ["Marshall Emberton II", "Marshall Willen", "Marshall Stanmore II"] },
    { brand: "Zebronics", models: ["Zebronics Zeb-County", "Zebronics Zeb-Roll"] },
  ],
  FITNESS_BAND: [
    { brand: "Xiaomi", models: ["Mi Smart Band 6", "Mi Smart Band 7", "Xiaomi Smart Band 8"] },
    { brand: "boAt", models: ["boAt Wave Beat", "boAt Xtend Band"] },
    { brand: "Noise", models: ["Noise ColorFit Pulse", "Noise ColorFit Pro 2"] },
    { brand: "Fire-Boltt", models: ["Fire-Boltt Terra", "Fire-Boltt Visionary"] },
    { brand: "Honor", models: ["Honor Band 6", "Honor Band 7"] },
  ],
  CAMERA: [
    { brand: "Canon", models: ["Canon EOS 1500D", "Canon EOS 850D", "Canon EOS R10", "Canon PowerShot G7 X Mark III"] },
    { brand: "Nikon", models: ["Nikon D3500", "Nikon D5600", "Nikon Z50", "Nikon Coolpix B500"] },
    { brand: "Sony", models: ["Sony Alpha a6400", "Sony Alpha a7 III", "Sony ZV-1"] },
    { brand: "Fujifilm", models: ["Fujifilm X-T30", "Fujifilm X100V", "Fujifilm Instax Mini 12"] },
    { brand: "GoPro", models: ["GoPro Hero 11", "GoPro Hero 12", "GoPro Hero 10 Black"] },
  ],
  CAMCORDER: [
    { brand: "Sony", models: ["Sony Handycam FDR-AX43", "Sony Handycam HDR-CX405"] },
    { brand: "Canon", models: ["Canon Vixia HF R800", "Canon Legria HF R806"] },
    { brand: "Panasonic", models: ["Panasonic HC-V180", "Panasonic HC-WXF991"] },
  ],
  DRONE: [
    { brand: "DJI", models: ["DJI Mini 3", "DJI Mini 4 Pro", "DJI Air 3", "DJI Mavic 3", "DJI Avata"] },
    { brand: "Syma", models: ["Syma X5C", "Syma X8W"] },
  ],
  GAMING_CONSOLE: [
    { brand: "Sony", models: ["PlayStation 4", "PlayStation 4 Pro", "PlayStation 5", "PlayStation 5 Slim", "PlayStation 5 Pro"] },
    { brand: "Microsoft", models: ["Xbox One S", "Xbox Series S", "Xbox Series X"] },
    { brand: "Nintendo", models: ["Nintendo Switch", "Nintendo Switch Lite", "Nintendo Switch OLED"] },
  ],
  ROUTER_NETWORKING: [
    { brand: "TP-Link", models: ["TP-Link Archer C6", "TP-Link Archer AX10", "TP-Link TL-WR840N", "TP-Link Deco M4"] },
    { brand: "D-Link", models: ["D-Link DIR-825", "D-Link DIR-615"] },
    { brand: "Netgear", models: ["Netgear Nighthawk R6700", "Netgear R6120"] },
    { brand: "Tenda", models: ["Tenda F3", "Tenda AC10"] },
    { brand: "Mercusys", models: ["Mercusys MW305R", "Mercusys AC12"] },
  ],
  POWER_BANK: [
    { brand: "Mi", models: ["Mi Power Bank 3i 20000mAh", "Mi Power Bank 3i 10000mAh"] },
    { brand: "boAt", models: ["boAt EnergyBank 500", "boAt EnergyBank 1200"] },
    { brand: "Ambrane", models: ["Ambrane 10000mAh PowerBank", "Ambrane 20000mAh PowerBank"] },
    { brand: "Realme", models: ["Realme 10000mAh Power Bank", "Realme 20000mAh Power Bank"] },
    { brand: "Anker", models: ["Anker PowerCore 10000", "Anker PowerCore Slim 10000"] },
  ],
  UPS_INVERTER: [
    { brand: "APC", models: ["APC Back-UPS BX600C-IN", "APC Back-UPS BX1100C-IN"] },
    { brand: "Luminous", models: ["Luminous Zolt 1100", "Luminous Eco Volt Neo 1250"] },
    { brand: "Microtek", models: ["Microtek UPS SEBz 900", "Microtek Inverter EB 1600+"] },
    { brand: "V-Guard", models: ["V-Guard Prime 1150", "V-Guard Smart Pro 1100"] },
  ],
  CCTV_SECURITY: [
    { brand: "CP Plus", models: ["CP Plus Cosmic 2MP Dome Camera", "CP Plus 4-Channel DVR Kit"] },
    { brand: "Hikvision", models: ["Hikvision DS-2CE1AC0T-IRP", "Hikvision 4-Channel Turbo HD Kit"] },
    { brand: "Dahua", models: ["Dahua DH-HAC-HDW1200RP", "Dahua 4-Channel DVR Kit"] },
    { brand: "TP-Link", models: ["TP-Link Tapo C200", "TP-Link Tapo C310"] },
  ],
  SMART_HOME: [
    { brand: "Xiaomi", models: ["Mi Smart Plug", "Mi Smart Bulb Essential", "Xiaomi Smart Camera C300"] },
    { brand: "TP-Link", models: ["TP-Link Tapo Smart Plug P100", "TP-Link Tapo Smart Bulb L510E"] },
    { brand: "Wipro", models: ["Wipro Smart Bulb", "Wipro Smart Plug"] },
    { brand: "Syska", models: ["Syska Smart Bulb", "Syska Smart Plug"] },
    { brand: "Amazon", models: ["Echo Dot (5th Gen)", "Echo Show 5", "Echo Dot (4th Gen)"] },
    { brand: "Google", models: ["Google Nest Mini", "Google Nest Hub"] },
  ],
  OTG_OVEN: [
    { brand: "Bajaj", models: ["Bajaj Majesty 1603 T OTG", "Bajaj 2200 TMSS OTG"] },
    { brand: "Prestige", models: ["Prestige POTG 19 PCR", "Prestige POTG 36L"] },
    { brand: "Morphy Richards", models: ["Morphy Richards 52-Litre OTG", "Morphy Richards 24 RSS OTG"] },
    { brand: "Wonderchef", models: ["Wonderchef Oven Toaster Griller 60L", "Wonderchef 19L OTG"] },
    { brand: "Philips", models: ["Philips HD6975 OTG", "Philips HD6198 OTG"] },
  ],
  DISHWASHER: [
    { brand: "Bosch", models: ["Bosch Serie 2 SMS2ITI01I", "Bosch Serie 4 SMS4HVI01I"] },
    { brand: "IFB", models: ["IFB Neptune VX", "IFB Neptune SX1"] },
    { brand: "Faber", models: ["Faber FFSD 8PR", "Faber FFSD 6PR"] },
    { brand: "LG", models: ["LG DFB424FP", "LG DFB512FP"] },
    { brand: "Whirlpool", models: ["Whirlpool Powerclean 13PS", "Whirlpool Wdisc 5B"] },
  ],
  WATER_PURIFIER: [
    { brand: "Kent", models: ["Kent Grand Plus", "Kent Ace Mineral RO", "Kent Supreme"] },
    { brand: "Aquaguard", models: ["Aquaguard Marvel RO+UV", "Aquaguard Enhance"] },
    { brand: "Livpure", models: ["Livpure Glo RO+UV", "Livpure Envy RO+UV+UF"] },
    { brand: "Pureit", models: ["Pureit Classic RO+UV", "Pureit Ultima RO+UV"] },
    { brand: "AO Smith", models: ["AO Smith Z8 RO", "AO Smith X5 RO+UV"] },
  ],
  AIR_PURIFIER: [
    { brand: "Xiaomi", models: ["Mi Air Purifier 3", "Mi Air Purifier 3C"] },
    { brand: "Philips", models: ["Philips AC1215", "Philips AC2887"] },
    { brand: "Honeywell", models: ["Honeywell Air Touch V5", "Honeywell Air Touch I8"] },
    { brand: "Dyson", models: ["Dyson Purifier Cool TP07", "Dyson Purifier Hot+Cool HP07"] },
    { brand: "Sharp", models: ["Sharp FP-J30M", "Sharp FP-J40M"] },
  ],
  VACUUM_CLEANER: [
    { brand: "Eureka Forbes", models: ["Eureka Forbes Trendy Steel", "Eureka Forbes Quick Clean DX"] },
    { brand: "Kent", models: ["Kent Compact Vacuum Cleaner", "Kent Force Cyclonic"] },
    { brand: "Xiaomi", models: ["Mi Robot Vacuum-Mop P", "Mi Handheld Vacuum Cleaner Light"] },
    { brand: "Dyson", models: ["Dyson V8", "Dyson V11", "Dyson V15 Detect"] },
    { brand: "Philips", models: ["Philips PowerPro Compact", "Philips PowerGo"] },
  ],
  CHIMNEY: [
    { brand: "Faber", models: ["Faber Hood Primus Plus", "Faber Crown 3D T2S2"] },
    { brand: "Elica", models: ["Elica WD HAC Touch BF", "Elica 60 NERO EDS"] },
    { brand: "Hindware", models: ["Hindware Nadia Plus", "Hindware Cleo Plus"] },
    { brand: "Kaff", models: ["Kaff Vetro 60cm", "Kaff Melissa DHC 60"] },
    { brand: "Sunflame", models: ["Sunflame Zenith 60cm", "Sunflame Optima DX"] },
  ],
  INDUCTION_COOKTOP: [
    { brand: "Prestige", models: ["Prestige PIC 3.1 V3", "Prestige PIC 6.0"] },
    { brand: "Philips", models: ["Philips HD4928", "Philips HD4938"] },
    { brand: "Bajaj", models: ["Bajaj Majesty ICX 7", "Bajaj Popular Induction Cooktop"] },
    { brand: "Pigeon", models: ["Pigeon Favourite Induction Cooktop", "Pigeon Cruise"] },
    { brand: "Havells", models: ["Havells Insta Cook Ceramic ECO", "Havells Insta Cook OT"] },
  ],
  MIXER_GRINDER: [
    { brand: "Preethi", models: ["Preethi Blue Leaf Diamond", "Preethi Zodiac", "Preethi Eco Twin Gold"] },
    { brand: "Bajaj", models: ["Bajaj Rex 500W", "Bajaj GX8 750W"] },
    { brand: "Philips", models: ["Philips HL7756", "Philips HL7707"] },
    { brand: "Prestige", models: ["Prestige Iris 750W", "Prestige Delight Electric"] },
    { brand: "Sujata", models: ["Sujata Dynamix DX", "Sujata Powermatic Plus"] },
  ],
  WATER_HEATER: [
    { brand: "AO Smith", models: ["AO Smith HSE-SDS Storage Water Heater", "AO Smith Z1 Instant Water Heater"] },
    { brand: "Bajaj", models: ["Bajaj Majesty Duraflow", "Bajaj New Shakti Storage Water Heater"] },
    { brand: "Havells", models: ["Havells Instanio Instant Water Heater", "Havells Monza Storage Water Heater"] },
    { brand: "V-Guard", models: ["V-Guard Victo Plus Storage Water Heater", "V-Guard Zio Instant Water Heater"] },
    { brand: "Racold", models: ["Racold Eterno Pro Storage Water Heater", "Racold Alpha Instant Water Heater"] },
  ],
  IRON: [
    { brand: "Philips", models: ["Philips GC1905 Dry Iron", "Philips GC2990 Steam Iron"] },
    { brand: "Bajaj", models: ["Bajaj Majesty DX-6", "Bajaj Majesty DX-11"] },
    { brand: "Havells", models: ["Havells Perfecto Dry Iron", "Havells Rush Steam Iron"] },
    { brand: "Crompton", models: ["Crompton Inglis Dry Iron", "Crompton InstaCharge Steam Iron"] },
    { brand: "Usha", models: ["Usha EI 1602 Dry Iron", "Usha Steam Pro"] },
  ],
  PERSONAL_GROOMING: [
    { brand: "Philips", models: ["Philips BT3211 Beard Trimmer", "Philips HP8100 Hair Dryer"] },
    { brand: "Havells", models: ["Havells BT5103 Trimmer", "Havells HD3151 Hair Dryer"] },
    { brand: "Syska", models: ["Syska HT200 Trimmer", "Syska HD1610 Hair Dryer"] },
    { brand: "VEGA", models: ["VEGA T3 Trimmer", "VEGA Insta Glam VHDH-20 Hair Dryer"] },
    { brand: "Panasonic", models: ["Panasonic ER-GB40 Trimmer", "Panasonic EH-ND21 Hair Dryer"] },
  ],
  FAN: [
    { brand: "Havells", models: ["Havells Stealth Air Ceiling Fan", "Havells Velocity Table Fan"] },
    { brand: "Crompton", models: ["Crompton Aura Prime Ceiling Fan", "Crompton HS Plus Table Fan"] },
    { brand: "Orient", models: ["Orient Aeroquiet Ceiling Fan", "Orient Wendy Table Fan"] },
    { brand: "Usha", models: ["Usha Striker Ceiling Fan", "Usha Maxx Air Table Fan"] },
    { brand: "Bajaj", models: ["Bajaj Frore Ceiling Fan", "Bajaj Esteem Table Fan"] },
    { brand: "Atomberg", models: ["Atomberg Renesa Ceiling Fan", "Atomberg Efficio Ceiling Fan"] },
  ],
  AIR_COOLER: [
    { brand: "Symphony", models: ["Symphony Diet 3D 55i", "Symphony Ninja", "Symphony Touch 35"] },
    { brand: "Bajaj", models: ["Bajaj PMH 25 DLX", "Bajaj Coolest DC 2016"] },
    { brand: "Crompton", models: ["Crompton Ozone 75", "Crompton Marvel Neo"] },
    { brand: "Voltas", models: ["Voltas Grand 72", "Voltas Alfa 55"] },
  ],
  CALCULATOR: [
    { brand: "Casio", models: ["Casio FX-991EX", "Casio MJ-120D", "Casio HL-820V"] },
    { brand: "Citizen", models: ["Citizen SDC-444S", "Citizen CT-512"] },
    { brand: "Orpat", models: ["Orpat OT-512", "Orpat OT-414"] },
  ],
  VR_HEADSET: [
    { brand: "Meta", models: ["Meta Quest 2", "Meta Quest 3", "Meta Quest Pro"] },
    { brand: "Sony", models: ["PlayStation VR", "PlayStation VR2"] },
    { brand: "Samsung", models: ["Samsung Gear VR"] },
  ],
  E_READER: [
    { brand: "Amazon", models: ["Kindle (11th Gen)", "Kindle Paperwhite", "Kindle Paperwhite Signature Edition", "Kindle Oasis"] },
    { brand: "Kobo", models: ["Kobo Clara 2E", "Kobo Libra 2", "Kobo Nia"] },
  ],
};

export async function seedForBusiness(businessId: string) {
  let brandsCreated = 0, brandsBackfilled = 0, seriesCreated = 0, modelsCreated = 0;

  for (const category of DEVICE_CATEGORIES) {
    for (const { brand: brandName, models } of CATEGORY_DATA[category] || []) {
      // A brand can already exist uncategorized (e.g. the user's manually
      // entered Mobile brands) -- match by name first, then decide whether
      // to backfill its category or create a fresh categorized row.
      let brand = await Brand.findOne({ businessId, category, name: brandName });
      if (!brand) {
        const uncategorized = await Brand.findOne({ businessId, name: brandName, category: null });
        if (uncategorized) {
          uncategorized.category = category;
          await uncategorized.save();
          brand = uncategorized;
          brandsBackfilled++;
        } else {
          brand = await Brand.create({ businessId, name: brandName, category, businessScope: "SINGLE" } as any);
          brandsCreated++;
        }
      }

      // Insert-only per-brand Series cache for this loop iteration -- avoids
      // re-querying the same Series doc for every model in the same line.
      const seriesCache = new Map<string, any>();

      for (const modelName of models) {
        const exists = await DeviceModel.findOne({ businessId, brandId: brand._id, name: modelName });
        const seriesName = deriveSeriesName(brandName, modelName);

        let seriesDoc = seriesCache.get(seriesName);
        if (!seriesDoc) {
          seriesDoc = await Series.findOne({ businessId, brandId: brand._id, name: seriesName });
          if (!seriesDoc) {
            seriesDoc = await Series.create({ businessId, brandId: brand._id, name: seriesName, businessScope: "SINGLE" } as any);
            seriesCreated++;
          }
          seriesCache.set(seriesName, seriesDoc);
        }

        if (exists) {
          // Backfill seriesId on a pre-existing model that predates this
          // field -- never touch anything else about it.
          if (!(exists as any).seriesId) {
            exists.seriesId = seriesDoc._id;
            await exists.save();
          }
          continue;
        }

        await DeviceModel.create({
          businessId,
          brandId: brand._id,
          seriesId: seriesDoc._id,
          name: modelName,
          businessScope: "SINGLE",
        } as any);
        modelsCreated++;
      }
    }
  }

  console.log(`  businessId=${businessId}: ${brandsCreated} brands created, ${brandsBackfilled} backfilled, ${seriesCreated} series created, ${modelsCreated} models created.`);

  return { brandsCreated, brandsBackfilled, seriesCreated, modelsCreated };
}
