// api/deriv/callback.js

const CLIENT_ID = "34aZNrTmY1AZc7hjuxyLv";

const REDIRECT_URI =
  "https://pelitradershub.vercel.app/api/deriv/callback";

export default async function handler(req, res) {
  try {


    // --------------------------------------------------
    // 2. Read OAuth response
    // --------------------------------------------------

    const {
      code,
      state,
      error,
      error_description
    } = req.query;

    // User cancelled or Deriv returned an OAuth error
    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Deriv Connection Cancelled</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #080c13;
              color: white;
              font-family: Arial, sans-serif;
            }

            .card {
              max-width: 450px;
              padding: 30px;
              border-radius: 18px;
              border: 1px solid #202838;
              background: #0d121c;
              text-align: center;
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
            <h1>Deriv connection cancelled</h1>

            <p>
              ${
                escapeHtml(
                  error_description ||
                  "The Deriv authorization was cancelled."
                )
              }
            </p>

            <a href="/deriv-connect.html">
              Try Again
            </a>
          </div>
        </body>
        </html>
      `);
    }

    // --------------------------------------------------
    // 3. Require authorization code
    // --------------------------------------------------

    if (!code) {
      return res.status(400).send(`
        <h1>Deriv OAuth Error</h1>
        <p>No authorization code was received.</p>
      `);
    }

    // --------------------------------------------------
    // 4. Read secure OAuth cookies
    //
    // These must be created by /api/deriv/start.
    // --------------------------------------------------

    const cookies = parseCookies(
      req.headers.cookie || ""
    );

    const savedState =
      cookies.deriv_oauth_state;

    const codeVerifier =
      cookies.deriv_code_verifier;

    // --------------------------------------------------
    // 5. Make sure PKCE information exists
    // --------------------------------------------------

    if (!savedState || !codeVerifier) {

      console.error(
        "Missing OAuth state or PKCE verifier."
      );

      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Connection Error</title>
        </head>

        <body style="
          background:#080c13;
          color:white;
          font-family:Arial,sans-serif;
          text-align:center;
          padding:60px 20px;
        ">

          <h1>Connection could not be completed</h1>

          <p>
            The secure OAuth session has expired or is missing.
          </p>

          <p>
            Please start the Deriv connection again.
          </p>

          <a
            href="/deriv-connect.html"
            style="
              display:inline-block;
              margin-top:20px;
              padding:12px 20px;
              background:#786cff;
              color:white;
              text-decoration:none;
              border-radius:9px;
              font-weight:bold;
            "
          >
            Connect Deriv
          </a>

        </body>
        </html>
      `);
    }

    // --------------------------------------------------
    // 6. Verify OAuth state
    // --------------------------------------------------

    if (!state || state !== savedState) {

      console.error(
        "OAuth state mismatch."
      );

      return res.status(403).send(`
        <h1>Security verification failed</h1>
        <p>The OAuth state could not be verified.</p>
      `);
    }

    // --------------------------------------------------
    // 7. Exchange authorization code for token
    //
    // IMPORTANT:
    // This happens on the server.
    // --------------------------------------------------

    const tokenResponse =
      await fetch(
        "https://auth.deriv.com/oauth2/token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
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
    // 8. Check token exchange result
    // --------------------------------------------------

    if (!tokenResponse.ok || !tokenData.access_token) {

      console.error(
        "Deriv token exchange failed:",
        tokenData
      );

      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Deriv Connection Failed</title>
        </head>

        <body style="
          background:#080c13;
          color:white;
          font-family:Arial,sans-serif;
          text-align:center;
          padding:60px 20px;
        ">

          <h1>Deriv connection failed</h1>

          <p>
            We could not complete the secure connection.
          </p>

          <a
            href="/deriv-connect.html"
            style="
              display:inline-block;
              margin-top:20px;
              padding:12px 20px;
              background:#786cff;
              color:white;
              text-decoration:none;
              border-radius:9px;
              font-weight:bold;
            "
          >
            Try Again
          </a>

        </body>
        </html>
      `);
    }

    // --------------------------------------------------
    // 9. We received the Deriv access token.
    //
    // DO NOT send the token to the browser.
    // DO NOT put it in the URL.
    // DO NOT log it.
    //
    // The next stage will securely associate it
    // with the logged-in PELItradershub user.
    // --------------------------------------------------

    const accessToken =
      tokenData.access_token;

    const expiresIn =
      tokenData.expires_in || 3600;

    // --------------------------------------------------
    // TEMPORARY DEVELOPMENT STORAGE
    //
    // IMPORTANT:
    // This is intentionally NOT storing the token yet.
    //
    // The next backend step will connect this OAuth
    // result to the authenticated Supabase user and
    // securely persist the Deriv credentials.
    // --------------------------------------------------

    console.log(
      "Deriv OAuth completed successfully."
    );

    // Prevent unused-variable warnings without
    // exposing the token.
    void accessToken;
    void expiresIn;

    // --------------------------------------------------
    // 10. Clear temporary OAuth cookies
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
    // 11. Continue to connection-success page
    // --------------------------------------------------

    return res.redirect(
      302,
      "/dashboard.html?deriv=connected"
    );

  } catch (error) {

    console.error(
      "Deriv OAuth callback error:",
      error
    );

    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Connection Error</title>
      </head>

      <body style="
        background:#080c13;
        color:white;
        font-family:Arial,sans-serif;
        text-align:center;
        padding:60px 20px;
      ">

        <h1>Something went wrong</h1>

        <p>
          We could not complete the Deriv connection.
        </p>

        <a
          href="/deriv-connect.html"
          style="
            display:inline-block;
            margin-top:20px;
            padding:12px 20px;
            background:#786cff;
            color:white;
            text-decoration:none;
            border-radius:9px;
            font-weight:bold;
          "
        >
          Try Again
        </a>

      </body>
      </html>
    `);
  }
}


// ==================================================
// COOKIE PARSER
// ==================================================

function parseCookies(cookieHeader) {

  const cookies = {};

  cookieHeader
    .split(";")
    .forEach(cookie => {

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


// ==================================================
// CLEAR COOKIE
// ==================================================

function clearCookie(name) {

  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}


// ==================================================
// HTML ESCAPING
// ==================================================

function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
