# Mobile App — Information Architecture

Single Expo Router app (`mobile-marketplace/`), role resolved post-login
from `UserRole`/`UserBusinessAccess`, routing into one of three mode route
groups. A user holding multiple roles gets a mode switcher.

## Shared (all modes)
- `app/(auth)/login.tsx` — Bearer-token login (reuses existing
  `/api/auth/login`), `expo-secure-store` for the token (same pattern as
  `mobile/`).
- `app/(auth)/register.tsx` — customer self-registration; provider/ops
  accounts are provisioned via existing business/staff onboarding, not
  self-registered.
- Root layout: resolves `Region` for the logged-in user's location →
  applies `RegionTheme` (palette, locale, greeting, festival banner) before
  rendering any mode.

## Customer mode — `app/(customer)/`
- `index.tsx` — home: region-filtered `ServiceCategory` grid, greeting
  (theme-driven), festival banner if active, landmark hero rotation.
- `category/[key].tsx` — services within a category.
- `book/[serviceKey].tsx` — booking form: address, requested time window,
  notes → creates the booking request (extends `CrmCall`).
- `booking/[id].tsx` — status tracker: matched provider, ETA (once tracking
  field exists — see matching-engine-design.md gap #1), milestone progress
  mirrored from `CrmJobSheet` status.
- `booking/[id]/pay.tsx` — payment (reuses existing Razorpay integration
  pattern from `mobile/`'s checkout).
- `booking/[id]/rate.tsx` — rating & review on completion (new model, see
  matching-engine-design.md gap #3).
- `bookings/index.tsx` — booking history.
- `profile.tsx` — account, saved addresses, sign out.

## Provider mode — `app/(provider)/`
- `index.tsx` — job queue: incoming matched requests (accept/decline),
  active jobs.
- `job/[id].tsx` — job detail: customer/address/service info, milestone
  action buttons wired to existing routes (`assign-engineer` acceptance,
  `start-repair`, `part-pending`, `resume-repair`, `service-record`,
  `intake-receipt`, `handover`, `close`, `cancel`).
- `job/[id]/photos.tsx` — intake/handover photo capture
  (`expo-image-picker` → existing Cloudinary upload endpoint).
- `availability.tsx` — online/offline toggle, working-hours/slot
  management (pending gap #2 confirmation on `VendorStaffSlot` reality).
- `earnings.tsx` — payouts/statement (`VendorPayoutAccount`,
  `VendorSettlement`, `/api/vendor/statement`).
- `profile.tsx` — provider profile, declared service offerings.
- Offline-tolerant action queue: milestone actions taken with poor/no
  connectivity queue locally and sync on reconnect (biggest field-tech UX
  win over the existing web `vendor/crm` pages).

## Ops mode — `app/(ops)/`
Full parity with the existing web `admin/crm` console — not a stripped
companion.
- `index.tsx` — call/lead queue (mirrors `admin/crm/calls`), triage.
- `call/[id].tsx` — call detail, log disposition, convert to job sheet.
- `matching/[callId].tsx` — confirm/override auto-suggested provider
  ranking (the hybrid-matching human step).
- `jobsheets/index.tsx` — full job sheet list/filter (mirrors
  `admin/crm/jobsheets`).
- `jobsheets/[id].tsx` — job sheet detail/oversight.
- `regions/index.tsx` — the Region/category enable-disable toggle grid
  (state → city → category), writes directly to `Region`.
- `revenue.tsx` — revenue dashboard (mirrors `/api/crm/revenue`).
- `escalations.tsx` — SLA/escalation monitoring.

## Build order (per the sequencing already agreed)
1. Shared shell: auth, region/theme resolution, API client.
2. Provider mode (closest fit to existing `CrmJobSheet`, least new backend).
3. Customer mode (needs service catalog + matching engine first).
4. Ops mode (mobile) — alongside verifying/extending the existing web
   console so both stay in parity, per the full-parity requirement.
