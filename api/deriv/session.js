// api/deriv/session.js

export default async function handler(req, res) {

  try {

    /*
    The callback will store the Deriv access token
    in this secure HttpOnly cookie.

    The browser cannot read the token directly.
    */

    const cookies =
      parseCookies(
        req.headers.cookie || ""
      );

    const accessToken =
      cookies.deriv_access_token;


    /*
    No Deriv session.
    */

    if (!accessToken) {

      return res.status(200).json({

        connected:
          false,

        account:
          null

      });

    }


    /*
    Ask Deriv who the authenticated user is.
    */

    const response =
      await fetch(
        "https://api.derivws.com/trading/v1/options/accounts",
        {

          method:
            "GET",

          headers: {

            "Authorization":
              `Bearer ${accessToken}`,

            "Deriv-App-ID":
              "34aZNrTmY1AZc7hjuxyLv",

            "Accept":
              "application/json"

          }

        }
      );


    const data =
      await response.json();


    /*
    Token expired / invalid.
    */

    if (!response.ok) {

      console.error(
        "Deriv session validation failed:",
        data
      );


      return res.status(200).json({

        connected:
          false,

        account:
          null

      });

    }


    /*
    Successful authenticated session.
    */

    return res.status(200).json({

      connected:
        true,

      account:
        data

    });

  } catch (error) {

    console.error(
      "Deriv session error:",
      error
    );


    return res.status(500).json({

      connected:
        false,

      account:
        null,

      error:
        "Unable to check Deriv session."

    });

  }

}


/* ======================================================
   COOKIE PARSER
====================================================== */

function parseCookies(
  cookieHeader
) {

  const cookies = {};


  cookieHeader
    .split(";")
    .forEach(
      function(cookie) {

        const separator =
          cookie.indexOf("=");


        if (
          separator === -1
        ) {

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
