/**
 * ServiceCategory seed data — the full multi-vertical catalog planned for
 * the ServiceFlow marketplace app, platform-wide enabled/disabled per the
 * launch plan. A category's `enabled: false` here means it's off
 * everywhere until switched on; a region additionally needs the category's
 * `key` in its own `enabledCategoryKeys` to actually show it to customers
 * in that state. Run via scripts/seed-marketplace.ts, upserts by key.
 */
import type { IServiceCategory } from "@/models/ServiceCategory";

type CategorySeed = Pick<
  IServiceCategory,
  "key" | "name" | "description" | "enabled" | "sortOrder" | "services"
>;

export const SERVICE_CATEGORY_SEEDS: CategorySeed[] = [
  {
    key: "appliance_repair",
    name: "Home Appliance Repair",
    description: "AC, washing machine, refrigerator, RO, microwave, chimney repair",
    enabled: true,
    sortOrder: 10,
    services: [
      { key: "ac_repair", name: "AC Service & Repair" },
      { key: "washing_machine_repair", name: "Washing Machine Repair" },
      { key: "refrigerator_repair", name: "Refrigerator Repair" },
      { key: "ro_repair", name: "RO / Water Purifier Repair" },
      { key: "microwave_repair", name: "Microwave Repair" },
      { key: "chimney_repair", name: "Chimney Repair" },
    ],
  },
  {
    key: "installation_services",
    name: "Installation Services",
    description: "New appliance installation",
    enabled: true,
    sortOrder: 20,
    services: [
      { key: "ac_installation", name: "AC Installation" },
      { key: "geyser_installation", name: "Geyser Installation" },
      { key: "ro_installation", name: "RO / Water Purifier Installation" },
      { key: "chimney_installation", name: "Chimney Installation" },
    ],
  },
  {
    key: "home_cleaning",
    name: "Home Cleaning",
    description: "Full home, kitchen/bathroom deep clean, sofa/carpet, water tank",
    enabled: true,
    sortOrder: 30,
    services: [
      { key: "full_home_cleaning", name: "Full Home Cleaning" },
      { key: "kitchen_deep_clean", name: "Kitchen Deep Cleaning" },
      { key: "bathroom_deep_clean", name: "Bathroom Deep Cleaning" },
      { key: "sofa_carpet_cleaning", name: "Sofa & Carpet Cleaning" },
      { key: "water_tank_cleaning", name: "Water Tank Cleaning" },
    ],
  },
  {
    key: "pest_control",
    name: "Pest Control",
    description: "General pest control, termite, cockroach/rodent control",
    enabled: true,
    sortOrder: 40,
    services: [
      { key: "general_pest_control", name: "General Pest Control" },
      { key: "termite_treatment", name: "Termite Treatment" },
      { key: "cockroach_rodent_control", name: "Cockroach & Rodent Control" },
    ],
  },
  {
    key: "electrician",
    name: "Electrician",
    description: "Wiring, switchboard/fan/light fitting, general electrical repair",
    enabled: true,
    sortOrder: 50,
    services: [
      { key: "wiring_repair", name: "Wiring Repair" },
      { key: "switchboard_fitting", name: "Switchboard / Fan / Light Fitting" },
      { key: "general_electrical_repair", name: "General Electrical Repair" },
    ],
  },
  {
    key: "plumber",
    name: "Plumber",
    description: "Leak repair, tap/pipe fitting, bathroom fitting",
    enabled: true,
    sortOrder: 60,
    services: [
      { key: "leak_repair", name: "Leak Repair" },
      { key: "tap_pipe_fitting", name: "Tap & Pipe Fitting" },
      { key: "bathroom_fitting", name: "Bathroom Fitting" },
    ],
  },
  {
    key: "carpenter",
    name: "Carpenter",
    description: "Furniture repair, door/window fitting, custom woodwork",
    enabled: false,
    sortOrder: 70,
    services: [
      { key: "furniture_repair", name: "Furniture Repair" },
      { key: "door_window_fitting", name: "Door & Window Fitting" },
      { key: "custom_woodwork", name: "Custom Woodwork" },
    ],
  },
  {
    key: "painting",
    name: "Painting",
    description: "Home painting, waterproofing",
    enabled: false,
    sortOrder: 80,
    services: [
      { key: "home_painting", name: "Home Painting" },
      { key: "waterproofing", name: "Waterproofing" },
    ],
  },
  {
    key: "salon_women",
    name: "Salon for Women",
    description: "Facial, waxing, threading, haircut, bridal packages",
    enabled: false,
    sortOrder: 90,
    services: [
      { key: "facial", name: "Facial" },
      { key: "waxing", name: "Waxing" },
      { key: "threading", name: "Threading" },
      { key: "haircut_women", name: "Haircut" },
      { key: "bridal_package", name: "Bridal Package" },
    ],
  },
  {
    key: "salon_men",
    name: "Salon for Men",
    description: "Haircut, shave, grooming at home",
    enabled: false,
    sortOrder: 100,
    services: [
      { key: "haircut_men", name: "Haircut" },
      { key: "shave", name: "Shave" },
      { key: "grooming", name: "Grooming" },
    ],
  },
  {
    key: "spa_massage",
    name: "Spa & Massage",
    description: "At-home massage, therapy",
    enabled: false,
    sortOrder: 110,
    services: [
      { key: "home_massage", name: "At-Home Massage" },
      { key: "therapy", name: "Therapy" },
    ],
  },
  {
    key: "vehicle_care",
    name: "Vehicle Care",
    description: "Car/bike cleaning, doorstep servicing",
    enabled: false,
    sortOrder: 120,
    services: [
      { key: "car_cleaning", name: "Car Cleaning" },
      { key: "bike_cleaning", name: "Bike Cleaning" },
      { key: "doorstep_servicing", name: "Doorstep Servicing" },
    ],
  },
  {
    key: "packers_movers",
    name: "Packers & Movers",
    description: "Local shifting, packing",
    enabled: false,
    sortOrder: 130,
    services: [
      { key: "local_shifting", name: "Local Shifting" },
      { key: "packing", name: "Packing" },
    ],
  },
];
