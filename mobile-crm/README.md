# AN-CRM Mobile (Expo / React Native)

The native Android/iOS/iPad app for AN-CRM's Brand / Service Center / POS
operators — a second, independent Expo app in this repo (`/mobile-crm`),
separate from `/mobile` (which is the **ecommerce storefront** app, ported
from ANgroup's Native site — a different product). Has its own
`package.json`/dependency tree; install and run it from inside this
folder.

## Setup

```bash
cd mobile-crm
npm install
```

Edit `app.json`'s `expo.extra.anCrmApiUrl` to your deployed AN-CRM URL
(same value as the web app's own origin — this app calls the exact same
Next.js API routes the web admin uses).

```bash
npm run start      # Expo dev server
npm run ios        # requires macOS + Xcode
npm run android    # requires Android Studio / emulator
```

No native modules are used in this pass (no Razorpay SDK, no push yet —
see "What's NOT built yet" below), so **plain Expo Go works** for
development; a dev client is only needed once those are added.

## Auth

AN-CRM's `/api/auth/login` returns the JWT in the JSON response body (in
addition to setting an httpOnly cookie for the web app) — this app is
Bearer-token-only (`Authorization: Bearer <token>`, stored in
`expo-secure-store`), which `middleware.ts` already accepts as a fallback
to the cookie (see its "Extract & verify JWT from cookie or Bearer header"
comment) — zero backend changes were needed to support this client.

## What's built

- **Login** (`app/login.tsx`) — email/username + password, same
  `/api/auth/login` endpoint the web app uses.
- **Dashboard** (`app/(app)/index.tsx`) — greeting, plan/mode summary,
  open-workorder count, recent workorders list.
- **Workorders** (`app/(app)/workorders/index.tsx` +
  `app/(app)/workorders/[id].tsx`) — list with status filter chips
  (backed by `/api/crm/jobsheets`), detail view, and a single-tap
  "Start Repair" action for the one milestone transition
  (`CREATED` → `REPAIR_IN_PROGRESS`) that needs no additional form input.
  Every other milestone (close, part-pending, handover — see
  `api/crm/jobsheets/[id]/route.ts`'s `ALLOWED_FIELDS` comment for why
  these are separate dedicated routes) needs the line-item/payment form
  the full web admin already has and is intentionally left there for this
  pass, rather than half-building a form-heavy flow on a phone screen.
- **POS quick sale** (`app/(app)/pos.tsx`) — customer + line items +
  live totals, posts to `/api/pos/invoices` (the same endpoint the web
  POS quick-sale screen uses), shows the generated invoice number/total on
  success.
- **Plan & Billing** (`app/(app)/plan.tsx`) — read-only current plan/mode/
  days-remaining from `/api/subscriptions/status`; renewal/upgrade stays
  on the web app's Razorpay Checkout flow for this pass (native
  `react-native-razorpay` wiring is straightforward to add later,
  following the exact pattern already proven in `/mobile/app/checkout.tsx`).
- **Profile** (`app/(app)/profile.tsx`) — name/email/role, sign out.

## What's NOT built yet (next phases)

- **Brand-mode call intake / appointment booking screens** — this pass
  covers workorders (used by both Brand and SC) and POS; the call-center
  intake flow (`/admin/crm/calls`) and appointment calendar are web-admin
  only for now.
- **Native Razorpay checkout** for renewing/upgrading a plan from the
  phone — `/mobile`'s `app/checkout.tsx` is the exact pattern to port
  (native module, needs a dev client + `eas prebuild`, not plain Expo Go).
- **Push notifications** for workorder status changes — `/mobile`'s
  `expo-notifications` + `/api/devices/register` pattern is directly
  reusable; AN-CRM doesn't have a `Device`/push-token model yet, that's
  the one backend piece to add first.
- **Offline/poor-connectivity handling** — every screen here assumes a
  live connection; no local cache or optimistic queueing yet.
- **Real branded icon/splash artwork** — `assets/*.png` are copied
  placeholders from the `/mobile` (ANgroup petrol) app, not AN-CRM's
  violet (`#5B3DF5`) identity. Replace before any store submission.
- **Store submission itself** — `eas.json` has build profiles wired
  (same as `/mobile`) but `submit.production`'s Apple/Google Play
  credentials are placeholders; nothing has been built or submitted to
  either store yet.

## Building & submitting once you have developer accounts

```bash
npm install -g eas-cli
cd mobile-crm
eas login
eas init                          # fills in extra.eas.projectId
eas build --profile development   # installable dev client for real-device testing
eas build --profile production    # store-ready build (App Bundle / IPA)
eas submit --platform ios --latest
eas submit --platform android --latest
```
