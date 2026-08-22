// api/deriv/callback.js
// PELItradershub
// DERIV OAUTH 2.0 CALLBACK
//
// IMPORTANT:
// This file is ONLY the OAuth callback.
// Do NOT put session.js code here.
//
// Flow:
//
// Deriv
//   -> /api/deriv/callback?code=...&state=...
//   -> verify state
//   -> exchange code for access token
//   -> save token in secure HttpOnly cookie
//   -> redirect back to the app
//
// The access token is then used by:
// /api/deriv/session.js


const APP_ID =
  "34aZNrTmY1AZc7hjuxyLv";

const TOKEN_URL =
  "https://auth.deriv.com/oauth2/token";


// ------------------------------------------------------------
// CALLBACK
// ------------------------------------------------------------

export default async function handler(req, res) {

  if (req.method !== "GET") {

    return res
      .status(405)
      .send("Method not allowed");

  }


  try {

    // --------------------------------------------------------
    // READ CALLBACK PARAMETERS
    // --------------------------------------------------------

    const code =
      req.query?.code;

    const returnedState =
      req.query?.state;

    const oauthError =
      req.query?.error;

    const errorDescription =
      req.query?.error_description;


    // --------------------------------------------------------
    // DERIV RETURNED AN ERROR
    // --------------------------------------------------------

    if (oauthError) {

      console.error(
        "DERIV OAUTH ERROR:",
        oauthError,
        errorDescription || ""
      );

      return res
        .redirect(
          `/?deriv=error&message=${encodeURIComponent(
            errorDescription ||
            oauthError
          )}`
        );

    }


    // --------------------------------------------------------
    // CODE REQUIRED
    // --------------------------------------------------------

    if (!code) {

      return res
        .status(400)
        .send(
          "Deriv OAuth callback did not contain an authorization code."
        );

    }


    // --------------------------------------------------------
    // READ COOKIES
    // --------------------------------------------------------

    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );


    const savedState =
      cookies.deriv_oauth_state ||
      cookies.oauth_state;


    const codeVerifier =
      cookies.deriv_code_verifier ||
      cookies.code_verifier;


    // --------------------------------------------------------
    // STATE CHECK
    // --------------------------------------------------------

    if (
      !returnedState ||
      !savedState
    ) {

      console.error(
        "DERIV OAUTH STATE MISSING"
      );

      return res
        .status(400)
        .send(
          "Deriv OAuth state is missing. Please start the connection again."
        );

    }


    if (
      returnedState !==
      savedState
    ) {

      console.error(
        "DERIV OAUTH STATE MISMATCH"
      );

      return res
        .status(400)
        .send(
          "Deriv OAuth security check failed. Please start the connection again."
        );

    }


    // --------------------------------------------------------
    // PKCE VERIFIER REQUIRED
    // --------------------------------------------------------

    if (!codeVerifier) {

      console.error(
        "DERIV PKCE CODE VERIFIER MISSING"
      );

      return res
        .status(400)
        .send(
          "Deriv OAuth code verifier is missing. Please start the connection again."
        );

    }


    // --------------------------------------------------------
    // REDIRECT URI
    // --------------------------------------------------------
    //
    // This MUST exactly match the redirect URI registered
    // in your Deriv OAuth application.
    //
    // For this file:
    //
    // https://YOUR-DOMAIN/api/deriv/callback
    //
    // We build it from the current request so you don't have
    // to hard-code your Vercel domain.
    //

    const protocol =
      (
        req.headers["x-forwarded-proto"] ||
        "https"
      )
        .toString()
        .split(",")[0]
        .trim();


    const host =
      req.headers.host;


    if (!host) {

      return res
        .status(500)
        .send(
          "Unable to determine callback host."
        );

    }


    const redirectUri =
      `${protocol}://${host}/api/deriv/callback`;


    // --------------------------------------------------------
    // EXCHANGE AUTHORIZATION CODE FOR ACCESS TOKEN
    // --------------------------------------------------------

    const tokenResponse =
      await fetch(
        TOKEN_URL,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/x-www-form-urlencoded",

            Accept:
              "application/json"

          },

          body:
            new URLSearchParams({

              grant_type:
                "authorization_code",

              client_id:
                APP_ID,

              code:
                code,

              code_verifier:
                codeVerifier,

              redirect_uri:
                redirectUri

            }).toString()

        }
      );


    const tokenBody =
      await safeJson(
        tokenResponse
      );


    // --------------------------------------------------------
    // TOKEN ERROR
    // --------------------------------------------------------

    if (
      !tokenResponse.ok ||
      !tokenBody?.access_token
    ) {

      console.error(
        "DERIV TOKEN EXCHANGE FAILED:",
        tokenBody
      );

      return res
        .status(502)
        .send(
          "Deriv authorization failed. Please connect your Deriv account again."
        );

    }


    const accessToken =
      String(
        tokenBody.access_token
      );


    // --------------------------------------------------------
    // SAVE ACCESS TOKEN
    // --------------------------------------------------------
    //
    // HttpOnly:
    // JavaScript cannot read the token.
    //
    // Secure:
    // Only sent over HTTPS.
    //
    // SameSite=Lax:
    // Works with the OAuth redirect back to the site.
    //

    const maxAge =
      Number(
        tokenBody.expires_in
      ) > 0
        ? Number(
            tokenBody.expires_in
          )
        : 3600;


    const cookie =
      [
        `deriv_access_token=${encodeURIComponent(
          accessToken
        )}`,

        `Max-Age=${maxAge}`,

        "Path=/",

        "HttpOnly",

        "Secure",

        "SameSite=Lax"

      ].join("; ");


    // --------------------------------------------------------
    // CLEAR ONE-TIME PKCE COOKIES
    // --------------------------------------------------------

    const clearStateCookie =
      [
        "deriv_oauth_state=",

        "Max-Age=0",

        "Path=/",

        "HttpOnly",

        "Secure",

        "SameSite=Lax"

      ].join("; ");


    const clearVerifierCookie =
      [
        "deriv_code_verifier=",

        "Max-Age=0",

        "Path=/",

        "HttpOnly",

        "Secure",

        "SameSite=Lax"

      ].join("; ");


    // --------------------------------------------------------
    // SEND COOKIES
    // --------------------------------------------------------

    res.setHeader(
      "Set-Cookie",
      [
        cookie,
        clearStateCookie,
        clearVerifierCookie
      ]
    );


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------
    //
    // Browser returns to your application.
    //
    // /api/deriv/session can now read:
    //
    // deriv_access_token
    //
    // and request the user's Options accounts.
    //

    return res
      .redirect(
        "/?deriv=connected"
      );


  } catch (error) {

    console.error(
      "PELI DERIV CALLBACK ERROR:",
      error
    );


    return res
      .status(500)
      .send(
        "Unable to complete Deriv authorization. Please try again."
      );

  }

}


// ============================================================
// SAFE JSON
// ============================================================

async function safeJson(
  response
) {

  try {

    return await response.json();

  } catch (_) {

    return {};

  }

}


// ============================================================
// COOKIE PARSER
// ============================================================

function parseCookies(
  header
) {

  const result =
    Object.create(null);


  if (
    !header ||
    typeof header !== "string"
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

    } catch (_) {

      result[name] =
        value;

    }

  }


  return result;

}
