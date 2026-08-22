export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
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
      return res.status(401).json({
        error: "Deriv account is not connected."
      });
    }

    const trade = req.body;

    if (!trade || typeof trade !== "object") {
      return res.status(400).json({
        error: "Invalid trade request."
      });
    }

    /*
     * Forward the authenticated request
     * to Deriv without exposing the token
     * to the browser.
     */
    const response = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "Deriv-App-ID":
            "34aZNrTmY1AZc7hjuxyLv",

          "Content-Type":
            "application/json",

          "Accept":
            "application/json"
        },

        body: JSON.stringify(trade)
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      console.error(
        "Deriv trade request failed:",
        data
      );

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          data?.message ||
          "Trade request failed."
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error(
      "Trade endpoint error:",
      error
    );

    return res.status(500).json({
      error: "Unable to process trade request."
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
