/*
========================================================
PELItradershub — Deriv Connection Manager
========================================================

Browser-side Deriv integration.

IMPORTANT:
- No Deriv secret/API token is stored here.
- OAuth is handled by the secure backend.
- Public market data uses the Deriv WebSocket.
- Account/trading requests must go through the backend.
========================================================
*/

const DERIV_WS =
  "wss://ws.derivws.com/websockets/v3";

let derivSocket = null;
let derivReconnectTimer = null;

let currentSymbol = "R_75";
let currentTickCallback = null;
let currentStatusCallback = null;


/*
========================================================
STATUS HELPER
========================================================
*/

function setStatus(status) {

  if (typeof currentStatusCallback === "function") {
    currentStatusCallback(status);
  }

}


/*
========================================================
CONNECT TO PUBLIC DERIV MARKET DATA
========================================================
*/

function connectDeriv(
  symbol = "R_75",
  onTick,
  onStatus
) {

  currentSymbol = symbol;
  currentTickCallback = onTick;
  currentStatusCallback = onStatus;


  /*
  Close existing socket.
  */

  if (derivSocket) {

    try {
      derivSocket.close();
    } catch (error) {
      console.warn(
        "Unable to close previous Deriv connection:",
        error
      );
    }

    derivSocket = null;
  }


  clearTimeout(
    derivReconnectTimer
  );


  setStatus(
    "Connecting..."
  );


  /*
  Open Deriv WebSocket.
  */

  try {

    derivSocket =
      new WebSocket(
        DERIV_WS
      );

  } catch (error) {

    console.error(
      "Unable to create Deriv WebSocket:",
      error
    );

    setStatus(
      "Connection error"
    );

    return;
  }


  /*
  Connection opened.
  */

  derivSocket.onopen = function () {

    console.log(
      "Deriv market WebSocket connected."
    );


    setStatus(
      "Connected"
    );


    /*
    Subscribe to live ticks.
    */

    derivSocket.send(
      JSON.stringify({

        ticks:
          currentSymbol,

        subscribe:
          1

      })
    );

  };


  /*
  Incoming messages.
  */

  derivSocket.onmessage =
    function (event) {

      try {

        const data =
          JSON.parse(
            event.data
          );


        /*
        Live tick.
        */

        if (
          data.msg_type === "tick" &&
          data.tick
        ) {

          if (
            typeof currentTickCallback ===
            "function"
          ) {

            currentTickCallback({

              symbol:
                data.tick.symbol,

              quote:
                Number(
                  data.tick.quote
                ),

              epoch:
                data.tick.epoch

            });

          }

        }


        /*
        API error.
        */

        if (data.error) {

          console.error(
            "Deriv API error:",
            data.error
          );


          setStatus(
            data.error.message ||
            "Deriv API error"
          );

        }

      } catch (error) {

        console.error(
          "Invalid Deriv WebSocket response:",
          error
        );

      }

    };


  /*
  WebSocket error.
  */

  derivSocket.onerror =
    function (error) {

      console.error(
        "Deriv WebSocket error:",
        error
      );


      setStatus(
        "Connection error"
      );

    };


  /*
  WebSocket closed.
  */

  derivSocket.onclose =
    function () {

      console.log(
        "Deriv market WebSocket disconnected."
      );


      setStatus(
        "Disconnected"
      );


      /*
      Automatically reconnect unless
      the connection was intentionally stopped.
      */

      clearTimeout(
        derivReconnectTimer
      );


      derivReconnectTimer =
        setTimeout(
          function () {

            if (
              currentTickCallback ||
              currentStatusCallback
            ) {

              connectDeriv(
                currentSymbol,
                currentTickCallback,
                currentStatusCallback
              );

            }

          },
          3000
        );

    };

}


/*
========================================================
CHANGE MARKET SUBSCRIPTION
========================================================
*/

function changeDerivSymbol(
  symbol
) {

  if (!symbol) {
    return;
  }


  currentSymbol =
    symbol;


  /*
  If socket is connected,
  subscribe to the new symbol.
  */

  if (
    derivSocket &&
    derivSocket.readyState ===
      WebSocket.OPEN
  ) {

    try {

      derivSocket.send(
        JSON.stringify({

          forget_all:
            "ticks"

        })
      );


      derivSocket.send(
        JSON.stringify({

          ticks:
            symbol,

          subscribe:
            1

        })
      );


      setStatus(
        "Connected"
      );

    } catch (error) {

      console.error(
        "Unable to change Deriv symbol:",
        error
      );

    }

    return;
  }


  /*
  Otherwise establish a new connection.
  */

  connectDeriv(
    symbol,
    currentTickCallback,
    currentStatusCallback
  );

}


/*
========================================================
DISCONNECT
========================================================
*/

function disconnectDeriv() {

  clearTimeout(
    derivReconnectTimer
  );


  derivReconnectTimer =
    null;


  if (derivSocket) {

    try {

      derivSocket.close();

    } catch (error) {

      console.warn(
        "Deriv disconnect error:",
        error
      );

    }

    derivSocket =
      null;

  }


  currentTickCallback =
    null;

  currentStatusCallback =
    null;

}


/*
========================================================
START DERIV OAUTH
========================================================

The browser does NOT receive or store the Deriv
authorization credentials.

Instead, it starts the secure backend OAuth flow.
========================================================
*/

function connectDerivAccount() {

  window.location.href =
    "/api/deriv/start";

}


/*
========================================================
CHECK AUTHENTICATED DERIV SESSION
========================================================

This endpoint must be implemented by the backend.

Expected response:

{
  "connected": true
}

or:

{
  "connected": false
}
========================================================
*/

async function getDerivSession() {

  try {

    const response =
      await fetch(
        "/api/deriv/session",
        {
          method:
            "GET",

          credentials:
            "include",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );


    if (!response.ok) {

      return {
        connected:
          false
      };

    }


    const data =
      await response.json();


    return {

      connected:
        data.connected === true,

      account:
        data.account || null

    };

  } catch (error) {

    console.error(
      "Deriv session check failed:",
      error
    );


    return {

      connected:
        false,

      account:
        null

    };

  }

}


/*
========================================================
GET AUTHENTICATED ACCOUNT INFORMATION
========================================================

All private account requests should go through the
secure backend.

No Deriv token is exposed to this browser code.
========================================================
*/

async function getDerivAccount() {

  try {

    const response =
      await fetch(
        "/api/deriv/account",
        {
          method:
            "GET",

          credentials:
            "include",

          headers: {
            "Accept":
              "application/json"
          }
        }
      );


    if (!response.ok) {

      throw new Error(
        "Unable to load Deriv account."
      );

    }


    return await response.json();

  } catch (error) {

    console.error(
      "Deriv account request failed:",
      error
    );


    throw error;

  }

}


/*
========================================================
EXECUTE TRADE THROUGH SECURE BACKEND
========================================================

The actual trade request is deliberately sent to
our backend rather than exposing a Deriv token in
the browser.

The backend must validate the authenticated user,
account, symbol, stake and contract before sending
anything to Deriv.
========================================================
*/

async function executeDerivTrade(
  trade
) {

  try {

    const response =
      await fetch(
        "/api/deriv/trade",
        {
          method:
            "POST",

          credentials:
            "include",

          headers: {
            "Content-Type":
              "application/json",

            "Accept":
              "application/json"
          },

          body:
            JSON.stringify(
              trade
            )

        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        data.error ||
        "Trade request failed."
      );

    }


    return data;

  } catch (error) {

    console.error(
      "Deriv trade request failed:",
      error
    );


    throw error;

  }

}


/*
========================================================
GLOBAL PELI DERIV API
========================================================
*/

window.PELI_DERIV = {

  connect:
    connectDeriv,

  disconnect:
    disconnectDeriv,

  changeSymbol:
    changeDerivSymbol,

  connectAccount:
    connectDerivAccount,

  getSession:
    getDerivSession,

  getAccount:
    getDerivAccount,

  executeTrade:
    executeDerivTrade

};
