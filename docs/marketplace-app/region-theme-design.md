# Region, RegionTheme, ServiceCategory — Design

## Region (`src/models/Region.ts`)

One document per state/UT, seeded from the existing GST `STATE_CODES`
(`src/core/gst/stateCodes.ts`) — that file stays the single source of truth
for state identity/codes; `Region` only adds marketplace fields on top.

```ts
interface IRegion {
  stateCode: string;            // "37" for Andhra Pradesh, FK to STATE_CODES
  stateName: string;
  enabled: boolean;              // state-wide master switch
  cities: { name: string; enabled: boolean }[]; // per-city switch
  enabledCategoryKeys: string[]; // ServiceCategory.key values live here
  pricingMultiplier: number;     // regional cost-of-living adjustment
  locale: string;                // "te-IN"
  themeKey: string;              // FK to RegionTheme.key
  featureFlags: Record<string, boolean>;
}
```

All 36 states/UTs are seeded `enabled: false` except Andhra Pradesh. GST
code `97` ("Other Territory") is excluded — it's a GST catch-all, not a
real launchable region.

**Enable/disable is two-level**: a category must be both platform-wide
enabled (`ServiceCategory.enabled`) AND listed in the region's
`enabledCategoryKeys` to show to a customer there — lets AP run its own
subset while a future state runs a different mix, without touching the
platform-wide category list.

## ServiceCategory (`src/models/ServiceCategory.ts`)

Generic category → services catalog, not hardcoded per vertical:

```ts
interface IServiceCategory {
  key: string;             // "appliance_repair"
  name: string;
  enabled: boolean;        // platform-wide master switch
  sortOrder: number;
  services: { key: string; name: string; description?: string }[];
}
```

Adding a new vertical (e.g. salon) later is a seed-data addition to
`src/data/seed/serviceCategories.seed.ts`, not a schema change. 13
categories seeded; 6 enabled for the AP launch (see
`docs/marketplace-app/README.md` for the list and rationale).

## RegionTheme (`src/models/RegionTheme.ts`)

The cultural-localization "theme pack" a `Region` points to via `themeKey`.
Content-only model — palette tokens, asset URL references, locale bundle
key, greeting templates, festival banners:

```ts
interface IRegionTheme {
  key: string;              // "andhra_pradesh", "default"
  palette: { primary; secondary; accent; background };
  motifAssetUrl?: string;   // subtle background/line-art motif
  landmarkAssetUrls: string[]; // rotating home-banner imagery
  localeBundleKey: string;  // i18n bundle to load
  greetingTemplates: { morning; afternoon; evening };
  festivalBanners: { name: string; month: number; bannerAssetUrl?: string }[];
}
```

**Why content-only, not code-per-state**: the mobile app renders any
`RegionTheme` generically (palette → design tokens, assets → image
components, festival banners → date-matched home banner). Adding a new
state's look is then a content/design task (fill the fields, commission
artwork, translate strings) — not new app code. This is the mechanism that
makes "we can get into local markets immediately" operationally true.

## Andhra Pradesh reference theme (seeded, first cultural design)

- **Palette**: Kalamkari maroon-red primary, mango-yellow secondary, Bay of
  Bengal teal accent — deliberately distinct from a generic SaaS blue.
- **Motif**: Kalamkari-style line art (Srikalahasti/Pedana tradition) as
  subtle background texture; Kondapalli wooden-toy silhouettes as small
  accents. *(asset not yet produced — placeholder in seed data)*
- **Landmarks**: Tirupati gopuram, Araku Valley, Visakhapatnam RK Beach —
  rotating home banner. *(assets not yet produced)*
- **Locale**: Telugu (`te-IN`) default, English toggle available.
- **Greetings**: Telugu time-of-day strings (శుభోదయం/శుభ మధ్యాహ్నం/శుభ
  సాయంత్రం), already in the seed.
- **Festival banners**: Ugadi, Sankranti, Vinayaka Chavithi — surfaced by
  matching current month against `festivalBanners[].month`.

## Ops enable/disable UI (not yet built — next phase)

A toggle grid in the Ops mode (mobile + existing web admin): State → City →
Category, each level independently switchable. Reads/writes `Region`
directly; changes take effect immediately since the app resolves region
config at runtime, no redeploy.
