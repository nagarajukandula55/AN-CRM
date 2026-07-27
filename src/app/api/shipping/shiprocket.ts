let cachedToken: string | null = null;
let tokenExpiry = 0;

export async function getShiprocketToken() {
  if (
    cachedToken &&
    tokenExpiry > Date.now()
  ) {
    return cachedToken;
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

  const data =
    await response.json();

  if (!data.token) {
    throw new Error(
      "Shiprocket authentication failed"
    );
  }

  cachedToken = data.token;

  tokenExpiry =
    Date.now() + 8 * 60 * 60 * 1000;

  return cachedToken;
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

  return data;
}
