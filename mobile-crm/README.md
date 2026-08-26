# AN-CRM Mobile (Expo / React Native)

The native Android/iOS/iPad app for AN-CRM's Service Center vendors — a
second, independent Expo app in this repo (`/mobile-crm`),
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

The backend now supports only ONE operating mode — Service Center (SC).
Brand and POS were removed entirely (zero production usage), and this app
has been brought back in sync with that: there is no more mode branching
anywhere (nav, dashboard, services, profile, catalog) and no POS
quick-sale screen — `/api/pos/invoices` and `/api/crm/calls` no longer
exist on the backend, so the old Calls tab and POS tab were removed along
with `src/api/calls.ts` and `src/api/pos.ts`.

- **Login** (`app/login.tsx`) — email/username + password, same
  `/api/auth/login` endpoint the web app uses (JWT in the JSON body).
- **Billing-aware app shell** — `context/SubscriptionContext.tsx` (kept
  its filename, now wraps `/api/vendor/billing` — VendorSubscription +
  VendorBillingInvoice — instead of the removed `/api/subscriptions/status`)
  loads the vendor's plan/status once at the app shell and shares it with
  every screen (Dashboard's expired/no-plan banner, Services, Profile).
- **Tab bar** (`app/(app)/_layout.tsx`) — Home, Workorders, Catalog,
  Ledger, and a **More** tab (`app/(app)/more.tsx`) fanning out to
  Expenses, Profit & Loss, Ledger, Services, and Profile — every tab is
  now always visible (no more mode-driven show/hide).
- **Dashboard** (`app/(app)/index.tsx`) — greeting, plan summary,
  open-workorder count, recent workorders list, a Profit & Loss shortcut,
  and an "Explore Services" card.
- **Services** (`app/(app)/services.tsx`) — the current 2-tier ladder
  from `src/data/plans.ts` (Pro / Ultimate — internal key `BASIC` is
  displayed as **"Pro"**, matching `src/core/pricing/plans.ts`'s explicit
  rename; POS/Brand ladders removed, SC is the only mode), included
  features checked off against the current plan, "Upgrade"/"Subscribe"
  for the rest. Upgrading itself deep-links to the web app's
  `/vendor/billing` (Razorpay Checkout stays there — see "What's NOT
  built yet").
- **Profile** (`app/(app)/profile.tsx`) — name/email/role, current plan
  status (tap-through to Services), **Services Taken** (completed/closed
  workorders) and **Services About to Take** (open/scheduled workorders),
  plus sign out.
- **Workorders** (`app/(app)/workorders/index.tsx` +
  `app/(app)/workorders/[id]/index.tsx`) — list with status filter chips
  (backed by `/api/crm/jobsheets`), detail view, and a single-tap
  "Start Repair" action. Fixed to match the real backend: `CREATED` needs
  a **two-step** call (`POST .../assign-engineer` with the logged-in
  user's own id, matching the SC web app's own `proceedForRepair`, THEN
  `POST .../start-repair`) since `start-repair` alone 409s against a
  fresh `CREATED` job sheet (it requires `REPAIR_STARTED` already) — see
  `src/api/crm.ts`'s `advanceJobSheet`. Once in progress, "Continue
  Repair" opens the engineer repair screen.
- **Engineer Repair screen** (`app/(app)/workorders/[id]/repair.tsx`) —
  parts added by searching the same Material/BOM catalog
  `/api/service-center-bom` serves, a work-performed note, and a typed
  customer-name confirmation. "Save Progress" PATCHes the job sheet;
  "Mark Repair Completed" saves once more then calls `POST .../close`,
  which generates the SalesInvoice server-side.
- **Catalog** (`app/(app)/catalog.tsx`) — the Material/BOM catalog,
  browsable read-only with search: part code, description, HSN, rate,
  GST%, serial-tracked flag. Backed by `/api/service-center-bom`.
- **Expenses** (`app/(app)/expenses.tsx`, `src/api/expenses.ts`) — NEW.
  List + add-expense form (category picker populated from the API's own
  `categories` list, amount, description, payment mode) + delete, backed
  by `GET/POST /api/vendor/expenses` and `DELETE
  /api/vendor/expenses/[id]`.
- **Ledger Book** (`app/(app)/ledger.tsx` + `app/(app)/ledger/[key].tsx`,
  `src/api/ledger.ts`) — NEW. Party-summary list (name/phone/outstanding
  balance) from `GET /api/vendor/ledger`; tapping a party fetches that
  party's full running-balance transaction history via
  `?customer=<key>`.
- **Profit & Loss** (`app/(app)/profit-loss.tsx`, `src/api/profitLoss.ts`)
  — NEW. Date-range picker (This Month / Last 30 / Last 90 days),
  revenue/COGS/gross profit/expenses (with a by-category breakdown)/net
  profit laid out as a report, backed by `GET /api/vendor/profit-loss`.

## What's NOT built yet (next phases)

- **Live inventory (stock quantities)** — Catalog above is the
  price/spec BOM catalog (part code, HSN, rate, tax); it does not yet
  show on-hand stock quantity or warehouse location. That's a separate
  system in this codebase (`InventoryItem`, `/api/inventory/items`,
  stock movements/lots) that isn't wired into mobile — the close-repair
  flow's server-side stock deduction (see
  `api/crm/jobsheets/[id]/close/route.ts`, serialized-inventory path)
  still works correctly without it; only a mobile *view* of stock levels
  is missing.
- **OTP customer confirmation** — the repair screen shows a "Send OTP" /
  6-digit-code UI (labeled "Coming soon"), per explicit direction ("we
  will signup for OTP just put a placeholder we will wire that by taking
  necessary permissions and arrangements"). It's UI only: no SMS sends,
  no code is verified, `customerSignatureUrl` stays unset. Wiring it for
  real needs an SMS gateway account and DLT-registered sender template
  (mandatory in India for transactional SMS) plus a backend send/verify
  endpoint — none of which exist yet.
- **Appointment booking/calendar** — the backend no longer has a
  `/api/crm/calls` intake step at all (removed along with Brand mode);
  scheduling stays web-admin only for now.
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
