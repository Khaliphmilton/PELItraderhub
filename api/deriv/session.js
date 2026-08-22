// api/deriv/session.js
//
// PELItradershub
// REAL DERIV OPTIONS ACCOUNT SESSION
//
// Flow:
//
// Browser
//   -> GET /api/deriv/session
//   -> read OAuth access token from secure cookie
//   -> GET Deriv Options accounts
//   -> select REAL account only
//   -> POST real account OTP
//   -> return authenticated REAL WebSocket URL
//
// IMPORTANT:
// This file NEVER falls back to demo.
// The returned WebSocket URL must contain /ws/real.
//

const APP_ID =
  "34aZNrTmY1AZc7hjuxyLv";

const DERIV_API =
  "https://api.derivws.com";


export default async function handler(req, res) {

  /*
   * ----------------------------------------------------------
   * METHOD
   * ----------------------------------------------------------
   */

  if (req.method !== "GET") {

    return res
      .status(405)
      .json({
        connected: false,
        real_account_available: false,
        account: null,
        ws_url: null,
        error: "Method not allowed"
      });

  }


  /*
   * ----------------------------------------------------------
   * READ COOKIE
   * ----------------------------------------------------------
   */

  try {

    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );

    const accessToken =
      cookies.deriv_access_token;


    /*
     * No OAuth token means the user has not
     * authenticated with Deriv.
     */

    if (!accessToken) {

      return res
        .status(401)
        .json({

          connected: false,

          real_account_available:
            false,

          account: null,

          ws_url: null,

          error:
            "Deriv account is not connected. Please connect your Deriv account first."

        });

    }


    /*
     * --------------------------------------------------------
     * STEP 1
     * GET OPTIONS ACCOUNTS
     * --------------------------------------------------------
     *
     * Current Deriv API:
     *
     * GET
     * /trading/v1/options/accounts
     *
     * Requires:
     * Authorization: Bearer TOKEN
     * Deriv-App-ID: APP_ID
     */

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
      await safeJson(
        accountsResponse
      );


    /*
     * --------------------------------------------------------
     * ACCOUNT API ERROR
     * --------------------------------------------------------
     */

    if (!accountsResponse.ok) {

      console.error(
        "Deriv accounts request failed:",
        accountsBody
      );


      return res
        .status(
          accountsResponse.status
        )
        .json({

          connected: false,

          real_account_available:
            false,

          account: null,

          ws_url: null,

          error:
            extractDerivError(
              accountsBody
            )

        });

    }


    /*
     * --------------------------------------------------------
     * NORMALIZE ACCOUNT RESPONSE
     * --------------------------------------------------------
     *
     * Deriv can return the account collection
     * under data.
     */

    const rawAccounts =
      accountsBody?.data ??
      accountsBody?.accounts ??
      [];


    let accounts;


    if (
      Array.isArray(
        rawAccounts
      )
    ) {

      accounts =
        rawAccounts;

    } else if (
      rawAccounts &&
      typeof rawAccounts ===
        "object"
    ) {

      accounts =
        [rawAccounts];

    } else {

      accounts =
        [];

    }


    /*
     * --------------------------------------------------------
     * REAL ACCOUNT ONLY
     * --------------------------------------------------------
     */

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

          return type === "real";

        }
      );


    /*
     * NEVER select demo.
     */

    if (!realAccount) {

      return res
        .status(200)
        .json({

          connected: false,

          real_account_available:
            false,

          account: null,

          ws_url: null,

          error:
            "No REAL Deriv Options account was found. Demo accounts are not accepted."

        });

    }


    /*
     * --------------------------------------------------------
     * ACCOUNT ID
     * --------------------------------------------------------
     */

    const accountId =
      realAccount.account_id ??
      realAccount.id ??
      null;


    if (!accountId) {

      console.error(
        "Deriv real account has no account ID:",
        realAccount
      );


      return res
        .status(500)
        .json({

          connected: false,

          real_account_available:
            false,

          account: null,

          ws_url: null,

          error:
            "Deriv returned a REAL account but no account ID."

        });

    }


    /*
     * --------------------------------------------------------
     * NORMALIZED ACCOUNT OBJECT
     * --------------------------------------------------------
     */

    const account = {

      ...realAccount,

      account_id:
        String(
          accountId
        ),

      account_type:
        "real"

    };


    /*
     * --------------------------------------------------------
     * STEP 2
     * REQUEST REAL ACCOUNT OTP
     * --------------------------------------------------------
     *
     * POST
     * /trading/v1/options/accounts/{accountId}/otp
     *
     * The returned URL contains the short-lived OTP.
     *
     * IMPORTANT:
     * Use it immediately.
     */

    const otpResponse =
      await fetch(

        `${DERIV_API}/trading/v1/options/accounts/${encodeURIComponent(
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


    /*
     * --------------------------------------------------------
     * OTP ERROR
     * --------------------------------------------------------
     */

    if (!otpResponse.ok) {

      console.error(
        "Deriv REAL OTP request failed:",
        otpBody
      );


      return res
        .status(
          otpResponse.status
        )
        .json({

          connected: false,

          real_account_available:
            true,

          account,

          ws_url: null,

          error:
            extractDerivError(
              otpBody
            )

        });

    }


    /*
     * --------------------------------------------------------
     * GET WEBSOCKET URL
     * --------------------------------------------------------
     */

    const wsUrl =
      otpBody?.data?.url ??
      otpBody?.url ??
      null;


    if (!wsUrl) {

      console.error(
        "Deriv OTP response did not contain a WebSocket URL:",
        otpBody
      );


      return res
        .status(502)
        .json({

          connected: false,

          real_account_available:
            true,

          account,

          ws_url: null,

          error:
            "Deriv generated the trading session but did not return a WebSocket URL."

        });

    }


    /*
     * --------------------------------------------------------
     * REAL ACCOUNT SAFETY CHECK
     * --------------------------------------------------------
     *
     * Current Deriv Options API uses:
     *
     * /ws/real?otp=...
     *
     * Demo uses:
     *
     * /ws/demo?otp=...
     *
     * We refuse anything that is not the REAL endpoint.
     */

    let parsedUrl;


    try {

      parsedUrl =
        new URL(
          wsUrl
        );

    } catch (_) {

      return res
        .status(502)
        .json({

          connected: false,

          real_account_available:
            true,

          account,

          ws_url: null,

          error:
            "Deriv returned an invalid trading WebSocket URL."

        });

    }


    const pathname =
      parsedUrl.pathname;


    const isRealWebSocket =
      pathname.includes(
        "/trading/v1/options/ws/real"
      );


    const isDemoWebSocket =
      pathname.includes(
        "/trading/v1/options/ws/demo"
      );


    /*
     * HARD BLOCK DEMO.
     */

    if (
      isDemoWebSocket ||
      !isRealWebSocket
    ) {

      console.error(
        "SECURITY BLOCK: Deriv did not return a REAL WebSocket URL.",
        {
          pathname
        }
      );


      return res
        .status(502)
        .json({

          connected: false,

          real_account_available:
            true,

          account,

          ws_url: null,

          error:
            "Security check failed: Deriv did not return a REAL trading WebSocket."

        });

    }


    /*
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     *
     * At this point:
     *
     * 1. OAuth token exists.
     * 2. Deriv returned the user's Options accounts.
     * 3. A REAL account was found.
     * 4. OTP was successfully generated.
     * 5. The URL is explicitly /ws/real.
     *
     * The browser can now create:
     *
     * new WebSocket(ws_url)
     */

    return res
      .status(200)
      .json({

        connected:
          true,

        authenticated:
          true,

        real_account_available:
          true,

        account,

        ws_url:
          wsUrl,

        account_type:
          "real"

      });


  } catch (error) {

    console.error(
      "PELI REAL Deriv session error:",
      error
    );


    return res
      .status(500)
      .json({

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


/*
 * ============================================================
 * SAFE JSON
 * ============================================================
 */

async function safeJson(
  response
) {

  try {

    return await response.json();

  } catch (_) {

    return {};

  }

}


/*
 * ============================================================
 * DERIV ERROR EXTRACTION
 * ============================================================
 */

function extractDerivError(
  body
) {

  if (
    body?.errors &&
    Array.isArray(
      body.errors
    ) &&
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
    typeof body?.error ===
    "string"
  ) {

    return body.error;

  }


  return (
    body?.message ||
    "Deriv API request failed."
  );

}


/*
 * ============================================================
 * COOKIE PARSER
 * ============================================================
 */

function parseCookies(
  header
) {

  const result =
    Object.create(null);


  if (
    !header ||
    typeof header !==
      "string"
  ) {

    return result;

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


    const rawValue =
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
          rawValue
        );

    } catch (_) {

      result[name] =
        rawValue;

    }

  }


  return result;

}
