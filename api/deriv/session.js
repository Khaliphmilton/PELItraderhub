export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    const cookies = parseCookies(
      req.headers.cookie || ""
    );

    const accessToken =
      cookies.deriv_access_token;

    if (!accessToken) {
      return res.status(200).json({
        connected: false,
        account: null,
        ws_url: null
      });
    }

    // Get the user's Options accounts
    const accountsResponse = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Deriv-App-ID":
            "34aZNrTmY1AZc7hjuxyLv",

          Accept:
            "application/json"
        }
      }
    );

    const accountsData =
      await accountsResponse.json();

    if (!accountsResponse.ok) {
      console.error(
        "Deriv account lookup failed:",
        accountsData
      );

      return res.status(200).json({
        connected: false,
        account: null,
        ws_url: null,
        error:
          "Unable to validate the Deriv account."
      });
    }

    /*
     * Deriv returns the available Options accounts.
     *
     * We prefer a demo account for development/testing.
     * If no demo account exists, use the first
     * available account.
     */
    const accounts =
      accountsData?.data?.accounts ||
      accountsData?.accounts ||
      [];

    if (!Array.isArray(accounts) ||
        accounts.length === 0) {
      return res.status(200).json({
        connected: true,
        account: null,
        ws_url: null,
        error:
          "No Deriv Options trading account was found."
      });
    }

    const demoAccount =
      accounts.find(
        (account) =>
          String(
            account.account_type ||
            account.type ||
            ""
          ).toLowerCase() === "demo"
      );

    const account =
      demoAccount || accounts[0];

    const accountId =
      account.account_id ||
      account.id;

    if (!accountId) {
      console.error(
        "Deriv account has no account ID:",
        account
      );

      return res.status(200).json({
        connected: true,
        account,
        ws_url: null,
        error:
          "Deriv account ID was not returned."
      });
    }

    /*
     * Request a short-lived authenticated
     * WebSocket URL.
     *
     * Deriv's OTP endpoint returns:
     *
     * data.url
     *
     * The returned URL already contains the
     * one-time authentication credential.
     */
    const otpResponse = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(
        accountId
      )}/otp`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          "Deriv-App-ID":
            "34aZNrTmY1AZc7hjuxyLv",

          Accept:
            "application/json"
        }
      }
    );

    const otpData =
      await otpResponse.json();

    if (!otpResponse.ok) {
      console.error(
        "Deriv OTP request failed:",
        otpData
      );

      return res.status(200).json({
        connected: true,
        account,
        ws_url: null,
        error:
          "Unable to create the authenticated Deriv trading connection."
      });
    }

    const wsUrl =
      otpData?.data?.url;

    if (!wsUrl) {
      console.error(
        "Deriv OTP response did not contain a WebSocket URL:",
        otpData
      );

      return res.status(200).json({
        connected: true,
        account,
        ws_url: null,
        error:
          "Deriv did not return an authenticated WebSocket URL."
      });
    }

    return res.status(200).json({
      connected: true,

      account: {
        ...account,
        account_id: accountId
      },

      ws_url: wsUrl
    });

  } catch (error) {
    console.error(
      "Deriv session error:",
      error
    );

    return res.status(500).json({
      connected: false,
      account: null,
      ws_url: null,
      error:
        "Unable to establish the Deriv session."
    });
  }
}


function parseCookies(cookieHeader) {
  const cookies = {};

  cookieHeader
    .split(";")
    .forEach((cookie) => {
      const separator =
        cookie.indexOf("=");

      if (separator === -1) {
        return;
      }

      const name =
        cookie
          .slice(0, separator)
          .trim();

      const value =
        cookie
          .slice(separator + 1)
          .trim();

      if (name) {
        cookies[name] =
          decodeURIComponent(value);
      }
    });

  return cookies;
}
