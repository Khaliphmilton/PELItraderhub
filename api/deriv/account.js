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
      return res.status(401).json({
        connected: false,
        error: "Deriv account is not connected."
      });
    }

    const response = await fetch(
      "https://api.derivws.com/trading/v1/options/accounts",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Deriv-App-ID": "34aZNrTmY1AZc7hjuxyLv",
          Accept: "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Deriv account request failed:",
        data
      );

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Unable to load Deriv account."
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error(
      "Deriv account error:",
      error
    );

    return res.status(500).json({
      error: "Unable to load Deriv account."
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
