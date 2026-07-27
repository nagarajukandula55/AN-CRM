let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getShiprocketToken() {
  try {
    if (
      cachedToken &&
      tokenExpiry > Date.now()
    ) {
      return cachedToken;
    }

    console.log(
      "=== SHIPROCKET AUTH START ==="
    );

    console.log(
      "BASE URL:",
      process.env.SHIPROCKET_BASE_URL
    );

    console.log(
      "EMAIL:",
      process.env.SHIPROCKET_EMAIL
    );

    console.log(
      "PASSWORD EXISTS:",
      !!process.env.SHIPROCKET_PASSWORD
    );

    if (!process.env.SHIPROCKET_BASE_URL) {
      throw new Error(
        "SHIPROCKET_BASE_URL missing"
      );
    }

    if (!process.env.SHIPROCKET_EMAIL) {
      throw new Error(
        "SHIPROCKET_EMAIL missing"
      );
    }

    if (!process.env.SHIPROCKET_PASSWORD) {
      throw new Error(
        "SHIPROCKET_PASSWORD missing"
      );
    }

    const response = await fetch(
      `${process.env.SHIPROCKET_BASE_URL}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          email:
            process.env.SHIPROCKET_EMAIL,
          password:
            process.env.SHIPROCKET_PASSWORD,
        }),
      }
    );

    const data = await response.json();

    console.log(
      "SHIPROCKET LOGIN RESPONSE:",
      JSON.stringify(data, null, 2)
    );

    if (!response.ok) {
      throw new Error(
        data?.message ||
          "Shiprocket login failed"
      );
    }

    if (!data?.token) {
      throw new Error(
        "Shiprocket authentication failed"
      );
    }

    cachedToken = data.token;

    tokenExpiry =
      Date.now() +
      8 * 60 * 60 * 1000;

    console.log(
      "SHIPROCKET TOKEN GENERATED"
    );

    return cachedToken;
  } catch (error: any) {
    console.error(
      "SHIPROCKET AUTH ERROR:",
      error
    );

    throw error;
  }
}

export async function shiprocketRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token =
    await getShiprocketToken();

  const response = await fetch(
    `${process.env.SHIPROCKET_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type":
          "application/json",
        ...(options.headers || {}),
      },
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "SHIPROCKET API ERROR:",
      data
    );

    throw new Error(
      data?.message ||
        "Shiprocket request failed"
    );
  }

  return data;
}
