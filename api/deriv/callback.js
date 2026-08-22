// api/deriv/callback.js

const CLIENT_ID = "34aZNrTmY1AZc7hjuxyLv";

const REDIRECT_URI =
  "https://pelitradershub.vercel.app/api/deriv/callback";

export default async function handler(req, res) {
  try {
    const {
      code,
      state,
      error,
      error_description
    } = req.query;

    // --------------------------------------------------
    // DERIV RETURNED AN ERROR
    // --------------------------------------------------

    if (error) {
      return res.status(400).send(
        page(
          "Deriv Connection Cancelled",
          escapeHtml(
            error_description ||
            "The Deriv authorization was cancelled."
          ),
          "Try Again"
        )
      );
    }

    // --------------------------------------------------
    // AUTHORIZATION CODE REQUIRED
    // --------------------------------------------------

    if (!code) {
      return res.status(400).send(
        page(
          "Deriv OAuth Error",
          "No authorization code was received from Deriv.",
          "Try Again"
        )
      );
    }

    // --------------------------------------------------
    // READ PKCE COOKIES
    // --------------------------------------------------

    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );

    const savedState =
      cookies.deriv_oauth_state;

    const codeVerifier =
      cookies.deriv_code_verifier;

    if (!savedState || !codeVerifier) {
      console.error(
        "Missing OAuth state or PKCE verifier."
      );

      return res.status(400).send(
        page(
          "Connection Could Not Be Completed",
          "The secure OAuth session is missing or expired. Start the Deriv connection again.",
          "Connect Deriv"
        )
      );
    }

    // --------------------------------------------------
    // VERIFY STATE
    // --------------------------------------------------

    if (!state || state !== savedState) {
      console.error(
        "OAuth state mismatch."
      );

      return res.status(403).send(
        page(
          "Security Verification Failed",
          "The OAuth security check failed. Please start the connection again.",
          "Try Again"
        )
      );
    }

    // --------------------------------------------------
    // EXCHANGE CODE FOR ACCESS TOKEN
    // --------------------------------------------------

    const tokenResponse =
      await fetch(
        "https://auth.deriv.com/oauth2/token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            "Accept":
              "application/json"
          },

          body:
            new URLSearchParams({
              grant_type:
                "authorization_code",

              client_id:
                CLIENT_ID,

              code:
                code,

              code_verifier:
                codeVerifier,

              redirect_uri:
                REDIRECT_URI

            }).toString()
        }
      );

    const tokenData =
      await tokenResponse.json();

    // --------------------------------------------------
    // TOKEN EXCHANGE FAILED
    // --------------------------------------------------

    if (
      !tokenResponse.ok ||
      !tokenData.access_token
    ) {

      console.error(
        "Deriv token exchange failed:",
        {
          status:
            tokenResponse.status,

          error:
            tokenData.error,

          message:
            tokenData.message
        }
      );

      return res.status(400).send(
        page(
          "Deriv Connection Failed",
          "Deriv authorization was not completed successfully. Please try again.",
          "Try Again"
        )
      );
    }

// --------------------------------------------------
// SUCCESS
// Store the Deriv access token in a secure,
// HttpOnly cookie so the browser never gets
// direct access to the token.
// --------------------------------------------------

const accessToken =
  tokenData.access_token;

const expiresIn =
  Number(tokenData.expires_in || 3600);

console.log(
  "Deriv OAuth authorization succeeded."
);

// Keep the token away from JavaScript.
// The backend will use this cookie when
// requesting the authenticated Deriv session.

const derivCookie =
  `deriv_access_token=${encodeURIComponent(accessToken)}; ` +
  `Path=/; ` +
  `HttpOnly; ` +
  `Secure; ` +
  `SameSite=Lax; ` +
  `Max-Age=${expiresIn}`;
    // --------------------------------------------------
    // CLEAR TEMPORARY OAUTH COOKIES
    // --------------------------------------------------

    res.setHeader(
      "Set-Cookie",
      [
        clearCookie(
          "deriv_oauth_state"
        ),

        clearCookie(
          "deriv_code_verifier"
        )
      ]
    );

    // --------------------------------------------------
    // SUCCESS PAGE
    // --------------------------------------------------

    return res.status(200).send(`
      <!DOCTYPE html>

      <html lang="en">

      <head>

        <meta charset="UTF-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        >

        <title>Deriv Connected</title>

        <style>

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #080c13;
            color: white;
            font-family: Arial, sans-serif;
            padding: 20px;
          }

          .card {
            width: 100%;
            max-width: 460px;
            padding: 35px;
            border-radius: 18px;
            border: 1px solid #202838;
            background: #0d121c;
            text-align: center;
          }

          .icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            background: #12352f;
            color: #39d4b6;
            font-size: 30px;
            font-weight: bold;
          }

          h1 {
            margin: 0 0 10px;
            font-size: 26px;
          }

          p {
            color: #8a94a8;
            line-height: 1.6;
          }

          .note {
            margin-top: 20px;
            padding: 14px;
            border-radius: 10px;
            background: #111722;
            border: 1px solid #252e40;
            color: #a8b1c2;
            font-size: 13px;
          }

          a {
            display: inline-block;
            margin-top: 22px;
            padding: 13px 20px;
            border-radius: 9px;
            background: #786cff;
            color: white;
            text-decoration: none;
            font-weight: bold;
          }

        </style>

      </head>

      <body>

        <div class="card">

          <div class="icon">
            ✓
          </div>

          <h1>
            Deriv Connected
          </h1>

          <p>
            Your Deriv authorization was completed successfully.
          </p>

          <div class="note">
            Your authorization was received securely.
            Trading will remain disabled until the
            authenticated Deriv account is securely
            associated with your PELItradershub account.
          </div>

          <a href="/dashboard.html?deriv=connected">
            Return to Dashboard
          </a>

        </div>

      </body>

      </html>
    `);

  } catch (error) {

    console.error(
      "Deriv OAuth callback error:",
      error
    );

    return res.status(500).send(
      page(
        "Connection Error",
        "We could not complete the Deriv connection. Please try again.",
        "Try Again"
      )
    );
  }
}


// ==================================================
// SIMPLE RESULT PAGE
// ==================================================

function page(
  title,
  message,
  button
) {

  return `
    <!DOCTYPE html>

    <html lang="en">

    <head>

      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
      >

      <title>${escapeHtml(title)}</title>

      <style>

        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #080c13;
          color: white;
          font-family: Arial, sans-serif;
          padding: 20px;
        }

        .card {
          width: 100%;
          max-width: 450px;
          padding: 30px;
          border-radius: 18px;
          border: 1px solid #202838;
          background: #0d121c;
          text-align: center;
        }

        p {
          color: #8a94a8;
          line-height: 1.6;
        }

        a {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 18px;
          border-radius: 9px;
          background: #786cff;
          color: white;
          text-decoration: none;
          font-weight: bold;
        }

      </style>

    </head>

    <body>

      <div class="card">

        <h1>
          ${escapeHtml(title)}
        </h1>

        <p>
          ${escapeHtml(message)}
        </p>

        <a href="/deriv-connect.html">
          ${escapeHtml(button)}
        </a>

      </div>

    </body>

    </html>
  `;
}


// ==================================================
// COOKIE PARSER
// ==================================================

function parseCookies(
  cookieHeader
) {

  const cookies = {};

  cookieHeader
    .split(";")
    .forEach(
      (cookie) => {

        const separator =
          cookie.indexOf("=");

        if (separator === -1) {
          return;
        }

        const name =
          cookie
            .slice(
              0,
              separator
            )
            .trim();

        const value =
          cookie
            .slice(
              separator + 1
            )
            .trim();

        if (name) {
          cookies[name] =
            decodeURIComponent(
              value
            );
        }

      }
    );

  return cookies;
}


// ==================================================
// CLEAR COOKIE
// ==================================================

function clearCookie(
  name
) {

  return (
    `${name}=; ` +
    `Path=/; ` +
    `HttpOnly; ` +
    `Secure; ` +
    `SameSite=Lax; ` +
    `Max-Age=0`
  );
}


// ==================================================
// HTML ESCAPING
// ==================================================

function escapeHtml(
  value
) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}
