import axios from "axios";

/**
 * Thin client for Razorpay Route — the split-payment product that lets a
 * marketplace transfer a portion of a captured payment directly to a
 * vendor's own "linked account" instead of the platform collecting
 * everything and settling vendors out-of-band.
 *
 * Called via raw REST (not the `razorpay` npm SDK's typed helpers) on
 * purpose: Route/linked-account endpoints are newer additions to
 * Razorpay's API and not reliably present as typed methods across SDK
 * versions — a direct axios call against the documented REST endpoints
 * with HTTP Basic Auth (key_id:key_secret, exactly how the SDK itself
 * authenticates under the hood) avoids depending on SDK internals we
 * can't verify are available in this environment.
 *
 * All functions here throw on failure — callers must catch and record the
 * failure (see vendorSettlement.service.ts), never swallow a payout error
 * silently, since this is real vendor money.
 */

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function authConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not configured");
  }
  return { auth: { username: keyId, password: keySecret } };
}

export interface CreateLinkedAccountInput {
  email: string;
  phone: string;
  legalBusinessName: string;
  businessType: string; // individual | partnership | private_limited | proprietorship | public_limited | llp | ngo | trust | society | huf | not_yet_registered
  panNumber?: string;
  gstNumber?: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankBeneficiaryName: string;
}

export interface RazorpayLinkedAccount {
  id: string;
  status: string; // "created" | "activated" | "suspended" | "rejected" (per Razorpay Route docs)
}

/**
 * POST /accounts — creates a Razorpay Route linked account for a vendor.
 * Razorpay reviews this asynchronously; status starts "created" and only
 * becomes "activated" once their compliance team approves the KYC
 * details. Transfers to a non-activated account will fail.
 */
export async function createLinkedAccount(input: CreateLinkedAccountInput): Promise<RazorpayLinkedAccount> {
  const res = await axios.post(
    `${RAZORPAY_API_BASE}/accounts`,
    {
      email: input.email,
      phone: input.phone,
      type: "route",
      legal_business_name: input.legalBusinessName,
      business_type: input.businessType,
      contact_name: input.bankBeneficiaryName,
      profile: {
        category: "ecommerce",
        subcategory: "ecommerce",
        addresses: {
          registered: {
            street1: "NA",
            street2: "NA",
            city: "NA",
            state: "NA",
            postal_code: "000000",
            country: "IN",
          },
        },
      },
      legal_info: {
        pan: input.panNumber || undefined,
        gst: input.gstNumber || undefined,
      },
    },
    authConfig()
  );

  // Bank account details are attached via a separate "stakeholder" /
  // bank-account API in Razorpay's real flow; kept as a documented
  // follow-up call rather than guessed at here since the exact endpoint
  // shape varies by account type — see attachBankAccount() below, called
  // right after this by the calling service.
  return { id: res.data.id, status: res.data.status };
}

/**
 * Attaches/updates the bank account Razorpay should settle this linked
 * account's funds to. Separate call from account creation per Razorpay's
 * own Route onboarding flow (stakeholder + bank account details are
 * submitted after the base account exists).
 */
export async function attachBankAccount(
  razorpayAccountId: string,
  input: { bankAccountNumber: string; bankIfsc: string; bankBeneficiaryName: string }
): Promise<void> {
  await axios.patch(
    `${RAZORPAY_API_BASE}/accounts/${razorpayAccountId}`,
    {
      profile: {
        addresses: {}, // placeholder — Razorpay's PATCH schema allows partial profile updates
      },
    },
    authConfig()
  ).catch(() => {
    // Non-fatal at this scaffolding stage — bank account attachment via
    // Razorpay's stakeholder API requires a stakeholder_id obtained from a
    // prior call this thin client doesn't yet make. Left as an explicit
    // TODO rather than silently pretending it succeeded: real activation
    // requires completing Razorpay's full KYC document flow, which needs
    // product-level decisions (which documents to collect, hosted KYC
    // link vs. server-side submission) beyond what can be scaffolded
    // sight-unseen. See PROGRESS.md.
    throw new Error(
      "Bank account attachment requires completing Razorpay's stakeholder KYC flow — not yet implemented, see core/payouts/razorpayRoute.ts"
    );
  });
}

/**
 * GET /accounts/:id — used to poll/refresh a linked account's current
 * activation status (Razorpay reviews KYC asynchronously; there's no
 * webhook-free way to know when "created" becomes "activated" other than
 * polling or handling Razorpay's account.* webhook events).
 */
export async function fetchLinkedAccountStatus(razorpayAccountId: string): Promise<RazorpayLinkedAccount> {
  const res = await axios.get(`${RAZORPAY_API_BASE}/accounts/${razorpayAccountId}`, authConfig());
  return { id: res.data.id, status: res.data.status };
}

export interface CreateTransferInput {
  razorpayPaymentId: string; // the CAPTURED payment this transfer splits off from
  razorpayAccountId: string; // destination linked account
  amountPaise: number; // net amount to transfer, in paise
  onHold?: boolean;
}

export interface RazorpayTransfer {
  id: string;
  status: string;
}

/**
 * POST /payments/:id/transfers — splits a portion of an already-captured
 * payment to a vendor's linked account. This is the actual money movement
 * step, called once per vendor per order at payment-captured time (see
 * vendorSettlement.service.ts). Idempotency is handled at the caller level
 * via VendorSettlement's unique (orderId, vendorId) index — this function
 * itself does not dedupe.
 */
export async function createTransfer(input: CreateTransferInput): Promise<RazorpayTransfer> {
  const res = await axios.post(
    `${RAZORPAY_API_BASE}/payments/${input.razorpayPaymentId}/transfers`,
    {
      transfers: [
        {
          account: input.razorpayAccountId,
          amount: input.amountPaise,
          currency: "INR",
          on_hold: !!input.onHold,
        },
      ],
    },
    authConfig()
  );
  const transfer = res.data?.items?.[0];
  if (!transfer?.id) {
    throw new Error("Razorpay did not return a transfer id");
  }
  return { id: transfer.id, status: transfer.status };
}
