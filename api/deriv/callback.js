// api/deriv/session.js
// PELItradershub
// REAL DERIV OPTIONS ACCOUNT ONLY

const APP_ID = "34aZNrTmY1AZc7hjuxyLv";

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      connected: false,
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
        account: null,
        ws_url: null,
        error: "No Deriv authorization session was found."
      });

    }

    // --------------------------------------------------
    // GET DERIV OPTIONS ACCOUNTS
    // --------------------------------------------------

    const accountsResponse = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",

        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "Deriv-App-ID":
            APP_ID,

          "Accept":
            "application/json"
        }
      }
    );

    const accountsBody =
      await accountsResponse.json();

    if (!accountsResponse.ok) {

      console.error(
        "DERIV ACCOUNTS ERROR:",
        accountsBody
      );

      return res.status(accountsResponse.status).json({
        connected: false,
        authenticated: false,
        real_account_available: false,
        account: null,
        ws_url: null,

        error:
          accountsBody?.errors?.[0]?.message ||
          accountsBody?.error?.message ||
          "Unable to retrieve Deriv accounts."
      });

    }

    // --------------------------------------------------
    // NORMALIZE ACCOUNT RESPONSE
    // --------------------------------------------------

    const rawAccounts =
      accountsBody?.data?.accounts ??
      accountsBody?.data ??
      accountsBody?.accounts ??
      [];

    const accounts =
      Array.isArray(rawAccounts)
        ? rawAccounts
        : [rawAccounts];

    console.log(
      "DERIV OPTIONS ACCOUNTS:",
      accounts.map(a => ({
        account_id:
          a?.account_id ||
          a?.id,

        account_type:
          a?.account_type ||
          a?.type,

        status:
          a?.status,

        currency:
          a?.currency
      }))
    );

    // --------------------------------------------------
    // FIND REAL ACCOUNT ONLY
    // --------------------------------------------------

    const realAccount =
      accounts.find(account => {

        const type =
          String(
            account?.account_type ??
            account?.type ??
            ""
          ).toLowerCase();

        return type === "real";

      });

    if (!realAccount) {

      return res.status(200).json({

        connected: true,

        authenticated: false,

        real_account_available: false,

        account: null,

        ws_url: null,

        error:
          "Your Deriv authorization is valid, but no REAL Options account was returned."
      });

    }

    const accountId =
      realAccount.account_id ||
      realAccount.id;

    if (!accountId) {

      return res.status(200).json({

        connected: true,

        authenticated: false,

        real_account_available: false,

        account: null,

        ws_url: null,

        error:
          "Deriv returned a real account without an account ID."
      });

    }

    // --------------------------------------------------
    // REQUEST ONE-TIME REAL WEBSOCKET PASSWORD
    // --------------------------------------------------

    const otpResponse = await fetch(

      `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,

      {
        method: "POST",

        headers: {

          "Authorization":
            `Bearer ${accessToken}`,

          "Deriv-App-ID":
            APP_ID,

          "Accept":
            "application/json"
        }
      }

    );

    const otpBody =
      await otpResponse.json();

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

        real_account_available: true,

        account: {
          ...realAccount,
          account_id: accountId
        },

        ws_url: null,

        error:
          otpBody?.errors?.[0]?.message ||
          otpBody?.error?.message ||
          "Deriv could not create the real trading WebSocket."
      });

    }

    const wsUrl =
      String(
        otpBody.data.url
      );

    // --------------------------------------------------
    // HARD REAL-ACCOUNT CHECK
    // --------------------------------------------------

    if (
      !wsUrl.includes(
        "/trading/v1/options/ws/real"
      )
    ) {

      console.error(
        "SECURITY ERROR: DERIV DID NOT RETURN REAL WS URL",
        wsUrl
      );

      return res.status(502).json({

        connected: false,

        authenticated: false,

        real_account_available: false,

        account: null,

        ws_url: null,

        error:
          "Deriv did not return a REAL trading WebSocket. Trading has been blocked."
      });

    }

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return res.status(200).json({

      connected: true,

      authenticated: false,

      real_account_available: true,

      account: {

        ...realAccount,

        account_id: accountId,

        account_type: "real"

      },

      ws_url: wsUrl

    });

  } catch (error) {

    console.error(
      "DERIV SESSION ERROR:",
      error
    );

    return res.status(500).json({

      connected: false,

      authenticated: false,

      real_account_available: false,

      account: null,

      ws_url: null,

      error:
        "Unable to establish the real Deriv trading session."
    });

  }

}


// ==================================================
// COOKIE PARSER
// ==================================================

function parseCookies(header) {

  const result = {};

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

    if (name) {

      try {

        result[name] =
          decodeURIComponent(value);

      } catch {

        result[name] =
          value;

      }

    }

  }

  return result;

}
