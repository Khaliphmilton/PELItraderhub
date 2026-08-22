// api/deriv/session.js
// PELItradershub
// REAL DERIV OPTIONS ACCOUNT SESSION ONLY

const APP_ID = "34aZNrTmY1AZc7hjuxyLv";

const DERIV_API =
  "https://api.derivws.com";

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

    // ==========================================
    // READ DERIV OAUTH COOKIE
    // ==========================================

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
        account: null,
        ws_url: null,
        error:
          "No Deriv authorization session was found."
      });
    }


    // ==========================================
    // GET OPTIONS ACCOUNTS
    // ==========================================

    const accountsResponse =
      await fetch(
        `${DERIV_API}/trading/v1/options/accounts`,
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

          cache: "no-store"
        }
      );


    const accountsBody =
      await safeJson(accountsResponse);


    if (!accountsResponse.ok) {

      console.error(
        "DERIV OPTIONS ACCOUNTS ERROR:",
        accountsBody
      );

      return res
        .status(accountsResponse.status)
        .json({
          connected: false,
          authenticated: false,
          real_account_available: false,
          account: null,
          ws_url: null,
          error:
            extractError(accountsBody)
        });
    }


    // ==========================================
    // NORMALIZE ACCOUNTS
    // ==========================================

    let accounts = [];

    if (
      Array.isArray(
        accountsBody?.data
      )
    ) {

      accounts =
        accountsBody.data;

    } else if (
      Array.isArray(
        accountsBody?.data?.accounts
      )
    ) {

      accounts =
        accountsBody.data.accounts;

    } else if (
      Array.isArray(
        accountsBody?.accounts
      )
    ) {

      accounts =
        accountsBody.accounts;

    } else if (
      accountsBody?.data?.accounts &&
      typeof accountsBody.data.accounts ===
        "object"
    ) {

      accounts =
        Object.values(
          accountsBody.data.accounts
        );

    } else if (
      accountsBody?.data &&
      typeof accountsBody.data ===
        "object"
    ) {

      /*
       * Some responses return accounts
       * as an object keyed by account ID.
       */

      accounts =
        Object.values(
          accountsBody.data
        ).filter(
          item =>
            item &&
            typeof item === "object"
        );

    }


    console.log(
      "DERIV OPTIONS ACCOUNTS:",
      accounts
    );


    // ==========================================
    // FIND REAL ACCOUNT
    // ==========================================

    const realAccount =
      accounts.find(
        account => {

          const type =
            String(
              account?.account_type ??
              account?.type ??
              ""
            )
              .trim()
              .toLowerCase();

          return (
            type === "real" ||
            type === "real_account"
          );
        }
      );


    // ==========================================
    // NO REAL ACCOUNT
    // ==========================================

    if (!realAccount) {

      return res.status(200).json({

        connected: true,

        authenticated: false,

        real_account_available:
          false,

        account: null,

        ws_url: null,

        error:
          "Your Deriv authorization is valid, but Deriv did not return a REAL Options account."
      });

    }


    // ==========================================
    // ACCOUNT ID
    // ==========================================

    const accountId =
      realAccount.account_id ??
      realAccount.id ??
      realAccount.loginid ??
      null;


    if (!accountId) {

      return res.status(502).json({

        connected: true,

        authenticated: false,

        real_account_available:
          false,

        account: null,

        ws_url: null,

        error:
          "Deriv returned a REAL account but no account ID."
      });

    }


    // ==========================================
    // NORMALIZED REAL ACCOUNT
    // ==========================================

    const account = {

      ...realAccount,

      account_id:
        String(accountId),

      account_type:
        "real"
    };


    // ==========================================
    // REQUEST REAL OPTIONS OTP
    // ==========================================

    const otpResponse =
      await fetch(

        `${DERIV_API}/trading/v1/options/accounts/${encodeURIComponent(
          accountId
        )}/otp`,

        {
          method: "POST",

          headers: {

            Authorization:
              `Bearer ${accessToken}`,

            "Deriv-App-ID":
              APP_ID,

            Accept:
              "application/json"
          },

          cache: "no-store"
        }
      );


    const otpBody =
      await safeJson(
        otpResponse
      );


    if (!otpResponse.ok) {

      console.error(
        "DERIV REAL OTP ERROR:",
        otpBody
      );

      return res.status(
        otpResponse.status
      ).json({

        connected: true,

        authenticated: false,

        real_account_available:
          true,

        account,

        ws_url: null,

        error:
          extractError(
            otpBody
          )
      });

    }


    // ==========================================
    // GET WEBSOCKET URL
    // ==========================================

    const wsUrl =
      otpBody?.data?.url ??
      otpBody?.url ??
      null;


    if (!wsUrl) {

      return res.status(502).json({

        connected: true,

        authenticated: false,

        real_account_available:
          true,

        account,

        ws_url: null,

        error:
          "Deriv did not return the real trading WebSocket URL."
      });

    }


    // ==========================================
    // HARD REAL-ACCOUNT SECURITY CHECK
    // ==========================================

    let parsed;

    try {

      parsed =
        new URL(
          String(wsUrl)
        );

    } catch {

      return res.status(502).json({

        connected: false,

        authenticated: false,

        real_account_available:
          true,

        account,

        ws_url: null,

        error:
          "Deriv returned an invalid WebSocket URL."
      });

    }


    const pathname =
      parsed.pathname;


    const isReal =
      pathname.includes(
        "/trading/v1/options/ws/real"
      );


    const isDemo =
      pathname.includes(
        "/trading/v1/options/ws/demo"
      );


    if (
      isDemo ||
      !isReal
    ) {

      console.error(
        "REAL ACCOUNT SECURITY BLOCK:",
        pathname
      );

      return res.status(502).json({

        connected: false,

        authenticated: false,

        real_account_available:
          false,

        account: null,

        ws_url: null,

        error:
          "Deriv did not return a REAL trading WebSocket. Trading was blocked."
      });

    }


    // ==========================================
    // SUCCESS
    // ==========================================

    return res.status(200).json({

      connected: true,

      authenticated: true,

      real_account_available:
        true,

      account,

      ws_url:
        String(wsUrl),

      account_type:
        "real"
    });


  } catch (error) {

    console.error(
      "PELI REAL DERIV SESSION ERROR:",
      error
    );

    return res.status(500).json({

      connected: false,

      authenticated: false,

      real_account_available:
        false,

      account: null,

      ws_url: null,

      error:
        error?.message ||
        "Unable to establish the REAL Deriv trading session."
    });

  }
}


// ==================================================
// SAFE JSON
// ==================================================

async function safeJson(response) {

  try {
    return await response.json();
  } catch {
    return {};
  }

}


// ==================================================
// ERROR EXTRACTION
// ==================================================

function extractError(body) {

  if (
    Array.isArray(body?.errors) &&
    body.errors.length
  ) {

    return (
      body.errors[0]?.message ||
      "Deriv API request failed."
    );

  }

  if (
    body?.error?.message
  ) {

    return body.error.message;

  }

  if (
    typeof body?.error === "string"
  ) {

    return body.error;

  }

  return (
    body?.message ||
    "Deriv API request failed."
  );

}


// ==================================================
// COOKIE PARSER
// ==================================================

function parseCookies(header) {

  const result =
    Object.create(null);

  if (!header) {
    return result;
  }

  for (
    const part of header.split(";")
  ) {

    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const name =
      part
        .slice(0, index)
        .trim();

    const value =
      part
        .slice(index + 1)
        .trim();

    if (!name) {
      continue;
    }

    try {

      result[name] =
        decodeURIComponent(value);

    } catch {

      result[name] =
        value;

    }

  }

  return result;

}
