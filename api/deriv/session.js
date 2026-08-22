// api/deriv/session.js
// REAL Options account only.
// Never falls back to a demo account.

const APP_ID =
  "34aZNrTmY1AZc7hjuxyLv";

export default async function handler(
  req,
  res
) {
  if (
    req.method !== "GET"
  ) {
    return res
      .status(405)
      .json({
        error:
          "Method not allowed"
      });
  }

  try {
    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );

    const accessToken =
      cookies.deriv_access_token;

    if (!accessToken) {
      return res
        .status(401)
        .json({
          connected:
            false,

          account:
            null,

          ws_url:
            null,

          error:
            "Deriv account is not connected."
        });
    }

    const response =
      await fetch(
        "https://api.derivws.com/trading/v1/options/accounts",
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            "Deriv-App-ID":
              APP_ID,

            Accept:
              "application/json"
          }
        }
      );

    const body =
      await response.json();

    if (
      !response.ok
    ) {
      console.error(
        "Deriv accounts failed:",
        body
      );

      return res
        .status(
          response.status
        )
        .json({
          connected:
            false,

          account:
            null,

          ws_url:
            null,

          error:
            body?.errors?.[0]
              ?.message ||
            body?.error?.message ||
            "Unable to load Deriv Options accounts."
        });
    }

    const raw =
      body?.data?.accounts ??
      body?.data ??
      body?.accounts ??
      [];

    const accounts =
      Array.isArray(raw)
        ? raw
        : [raw];

    // REAL ONLY.
    // There is intentionally NO demo fallback.

    const realAccount =
      accounts.find(
        a =>
          String(
            a?.account_type ??
            a?.type ??
            ""
          ).toLowerCase() ===
          "real"
      );

    if (
      !realAccount
    ) {
      return res
        .status(200)
        .json({
          connected:
            true,

          real_account_available:
            false,

          account:
            null,

          ws_url:
            null,

          error:
            "No real Deriv Options account is available for this account."
        });
    }

    const accountId =
      realAccount.account_id ||
      realAccount.id;

    if (
      !accountId
    ) {
      return res
        .status(200)
        .json({
          connected:
            true,

          real_account_available:
            false,

          account:
            null,

          ws_url:
            null,

          error:
            "Deriv did not return a real Options account ID."
        });
    }

    const otpResponse =
      await fetch(
        `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(
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
        "Deriv real OTP failed:",
        otpBody
      );

      return res
        .status(200)
        .json({
          connected:
            true,

          real_account_available:
            true,

          account: {
            ...realAccount,
            account_id:
              accountId
          },

          ws_url:
            null,

          error:
            otpBody?.errors?.[0]
              ?.message ||
            otpBody?.error?.message ||
            "Unable to create the real Deriv trading connection."
        });
    }

    return res
      .status(200)
      .json({
        connected:
          true,

        real_account_available:
          true,

        account: {
          ...realAccount,
          account_id:
            accountId
        },

        ws_url:
          otpBody.data.url
      });

  } catch (
    error
  ) {
    console.error(
      "Deriv real session error:",
      error
    );

    return res
      .status(500)
      .json({
        connected:
          false,

        account:
          null,

        ws_url:
          null,

        error:
          "Unable to establish the real Deriv session."
      });
  }
}


function parseCookies(
  header
) {
  const result = {};

  for (
    const part of
    header.split(";")
  ) {
    const i =
      part.indexOf("=");

    if (i < 0) {
      continue;
    }

    const name =
      part
        .slice(0, i)
        .trim();

    const value =
      part
        .slice(i + 1)
        .trim();

    if (name) {
      result[name] =
        decodeURIComponent(
          value
        );
    }
  }

  return result;
}
