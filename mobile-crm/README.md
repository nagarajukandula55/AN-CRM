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
- **Subscription-driven navigation** — the tab bar itself changes per
  business: Calls/Workorders show for Brand & SC, POS's quick-sale tab
  shows for POS, driven live by `/api/subscriptions/status`'s `mode`
  (see `context/SubscriptionContext.tsx`, loaded once at the app shell and
  shared by every screen) rather than a fixed tab set — per explicit
  direction: "based on subscription the options and menu should appear."
- **Dashboard** (`app/(app)/index.tsx`) — greeting, plan/mode summary,
  open-workorder count (hidden for POS), recent workorders list, and an
  "Explore Services" card into the Services tab.
- **Services** (`app/(app)/services.tsx`) — "services we are offering":
  every tier (Basic/Pro/Ultimate) for this business's own operating mode,
  with included features checked off against the current plan and
  above-tier features shown greyed-out with an "Upgrade to X" button.
  Upgrading itself deep-links to the web app's `/admin/plan` (Razorpay
  Checkout stays there — see "What's NOT built yet").
- **Profile** (`app/(app)/profile.tsx`) — name/email/role, current plan
  status (tap-through to Services), **Services Taken** (completed/closed
  workorders) and **Services About to Take** (open/scheduled workorders)
  — "user should get their profile, services they have taken and about
  to take" — plus sign out.
- **Calls** (`app/(app)/calls.tsx`) — list + quick intake form (customer
  name/phone/subject), backed by `/api/crm/calls`, the same
  call-entry-that-becomes-a-workorder lifecycle the Brand web admin uses.
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
## What's NOT built yet (next phases)

- **Appointment booking/calendar** — call intake is now covered (see
  Calls above); the appointment scheduling calendar itself is web-admin
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
