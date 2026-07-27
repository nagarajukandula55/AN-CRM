# ServiceFlow Marketplace App — Design Docs

Working name **"ServiceFlow"** — explicitly interim, expected to be
rebranded before public launch. Kept out of source code paths/model names
so a rename later is a config/display-name change, not a refactor.

This directory is the design record for the Urban-Company-style marketplace
app built on top of this repo's existing CRM (`CrmCall`/`CrmJobSheet`) and
vendor system (`VendorProfile`, `VendorStaffSlot`, `VendorPayoutAccount`).

## Documents
- [`region-theme-design.md`](./region-theme-design.md) — the `Region`/
  `RegionTheme`/`ServiceCategory` schemas, the state enable/disable model,
  and the cultural-localization "theme pack" system.
- [`matching-engine-design.md`](./matching-engine-design.md) — the hybrid
  auto-suggest + human-confirm provider matching design.
- [`mobile-app-ia.md`](./mobile-app-ia.md) — the full mobile app information
  architecture: every screen, across all three role-based modes (Customer /
  Provider / Ops).

## Decisions locked in (do not re-litigate)
1. Built in this repo, as a new sibling package `mobile-marketplace/` next
   to the existing `mobile/` (customer storefront) app — same backend,
   shared models/auth/CRM engine.
2. One app, three role-based modes (Customer / Provider / Ops-CCO) — not
   three separate apps.
3. Hybrid matching: system auto-suggests ranked providers, a human (CCO or
   the provider) confirms/accepts.
4. Multi-vertical service catalog from day one — `ServiceCategory` is
   generic data, not hardcoded per vertical.
5. State-local frontend, one shared backend — a `Region` document per
   state/UT drives enabled cities/categories/pricing/locale/theme; the app
   reads this at runtime, no per-state deploys or forks.
6. Ops is full parity across web (existing `admin/crm`) and the new mobile
   Ops mode — not a stripped mobile companion.
7. Pilot state: **Andhra Pradesh**. Launch category subset: Appliance
   Repair, Installation Services, Home Cleaning, Pest Control, Electrician,
   Plumber (6 of 13 seeded categories) — the rest exist in the catalog,
   disabled, adjustable anytime pre-launch via the Ops toggle grid, no
   schema change required.

## What's built so far (backend)
- `src/models/Region.ts`, `src/models/RegionTheme.ts`,
  `src/models/ServiceCategory.ts` — the three new Mongoose models.
- `src/data/seed/regions.seed.ts` — all 36 states/UTs from the existing
  `STATE_CODES` (src/core/gst/stateCodes.ts), only Andhra Pradesh enabled.
- `src/data/seed/serviceCategories.seed.ts` — all 13 categories, 6 enabled.
- `src/data/seed/regionThemes.seed.ts` — `default` theme + the Andhra
  Pradesh reference theme pack (palette/locale/greetings/festival banners;
  landmark/motif image assets are placeholders, need real artwork before
  launch).
- `scripts/seedMarketplace.ts` — idempotent seed runner:
  `npx tsx --env-file=.env.local scripts/seedMarketplace.ts`

## What's NOT built yet (next phases, per the design docs)
- API routes for region resolution, service catalog browsing, matching
  engine, booking creation/tracking, ratings.
- The `mobile-marketplace/` Expo app itself (scaffold only exists so far —
  see `mobile-marketplace/README.md`).
- Real theme artwork (landmark imagery, motif line-art) for Andhra Pradesh.
- Trademark/App Store namecheck on the final brand name (still "ServiceFlow"
  placeholder).
