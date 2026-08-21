// api/deriv/start.js

const CLIENT_ID = "34aZNrTmY1AZc7hjuxyLv";

const REDIRECT_URI =
  "https://pelitradershub.vercel.app/api/deriv/callback";

export default async function handler(req, res) {
  try {
    // Generate PKCE verifier
    const verifierBytes = new Uint8Array(32);
    crypto.getRandomValues(verifierBytes);

    const codeVerifier = Array.from(verifierBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    // Generate SHA-256 challenge
    const data = new TextEncoder().encode(codeVerifier);

    const digest = await crypto.subtle.digest(
      "SHA-256",
      data
    );

    const codeChallenge = base64UrlEncode(
      new Uint8Array(digest)
    );

    // Generate OAuth state
    const stateBytes = new Uint8Array(32);

    crypto.getRandomValues(stateBytes);

    const state = Array.from(stateBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    // Store PKCE values in secure HTTP-only cookies
    res.setHeader("Set-Cookie", [
      `deriv_code_verifier=${encodeURIComponent(
        codeVerifier
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,

      `deriv_oauth_state=${encodeURIComponent(
        state
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    ]);

    // Build Deriv OAuth URL
    const authUrl = new URL(
      "https://auth.deriv.com/oauth2/auth"
    );

    authUrl.searchParams.set(
      "response_type",
      "code"
    );

    authUrl.searchParams.set(
      "client_id",
      CLIENT_ID
    );

    authUrl.searchParams.set(
      "redirect_uri",
      REDIRECT_URI
    );

    authUrl.searchParams.set(
      "scope",
      "trade"
    );

    authUrl.searchParams.set(
      "state",
      state
    );

    authUrl.searchParams.set(
      "code_challenge",
      codeChallenge
    );

    authUrl.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    console.log(
      "Starting Deriv OAuth:",
      authUrl.origin + authUrl.pathname
    );

    return res.redirect(
      302,
      authUrl.toString()
    );

  } catch (error) {
    console.error(
      "Deriv OAuth start error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to start Deriv connection."
    });
  }
}


// Convert bytes to Base64URL
function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
