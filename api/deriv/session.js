// api/deriv/session.js
// PELItradershub
// REAL DERIV OPTIONS SESSION
//
// Replace the entire contents of:
// api/deriv/session.js

const APP_ID = "34aZNrTmY1AZc7hjuxyLv";

const DERIV_API =
  "https://api.derivws.com";

export default async function handler(req, res) {

  // --------------------------------------------------
  // ONLY GET
  // --------------------------------------------------

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

    // ------------------------------------------------
    // READ DERIV ACCESS TOKEN
    // ------------------------------------------------

    const cookies =
      parseCookies(
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
          "No Deriv authorization session was found. Please connect your Deriv account first."

      });

    }

    // ------------------------------------------------
    // GET ALL OPTIONS ACCOUNTS
    // ------------------------------------------------

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

          cache:
            "no-store"
        }
      );

    const accountsBody =
      await readJson(
        accountsResponse
      );

    if (!accountsResponse.ok) {

      console.error(
        "DERIV OPTIONS ACCOUNTS ERROR:",
        accountsBody
      );

      return res.status(
        accountsResponse.status
      ).json({

        connected: false,

        authenticated: false,

        real_account_available: false,

        account: null,

        ws_url: null,

        error:
          derivError(
            accountsBody
          )

      });

    }

    // ------------------------------------------------
    // NORMALIZE DERIV RESPONSE
    //
    // Normally:
    //
    // {
    //   data: [
    //     {...},
    //     {...}
    //   ]
    // }
    //
    // ------------------------------------------------

    let accounts =
      accountsBody?.data;

    if (!Array.isArray(accounts)) {

      if (
        accounts &&
        typeof accounts === "object"
      ) {

        accounts = [
          accounts
        ];

      } else {

        accounts = [];

      }

    }

    // ------------------------------------------------
    // LOG ONLY SAFE ACCOUNT INFORMATION
    // ------------------------------------------------

    console.log(
      "PELI Deriv Options accounts:",
      accounts.map(
        account => ({
          account_id:
            account?.account_id ||
            account?.id ||
            null,

          account_type:
            account?.account_type ||
            account?.type ||
            null,

          group:
            account?.group ||
            null,

          status:
            account?.status ||
            null,

          currency:
            account?.currency ||
            null
        })
      )
    );

    // ------------------------------------------------
    // FIND REAL ACCOUNT
    //
    // IMPORTANT:
    // We do NOT turn a demo account into a real account.
    //
    // Deriv's account response tells us the account type.
    // ------------------------------------------------

    const realAccount =
      accounts.find(
        account => {

          const accountType =
            String(
              account?.account_type ??
              account?.type ??
              ""
            )
              .trim()
              .toLowerCase();

          return (
            accountType === "real"
          );

        }
      );

    // ------------------------------------------------
    // NO REAL OPTIONS ACCOUNT
    // ------------------------------------------------

    if (!realAccount) {

  return res.status(200).json({

    connected: true,

    authenticated: false,

    real_account_available: false,

    account: null,

    ws_url: null,

    error:
      "Deriv returned Options accounts, but no REAL account was found.",

    debug_accounts:
      accounts.map(account => ({
        account_id:
          account?.account_id ??
          account?.id ??
          null,

        account_type:
          account?.account_type ??
          account?.type ??
          null,

        status:
          account?.status ??
          null,

        currency:
          account?.currency ??
          null,

        group:
          account?.group ??
          null
      }))

  });

}

    // ------------------------------------------------
    // ACCOUNT ID
    // ------------------------------------------------

    const accountId =
      realAccount.account_id ||
      realAccount.id ||
      null;

    if (!accountId) {

      console.error(
        "REAL ACCOUNT WITHOUT ACCOUNT ID:",
        realAccount
      );

      return res.status(502).json({

        connected: true,

        authenticated: false,

        real_account_available: true,

        account: null,

        ws_url: null,

        error:
          "Deriv returned a REAL Options account, but no account ID was provided."

      });

    }

    // ------------------------------------------------
    // NORMALIZED REAL ACCOUNT
    // ------------------------------------------------

    const account = {

      ...realAccount,

      account_id:
        String(accountId),

      account_type:
        "real"

    };

    // ------------------------------------------------
    // REQUEST ONE-TIME REAL WEBSOCKET URL
    // ------------------------------------------------

    const otpUrl =
      `${DERIV_API}/trading/v1/options/accounts/` +
      `${encodeURIComponent(accountId)}/otp`;

    const otpResponse =
      await fetch(
        otpUrl,
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

          cache:
            "no-store"
        }
      );

    const otpBody =
      await readJson(
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

        real_account_available: true,

        account,

        ws_url: null,

        error:
          derivError(
            otpBody
          )

      });

    }

    // ------------------------------------------------
    // GET OTP WEBSOCKET URL
    // ------------------------------------------------

    const wsUrl =
      otpBody?.data?.url ||
      otpBody?.url ||
      null;

    if (!wsUrl) {

      console.error(
        "DERIV OTP RESPONSE HAS NO URL:",
        otpBody
      );

      return res.status(502).json({

        connected: true,

        authenticated: false,

        real_account_available: true,

        account,

        ws_url: null,

        error:
          "Deriv created the account session but did not return a WebSocket URL."

      });

    }

    // ------------------------------------------------
    // VALIDATE URL
    // ------------------------------------------------

    let parsedUrl;

    try {

      parsedUrl =
        new URL(
          String(wsUrl)
        );

    } catch (error) {

      console.error(
        "INVALID DERIV WS URL:",
        wsUrl
      );

      return res.status(502).json({

        connected: true,

        authenticated: false,

        real_account_available: true,

        account,

        ws_url: null,

        error:
          "Deriv returned an invalid WebSocket URL."

      });

    }

    // ------------------------------------------------
    // HARD REAL-ACCOUNT SECURITY CHECK
    // ------------------------------------------------

    const pathname =
      parsedUrl.pathname;

    const realPath =
      "/trading/v1/options/ws/real";

    const demoPath =
      "/trading/v1/options/ws/demo";

    const isReal =
      pathname === realPath ||
      pathname.endsWith(realPath);

    const isDemo =
      pathname === demoPath ||
      pathname.endsWith(demoPath);

    // NEVER allow demo.

    if (
      isDemo ||
      !isReal
    ) {

      console.error(
        "PELI SECURITY BLOCK:",
        {
          pathname
        }
      );

      return res.status(502).json({

        connected: false,

        authenticated: false,

        real_account_available: true,

        account,

        ws_url: null,

        error:
          "Security check failed. Deriv did not return a REAL trading WebSocket. Trading has been blocked."

      });

    }

    // ------------------------------------------------
    // MAKE SURE OTP EXISTS
    //
    // The URL should contain the short-lived OTP.
    // ------------------------------------------------

    const otp =
      parsedUrl.searchParams.get(
        "otp"
      );

    if (!otp) {

      console.error(
        "DERIV REAL WS URL HAS NO OTP"
      );

      return res.status(502).json({

        connected: false,

        authenticated: false,

        real_account_available: true,

        account,

        ws_url: null,

        error:
          "Deriv returned a REAL WebSocket URL without an authentication OTP."

      });

    }

    // ------------------------------------------------
    // SUCCESS
    //
    // IMPORTANT:
    // Return the exact URL generated by Deriv.
    //
    // Do NOT rebuild it.
    // Do NOT replace /real with /demo.
    // ------------------------------------------------

    return res.status(200).json({

      connected: true,

      authenticated: true,

      real_account_available: true,

      account,

      account_type:
        "real",

      ws_url:
        String(wsUrl)

    });

  } catch (error) {

    console.error(
      "PELI REAL DERIV SESSION ERROR:",
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
        "Unable to establish the REAL Deriv trading session."

    });

  }

}


// ==================================================
// SAFE JSON READER
// ==================================================

async function readJson(response) {

  try {

    return await response.json();

  } catch (error) {

    return {};

  }

}


// ==================================================
// DERIV ERROR
// ==================================================

function derivError(body) {

  if (
    Array.isArray(
      body?.errors
    ) &&
    body.errors.length > 0
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
    typeof body?.error ===
    "string"
  ) {

    return body.error;

  }

  if (
    body?.message
  ) {

    return body.message;

  }

  return (
    "Deriv API request failed."
  );

}


// ==================================================
// COOKIE PARSER
// ==================================================

function parseCookies(header) {

  const cookies =
    Object.create(null);

  if (
    !header ||
    typeof header !== "string"
  ) {

    return cookies;

  }

  const parts =
    header.split(";");

  for (
    const part of parts
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

      cookies[name] =
        decodeURIComponent(
          value
        );

    } catch (error) {

      cookies[name] =
        value;

    }

  }

  return cookies;

}
