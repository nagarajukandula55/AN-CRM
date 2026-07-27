# AN Group Mobile (Expo / React Native)

The native Android/iOS app for the storefront, calling the same ANgroup
backend as the Native web storefront. Lives in this repo (`/mobile`) as its
own package, separate from the Next.js app at the repo root — it has its
own `package.json` and dependency tree, install/run it from inside this
folder.

## Setup

```bash
cd mobile
npm install
```

Edit `app.json`'s `expo.extra`:
- `anApiUrl` — the deployed ANgroup URL (same value as Native's
  `NEXT_PUBLIC_AN_API`)
- `anBusinessId` — Native's Business `_id` inside ANgroup (same value as
  Native's `NEXT_PUBLIC_AN_BUSINESS_ID`)
- `razorpayKeyId` — the same Razorpay key ANgroup's web checkout uses

Then:

```bash
npm run start      # Expo dev server
npm run ios        # requires macOS + Xcode
npm run android    # requires Android Studio / emulator
```

**Note:** this app requires a dev client, not plain Expo Go — see "Store
readiness" below for why (`react-native-razorpay` is a native module).
Run `npm run prebuild` once, then `npm run build:dev` (or open the
generated `ios`/`android` folders directly in Xcode/Android Studio) to
get an installable dev client before `npm run start` will actually work
on a device.

## What's here

- `src/api/*` — ported from Native's `lib/an-sdk/*`, same endpoints/shapes,
  adapted for React Native: `expo-secure-store` instead of `localStorage`
  for the auth token, Bearer-token-only (no cookie fallback, since RN
  fetch has no cookie jar).
- `src/context/AuthContext.tsx`, `CartContext.tsx` — session + local cart
  state.
- `app/` — Expo Router screens: home (product grid), login, product
  detail, cart.

## What's built

- Checkout (`app/checkout.tsx`): address form, order creation via
  `/api/orders/create`, payment via `react-native-razorpay` (native
  module — see note below), verification via `/api/payment/verify`.
  ANgroup's backend always creates a Razorpay order regardless of
  `paymentMethod` (confirmed by reading `order.service.ts` — there's no
  COD path server-side), so this is the only checkout flow possible today.
- Order history (`app/orders/index.tsx`) and order detail/tracking
  (`app/orders/[id].tsx`), using the same "filter /api/orders/list
  client-side" workaround Native's web SDK uses, since ANgroup has no
  customer-scoped orders endpoint.
- Wishlist screen (`app/wishlist.tsx`), wired to the existing
  `src/api/wishlist.ts` client.
- Profile screen (`app/profile.tsx`): name/email, links to orders/wishlist,
  sign out.

**`react-native-razorpay` requires a native module** — it will NOT work in
Expo Go. Use `npx expo prebuild` + a custom dev client (or EAS Build) once
you're ready to test the checkout flow on a device/simulator. Set
`app.json`'s `expo.extra.razorpayKeyId` to the same key ANgroup's web
checkout uses.

## Store readiness (this pass)

- App icon, Android adaptive icon, splash image, and web favicon are now
  generated placeholder assets in `assets/` (dark "AN" mark) — wired into
  `app.json`. Swap these for real branded artwork before submitting; they
  exist now purely so the app doesn't fail store icon requirements or
  ship with Expo's default icon.
- `eas.json` added with `development`/`preview`/`production` build
  profiles and a `submit` profile for both stores (placeholders for
  Apple ID / ASC app ID / team ID and a Google Play service account key
  path — fill these in once you have the developer accounts).
- `app.json` now has real version metadata stores require:
  `ios.buildNumber`, `android.versionCode`, `ios.infoPlist.
  ITSAppUsesNonExemptEncryption: false` (skips the export-compliance
  question — true only if you add real encryption beyond HTTPS/standard
  auth), and an `extra.eas.projectId` placeholder (`eas init` fills this
  in for real).
- Added `expo-dev-client` and switched the dev scripts to
  `--dev-client` — required because `react-native-razorpay` is a native
  module and won't run in plain Expo Go; see EAS Build section below.
- Added a public Privacy Policy page at `/privacy` on the main ANgroup
  web app (both stores require a live URL for this at submission) — the
  contact email in it (`support@angroup.in`) is a placeholder, confirm
  it's real before submitting.
- `mobile/.gitignore` added (node_modules, `.expo/`, signing
  keys/certs, the Google Play service account JSON — never commit that
  file).

### Building & submitting once you have developer accounts

```bash
npm install -g eas-cli
cd mobile
eas login
eas init                          # fills in extra.eas.projectId
eas build --profile development   # installable dev client for real-device testing
eas build --profile production    # store-ready build (App Bundle / IPA)
eas submit --platform ios --latest
eas submit --platform android --latest
```

Fill in `eas.json`'s `submit.production` block (Apple ID, ASC app ID,
Apple Team ID, and the Google Play service account JSON path) before the
first `eas submit`.

## Retailer / bulk order accounts

Sign-up (`app/signup.tsx`) offers two account types:

- **Customer (RETAIL)** — normal storefront checkout, pays in-app via
  Razorpay as before.
- **Retailer / Business (BUSINESS)** — once cart weight reaches 10kg
  (`weightKg` summed across cart lines, see `CartContext.totalWeightKg`),
  checkout skips Razorpay entirely and submits the order at
  `PENDING_REVIEW`. AN Group/the vendor later calls
  `PATCH /api/orders/[orderId]/billing-revision` with the revised (lower)
  price and separate shipping charge; the retailer is notified and sees it
  on the order detail screen (`app/orders/[id].tsx`) once shared.

Backend additions: `User.accountType`/`businessName`/`gstNumber`,
`Order.customerType`/`isBulkOrder`/`billingRevision`,
`NativeProduct.weightKg` (per-unit weight, needs backfilling on real
products for bulk detection to work), `OrderService.createOrder`'s bulk
branch.

## Vendor notifications

`OrderService.createOrder` now notifies every vendor with a line item in
the order (`notifyVendor` in `src/services/notification.service.ts`,
resolving `VendorProfile.userId`) so they can process it further —
in-app `Notification` row + Expo push if they have a registered device.

## Push notifications

Implemented: the app requests notification permission and registers its
Expo push token against the existing `POST /api/devices/register` route
right after sign-in (`AuthContext.refresh` → `registerPushToken`).
Requires `expo-notifications`/`expo-device` (added to `package.json` —
run `npm install`) and `app.json`'s `extra.eas.projectId` to be a real
EAS project id (falls back to the classic/no-projectId call otherwise,
which still works in a dev client but is deprecated by Expo).

## What's NOT built yet (next phases)

- Change password / saved addresses (beyond the one-off checkout address
  form)
- Admin/vendor-side UI for reviewing bulk orders and calling
  `billing-revision` — the API route exists, but there's no screen for it
  yet in the main web admin
- Real branded icon/splash artwork (current assets are placeholders) and
  store screenshots
- Server-side COD support doesn't exist on ANgroup at all and is
  intentionally out of scope — this app only supports online payment
  (retail) or revised-billing-after-submission (bulk)

## Reused from Native

Endpoint contracts and response shapes are the exact ones Native's own
`ANGROUP_INTEGRATION_STATUS.md` and `lib/an-sdk/*` already worked out
against the real ANgroup backend — this app is a second client of the same
API, not a redesign.
