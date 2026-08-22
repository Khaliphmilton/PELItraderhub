// api/deriv/session.js
// PELItradershub
// Deriv Options authenticated session
// Supports REAL and DEMO accounts.
//
// The browser never receives the OAuth access token.
// The token remains in the secure cookie created by callback.js.

const APP_ID = "34aZNrTmY1AZc7hjuxyLv";
const API_BASE = "https://api.derivws.com";

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      connected: false,
      authenticated: false,
      error: "Method not allowed"
    });
  }

  try {

    const cookies = parseCookies(
      req.headers.cookie || ""
    );

    const accessToken =
      cookies.deriv_access_token;

    if (!accessToken) {

      return res.status(401).json({
        connected: false,
        authenticated: false,
        real_account_available: false,
        demo_account_available: false,
        account: null,
        ws_url: null,
        error:
          "No Deriv authorization session was found."
      });

    }

    /*
     * ?mode=real
     * ?mode=demo
     */

    const requestedMode =
      String(
        req.query?.mode || "real"
      )
        .toLowerCase()
        .trim();

    const mode =
      requestedMode === "demo"
        ? "demo"
        : "real";

    /*
     * ------------------------------------------
     * GET OPTIONS ACCOUNTS
     * ------------------------------------------
     */

    const accountsResponse =
      await fetch(
        `${API_BASE}/trading/v1/options/accounts`,
        {
          method: "GET",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Deriv-App-ID":
              APP_ID,

            Accept:
              "application/json"
          },

          cache:
            "no-store"
        }
      );

    const accountsBody =
      await safeJson(accountsResponse);

    if (!accountsResponse.ok) {

      console.error(
        "DERIV ACCOUNTS ERROR:",
        accountsBody
      );

      return res.status(
        accountsResponse.status
      ).json({

        connected: false,

        authenticated: false,

        real_account_available:
          false,

        demo_account_available:
          false,

        account: null,

        ws_url: null,

        error:
          extractError(
            accountsBody,
            "Unable to retrieve Deriv accounts."
          )

      });

    }

    /*
     * ------------------------------------------
     * NORMALIZE ACCOUNTS
     * ------------------------------------------
     */

    const rawAccounts =
      accountsBody?.data?.accounts ??
      accountsBody?.data ??
      accountsBody?.accounts ??
      [];

    let accounts = [];

    if (Array.isArray(rawAccounts)) {

      accounts =
        rawAccounts;

    } else if (
      rawAccounts &&
      typeof rawAccounts === "object"
    ) {

      accounts =
        Object.values(
          rawAccounts
        );

    }

    accounts =
      accounts.filter(
        account =>
          account &&
          typeof account === "object"
      );

    /*
     * ------------------------------------------
     * IDENTIFY REAL / DEMO
     * ------------------------------------------
     */

    const classifyAccount =
      account => {

        const type =
          String(
            account?.account_type ??
            account?.type ??
            ""
          )
            .toLowerCase()
            .trim();

        const loginid =
          String(
            account?.loginid ??
            account?.login_id ??
            ""
          )
            .toLowerCase()
            .trim();

        const isVirtual =
          account?.is_virtual === true;

        if (
          type === "demo" ||
          type === "virtual" ||
          isVirtual ||
          loginid.startsWith("vrtc")
        ) {

          return "demo";

        }

        if (
          type === "real" ||
          loginid.startsWith("cr") ||
          loginid.startsWith("ml")
        ) {

          return "real";

        }

        return null;

      };

    const realAccount =
      accounts.find(
        account =>
          classifyAccount(account) ===
          "real"
      );

    const demoAccount =
      accounts.find(
        account =>
          classifyAccount(account) ===
          "demo"
      );

    /*
     * ------------------------------------------
     * SELECT REQUESTED ACCOUNT
     * ------------------------------------------
     */

    const selectedAccount =
      mode === "demo"
        ? demoAccount
        : realAccount;

    if (!selectedAccount) {

      return res.status(200).json({

        connected: true,

        authenticated: false,

        requested_mode:
          mode,

        real_account_available:
          !!realAccount,

        demo_account_available:
          !!demoAccount,

        account: null,

        ws_url: null,

        error:
          mode === "demo"
            ? "No DEMO Options account was returned by Deriv."
            : "No REAL Options account was returned by Deriv."

      });

    }

    /*
     * ------------------------------------------
     * ACCOUNT ID
     * ------------------------------------------
     */

    const accountId =
      selectedAccount.account_id ??
      selectedAccount.id ??
      selectedAccount.loginid ??
      selectedAccount.login_id ??
      null;

    if (!accountId) {

      return res.status(502).json({

        connected: true,

        authenticated: false,

        requested_mode:
          mode,

        real_account_available:
          !!realAccount,

        demo_account_available:
          !!demoAccount,

        account: null,

        ws_url: null,

        error:
          "Deriv returned an account without an account ID."

      });

    }

    /*
     * ------------------------------------------
     * REQUEST ONE-TIME WS OTP
     * ------------------------------------------
     */

    const otpResponse =
      await fetch(

        `${API_BASE}/trading/v1/options/accounts/${encodeURIComponent(
          accountId
        )}/otp`,

        {

          method:
            "POST",

          headers: {

            Authorization:
              `Bearer ${accessToken}`,

            "Deriv-App-ID":
              APP_ID,

            Accept:
              "application/json"

          },

          cache:
            "no-store"

        }

      );

    const otpBody =
      await safeJson(
        otpResponse
      );

    if (
      !otpResponse.ok ||
      !otpBody?.data?.url
    ) {

      console.error(
        "DERIV OTP ERROR:",
        otpBody
      );

      return res.status(502).json({

        connected: true,

        authenticated: false,

        requested_mode:
          mode,

        real_account_available:
          !!realAccount,

        demo_account_available:
          !!demoAccount,

        account: {

          ...selectedAccount,

          account_id:
            String(accountId),

          account_type:
            mode

        },

        ws_url: null,

        error:
          extractError(
            otpBody,
            "Deriv could not create the trading WebSocket."
          )

      });

    }

    const wsUrl =
      String(
        otpBody.data.url
      );

    /*
     * ------------------------------------------
     * SECURITY CHECK
     * ------------------------------------------
     */

    let parsed;

    try {

      parsed =
        new URL(wsUrl);

    } catch {

      return res.status(502).json({

        connected: false,

        authenticated: false,

        requested_mode:
          mode,

        real_account_available:
          false,

        demo_account_available:
          false,

        account: null,

        ws_url: null,

        error:
          "Deriv returned an invalid WebSocket URL."

      });

    }

    const path =
      parsed.pathname;

    const isReal =
      path.includes(
        "/trading/v1/options/ws/real"
      );

    const isDemo =
      path.includes(
        "/trading/v1/options/ws/demo"
      );

    /*
     * Never allow account-mode mismatch.
     */

    if (
      mode === "real" &&
      !isReal
    ) {

      console.error(
        "SECURITY BLOCK: requested REAL but Deriv returned:",
        path
      );

      return res.status(502).json({

        connected: false,

        authenticated: false,

        requested_mode:
          mode,

        real_account_available:
          false,

        demo_account_available:
          !!demoAccount,

        account: null,

        ws_url: null,

        error:
          "Security check failed. Deriv did not return a REAL trading session."

      });

    }

    if (
      mode === "demo" &&
      !isDemo
    ) {

      console.error(
        "SECURITY BLOCK: requested DEMO but Deriv returned:",
        path
      );

      return res.status(502).json({

        connected: false,

        authenticated: false,

        requested_mode:
          mode,

        real_account_available:
          !!realAccount,

        demo_account_available:
          false,

        account: null,

        ws_url: null,

        error:
          "Security check failed. Deriv did not return a DEMO trading session."

      });

    }

    /*
     * ------------------------------------------
     * SUCCESS
     * ------------------------------------------
     */

    return res.status(200).json({

      connected:
        true,

      authenticated:
        true,

      requested_mode:
        mode,

      real_account_available:
        !!realAccount,

      demo_account_available:
        !!demoAccount,

      account: {

        ...selectedAccount,

        account_id:
          String(accountId),

        account_type:
          mode

      },

      ws_url:
        wsUrl

    });

  } catch (error) {

    console.error(
      "DERIV SESSION ERROR:",
      error
    );

    return res.status(500).json({

      connected: false,

      authenticated: false,

      real_account_available:
        false,

      demo_account_available:
        false,

      account: null,

      ws_url: null,

      error:
        error?.message ||
        "Unable to establish Deriv trading session."

    });

  }

}


/*
 * ------------------------------------------
 * SAFE JSON
 * ------------------------------------------
 */

async function safeJson(response) {

  try {

    return await response.json();

  } catch {

    return {};

  }

}


/*
 * ------------------------------------------
 * ERROR
 * ------------------------------------------
 */

function extractError(
  body,
  fallback
) {

  return (
    body?.errors?.[0]?.message ||
    body?.error?.message ||
    body?.message ||
    fallback
  );

}


/*
 * ------------------------------------------
 * COOKIE PARSER
 * ------------------------------------------
 */

function parseCookies(header) {

  const result =
    Object.create(null);

  if (
    !header ||
    typeof header !== "string"
  ) {

    return result;

  }

  for (
    const part of header.split(";")
  ) {

    const index =
      part.indexOf("=");

    if (
      index === -1
    ) {

      continue;

    }

    const name =
      part
        .slice(
          0,
          index
        )
        .trim();

    const value =
      part
        .slice(
          index + 1
        )
        .trim();

    if (!name) {

      continue;

    }

    try {

      result[name] =
        decodeURIComponent(
          value
        );

    } catch {

      result[name] =
        value;

    }

  }

  return result;

}
