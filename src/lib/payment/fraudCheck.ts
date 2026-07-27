/* =========================================================
   FRAUD CHECK
========================================================= */

type FraudCheckInput = {
  orderAmount: number;
  paymentAmount: number;

  orderPhone?: string;
  paymentContact?: string;

  orderEmail?: string;
  paymentEmail?: string;

  gatewayOrderId?: string;
  dbGatewayOrderId?: string;
};

type FraudCheckResult = {
  success: boolean;
  reason?: string;
};

/* =========================================================
   NORMALIZE
========================================================= */

const normalizePhone = (
  phone?: string
) => {
  if (!phone) return "";

  return phone.replace(/\D/g, "");
};

const normalizeEmail = (
  email?: string
) => {
  if (!email) return "";

  return email
    .trim()
    .toLowerCase();
};

/* =========================================================
   FRAUD CHECK
========================================================= */

export function fraudCheck(
  data: FraudCheckInput
): FraudCheckResult {
  const {
    orderAmount,
    paymentAmount,

    orderPhone,
    paymentContact,

    orderEmail,
    paymentEmail,

    gatewayOrderId,
    dbGatewayOrderId,
  } = data;

  /* =========================================================
     AMOUNT CHECK
  ========================================================= */

  if (
    Number(orderAmount) !==
    Number(paymentAmount)
  ) {
    return {
      success: false,
      reason:
        "Payment amount mismatch",
    };
  }

  /* =========================================================
     PHONE CHECK
  ========================================================= */

  const normalizedOrderPhone =
    normalizePhone(orderPhone);

  const normalizedPaymentPhone =
    normalizePhone(paymentContact);

  if (
    normalizedOrderPhone &&
    normalizedPaymentPhone &&
    normalizedOrderPhone !==
      normalizedPaymentPhone
  ) {
    return {
      success: false,
      reason:
        "Phone number mismatch",
    };
  }

  /* =========================================================
     EMAIL CHECK
  ========================================================= */

  const normalizedOrderEmail =
    normalizeEmail(orderEmail);

  const normalizedPaymentEmail =
    normalizeEmail(paymentEmail);

  if (
    normalizedOrderEmail &&
    normalizedPaymentEmail &&
    normalizedOrderEmail !==
      normalizedPaymentEmail
  ) {
    return {
      success: false,
      reason:
        "Email mismatch",
    };
  }

  /* =========================================================
     GATEWAY ORDER CHECK
  ========================================================= */

  if (
    gatewayOrderId &&
    dbGatewayOrderId &&
    gatewayOrderId !==
      dbGatewayOrderId
  ) {
    return {
      success: false,
      reason:
        "Gateway order mismatch",
    };
  }

  /* =========================================================
     PASSED
  ========================================================= */

  return {
    success: true,
  };
}
