# ServiceFlow Mobile (Expo / React Native)

Working name — **"ServiceFlow" is an interim brand**, expected to change
before public launch (kept isolated to `app.json`'s `name`/`slug` and this
README so a rename later is a config edit, not a refactor).

The Urban-Company-style marketplace app: one binary, three role-based
modes (Customer / Provider / Ops), same ANgroup backend as the rest of this
repo. See `../docs/marketplace-app/` for the full design docs — this
package is the scaffold described in `mobile-app-ia.md`.

Sibling package to `../mobile/` (the existing product-storefront app) — own
`package.json`/dependency tree, same repo, same backend, different app.

## Setup

```bash
cd mobile-marketplace
npm install
```

Edit `app.json`'s `expo.extra.anApiUrl` to your deployed ANgroup URL.

```bash
npm run start
npm run ios       # requires macOS + Xcode
npm run android   # requires Android Studio / emulator
```

## What's here (current state — scaffold only)

- `app/_layout.tsx` — root layout: wraps the app in `AuthProvider` +
  `RegionThemeProvider`.
- `app/index.tsx` — resolves logged-in user's active mode, redirects into
  `(customer)`, `(provider)`, or `(ops)`.
- `app/(auth)/login.tsx` — Bearer-token login, theme-aware.
- `app/(customer)/index.tsx`, `app/(provider)/index.tsx`,
  `app/(ops)/index.tsx` — one landing stub per mode, rendering the
  resolved `RegionTheme` (palette + greeting) so the shell is real and
  testable, not just markup.
- `src/api/client.ts` — Bearer-token fetch wrapper (`expo-secure-store`),
  same pattern as `../mobile/src/api/client.ts`.
- `src/api/region.ts` — typed client for the (not-yet-built)
  `/api/region/resolve` and `/api/region/theme/:key` routes.
- `src/context/AuthContext.tsx` — login/logout/session, tracks
  `activeMode` (customer/provider/ops) for the mode router.
- `src/context/RegionThemeContext.tsx` — resolves the user's `Region` +
  `RegionTheme` on load, falls back to `src/theme/default.ts` if the
  backend route isn't reachable yet (keeps local dev unblocked).

## What's NOT built yet (next phases — see docs/marketplace-app/)

- Backend API routes: `/api/region/resolve`, `/api/region/theme/:key`,
  service-catalog browsing, matching engine, booking creation/tracking,
  ratings. Models/seed data for these already exist
  (`src/models/Region.ts`, `RegionTheme.ts`, `ServiceCategory.ts`,
  `scripts/seedMarketplace.ts`) — routes are the next step.
- Every real screen beyond the mode landing stubs (category browse,
  booking flow, job sheet milestone actions, Ops toggle grid, etc.) — see
  `docs/marketplace-app/mobile-app-ia.md` for the full screen list and
  build order.
- Real app icon/splash/store assets (none added yet — this scaffold has no
  `assets/` folder, unlike `../mobile/` which already has placeholders).
- `eas.json` build profiles (copy `../mobile/eas.json`'s structure once
  ready to build).
