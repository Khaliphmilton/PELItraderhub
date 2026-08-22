// api/deriv/session.js
// PELItradershub — REAL DERIV OPTIONS SESSION ONLY

const APP_ID = "34aZNrTmY1AZc7hjuxyLv";
const DERIV_API = "https://api.derivws.com";

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      connected: false,
      authenticated: false,
      real_account_available: false,
      account: null,
      ws_url: null,
      error: "Method not allowed"
    });
  }

  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const accessToken = cookies.deriv_access_token;

    if (!accessToken) {
      return res.status(401).json({
        connected: false,
        authenticated: false,
        real_account_available: false,
        account: null,
        ws_url: null,
        error: "Please connect your Deriv account first."
      });
    }

    const accountsResponse = await fetch(
      `${DERIV_API}/trading/v1/options/accounts`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Deriv-App-ID": APP_ID,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    const accountsBody = await safeJson(accountsResponse);

    if (!accountsResponse.ok) {
      return res.status(accountsResponse.status).json({
        connected: false,
        authenticated: false,
        real_account_available: false,
        account: null,
        ws_url: null,
        error: derivError(accountsBody)
      });
    }

    const raw =
      accountsBody?.data?.accounts ??
      accountsBody?.data ??
      accountsBody?.accounts ??
      [];

    const accounts = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? [raw]
        : [];

    const realAccount = accounts.find(account =>
      String(
        account?.account_type ??
        account?.type ??
        ""
      ).toLowerCase() === "real"
    );

    if (!realAccount) {
      return res.status(200).json({
        connected: true,
        authenticated: false,
        real_account_available: false,
        account: null,
        ws_url: null,
        error:
          "No REAL Deriv Options account was found. Demo accounts are not supported."
      });
    }

    const accountId =
      realAccount.account_id ??
      realAccount.id;

    if (!accountId) {
      return res.status(502).json({
        connected: true,
        authenticated: false,
        real_account_available: false,
        account: null,
        ws_url: null,
        error: "Deriv returned a real account without an account ID."
      });
    }

    const account = {
      ...realAccount,
      account_id: String(accountId),
      account_type: "real"
    };

    /*
     * Generate the one-time WebSocket URL.
     * Deriv says this OTP is valid for 120 seconds
     * and must be used once.
     */
    const otpResponse = await fetch(
      `${DERIV_API}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Deriv-App-ID": APP_ID,
          Accept: "application/json"
        },
        cache: "no-store"
      }
    );

    const otpBody = await safeJson(otpResponse);
    const wsUrl = otpBody?.data?.url;

    if (!otpResponse.ok || !wsUrl) {
      return res.status(502).json({
        connected: true,
        authenticated: false,
        real_account_available: true,
        account,
        ws_url: null,
        error:
          derivError(otpBody) ||
          "Unable to create the real Deriv WebSocket."
      });
    }

    /*
     * HARD REAL-ACCOUNT CHECK.
     */
    let parsed;

    try {
      parsed = new URL(String(wsUrl));
    } catch {
      return res.status(502).json({
        connected: false,
        authenticated: false,
        real_account_available: true,
        account,
        ws_url: null,
        error: "Deriv returned an invalid WebSocket URL."
      });
    }

    const isReal =
      parsed.pathname ===
      "/trading/v1/options/ws/real";

    const isDemo =
      parsed.pathname ===
      "/trading/v1/options/ws/demo";

    if (!isReal || isDemo) {
      console.error(
        "BLOCKED NON-REAL DERIV SOCKET:",
        parsed.pathname
      );

      return res.status(502).json({
        connected: false,
        authenticated: false,
        real_account_available: true,
        account,
        ws_url: null,
        error:
          "Security check failed. Deriv did not return the REAL trading WebSocket."
      });
    }

    /*
     * SUCCESS.
     */
    return res.status(200).json({
      connected: true,
      authenticated: true,
      real_account_available: true,
      account,
      account_type: "real",
      ws_url: String(wsUrl)
    });

  } catch (error) {
    console.error(
      "PELI Deriv session error:",
      error
    );

    return res.status(500).json({
      connected: false,
      authenticated: false,
      real_account_available: false,
      account: null,
      ws_url: null,
      error:
        error?.message ||
        "Unable to establish the real Deriv trading session."
    });
  }
}


async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}


function derivError(body) {

  if (
    Array.isArray(body?.errors) &&
    body.errors.length
  ) {
    return (
      body.errors[0]?.message ||
      "Deriv API request failed."
    );
  }

  if (body?.error?.message) {
    return body.error.message;
  }

  if (typeof body?.error === "string") {
    return body.error;
  }

  return (
    body?.message ||
    "Deriv API request failed."
  );
}


function parseCookies(header) {

  const cookies = {};

  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {

    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name =
      part.slice(0, index).trim();

    const value =
      part.slice(index + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] =
        decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}
