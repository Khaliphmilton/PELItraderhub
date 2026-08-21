/*
========================================================
PELItradershub — Deriv Connection Manager
========================================================

PUBLIC MARKET DATA
------------------
Uses Deriv's public WebSocket for live ticks.

AUTHENTICATED ACCOUNT
---------------------
Uses the PELItradershub backend for OAuth/session/account
operations.

IMPORTANT
---------
- No Deriv access token is stored in this browser file.
- No Deriv secret is exposed to the browser.
- Public market data does NOT require OAuth.
- Account data/trading uses the secure backend.
========================================================
*/


/* ======================================================
   CONFIGURATION
====================================================== */

const DERIV_WS =
  "wss://ws.derivws.com/websockets/v3";

const DERIV_OAUTH_START =
  "/api/deriv/start";

const DERIV_SESSION_ENDPOINT =
  "/api/deriv/session";

const DERIV_ACCOUNT_ENDPOINT =
  "/api/deriv/account";

const DERIV_TRADE_ENDPOINT =
  "/api/deriv/trade";


/* ======================================================
   PUBLIC MARKET CONNECTION STATE
====================================================== */

let marketSocket = null;

let marketReconnectTimer = null;

let marketReconnectEnabled = false;

let marketSymbol = "R_75";

let marketTickCallback = null;

let marketStatusCallback = null;


/* ======================================================
   AUTHENTICATED ACCOUNT STATE
====================================================== */

let derivAccountConnected = false;

let derivAccountData = null;


/* ======================================================
   MARKET STATUS HELPER
====================================================== */

function marketStatus(status) {

  if (
    typeof marketStatusCallback ===
    "function"
  ) {

    marketStatusCallback(status);

  }

}


/* ======================================================
   CONNECT PUBLIC MARKET FEED
====================================================== */

function connectDeriv(
  symbol = "R_75",
  onTick,
  onStatus
) {

  /*
  Save callbacks.
  */

  marketSymbol =
    symbol || "R_75";

  marketTickCallback =
    typeof onTick === "function"
      ? onTick
      : null;

  marketStatusCallback =
    typeof onStatus === "function"
      ? onStatus
      : null;


  /*
  Enable automatic reconnect.
  */

  marketReconnectEnabled =
    true;


  /*
  Stop any previous reconnect timer.
  */

  clearTimeout(
    marketReconnectTimer
  );

  marketReconnectTimer =
    null;


  /*
  Close previous market socket.
  */

  if (marketSocket) {

    try {

      marketSocket.onclose =
        null;

      marketSocket.onerror =
        null;

      marketSocket.onmessage =
        null;

      marketSocket.close();

    } catch (error) {

      console.warn(
        "Previous Deriv market socket could not be closed:",
        error
      );

    }

    marketSocket =
      null;

  }


  /*
  Tell UI that market feed is connecting.
  */

  marketStatus(
    "Connecting..."
  );


  /*
  Create public WebSocket.
  */

  try {

    marketSocket =
      new WebSocket(
        DERIV_WS
      );

  } catch (error) {

    console.error(
      "Deriv WebSocket creation failed:",
      error
    );

    marketStatus(
      "Connection error"
    );

    scheduleMarketReconnect();

    return;

  }


  /* ====================================================
     SOCKET OPEN
  ==================================================== */

  marketSocket.onopen =
    function () {

      console.log(
        "Deriv public market feed connected:",
        marketSymbol
      );


      marketStatus(
        "Connected"
      );


      /*
      Subscribe only to the selected market.
      */

      try {

        marketSocket.send(
          JSON.stringify({

            ticks:
              marketSymbol,

            subscribe:
              1

          })
        );

      } catch (error) {

        console.error(
          "Unable to subscribe to Deriv ticks:",
          error
        );

        marketStatus(
          "Subscription error"
        );

      }

    };


  /* ====================================================
     SOCKET MESSAGE
  ==================================================== */

  marketSocket.onmessage =
    function (event) {

      try {

        const data =
          JSON.parse(
            event.data
          );


        /*
        Deriv API error.
        */

        if (data.error) {

          console.error(
            "Deriv market API error:",
            data.error
          );


          marketStatus(
            data.error.message ||
            "Deriv API error"
          );


          return;

        }


        /*
        Live tick received.
        */

        if (
          data.msg_type === "tick" &&
          data.tick
        ) {

          const tick = {

            symbol:
              data.tick.symbol,

            quote:
              Number(
                data.tick.quote
              ),

            epoch:
              data.tick.epoch

          };


          /*
          Send tick to the page.
          */

          if (
            typeof marketTickCallback ===
            "function"
          ) {

            marketTickCallback(
              tick
            );

          }

        }

      } catch (error) {

        console.error(
          "Invalid Deriv market response:",
          error
        );

      }

    };


  /* ====================================================
     SOCKET ERROR
  ==================================================== */

  marketSocket.onerror =
    function (error) {

      console.error(
        "Deriv market WebSocket error:",
        error
      );


      marketStatus(
        "Connection error"
      );

    };


  /* ====================================================
     SOCKET CLOSED
  ==================================================== */

  marketSocket.onclose =
    function () {

      console.log(
        "Deriv public market feed disconnected."
      );


      marketSocket =
        null;


      marketStatus(
        "Disconnected"
      );


      /*
      Reconnect automatically.
      */

      if (
        marketReconnectEnabled
      ) {

        scheduleMarketReconnect();

      }

    };

}


/* ======================================================
   MARKET RECONNECT
====================================================== */

function scheduleMarketReconnect() {

  clearTimeout(
    marketReconnectTimer
  );


  if (
    !marketReconnectEnabled
  ) {

    return;

  }


  marketReconnectTimer =
    setTimeout(
      function () {

        if (
          !marketReconnectEnabled
        ) {

          return;

        }


        connectDeriv(
          marketSymbol,
          marketTickCallback,
          marketStatusCallback
        );

      },
      3000
    );

}


/* ======================================================
   CHANGE PUBLIC MARKET SYMBOL
====================================================== */

function changeDerivSymbol(
  symbol
) {

  if (!symbol) {

    return;

  }


  marketSymbol =
    symbol;


  /*
  If already connected, switch subscription
  without touching OAuth/account state.
  */

  if (
    marketSocket &&
    marketSocket.readyState ===
      WebSocket.OPEN
  ) {

    try {

      /*
      Remove existing tick subscriptions.
      */

      marketSocket.send(
        JSON.stringify({

          forget_all:
            "ticks"

        })
      );


      /*
      Subscribe to new symbol.
      */

      marketSocket.send(
        JSON.stringify({

          ticks:
            marketSymbol,

          subscribe:
            1

        })
      );


      marketStatus(
        "Connected"
      );


    } catch (error) {

      console.error(
        "Unable to change Deriv market:",
        error
      );


      marketStatus(
        "Subscription error"
      );

    }


    return;

  }


  /*
  No active socket.
  */

  connectDeriv(
    marketSymbol,
    marketTickCallback,
    marketStatusCallback
  );

}


/* ======================================================
   DISCONNECT PUBLIC MARKET
====================================================== */

function disconnectDeriv() {

  marketReconnectEnabled =
    false;


  clearTimeout(
    marketReconnectTimer
  );


  marketReconnectTimer =
    null;


  if (marketSocket) {

    try {

      marketSocket.onclose =
        null;

      marketSocket.close();

    } catch (error) {

      console.warn(
        "Deriv market disconnect error:",
        error
      );

    }

  }


  marketSocket =
    null;


  marketStatus(
    "Disconnected"
  );

}


/* ======================================================
   AUTHENTICATED DERIV CONNECTION
======================================================

   This ONLY starts OAuth.

   It does NOT touch the public market WebSocket.
====================================================== */

function connectDerivAccount() {

  /*
  Redirect to backend OAuth start endpoint.
  */

  window.location.href =
    DERIV_OAUTH_START;

}


/* ======================================================
   CHECK AUTHENTICATED DERIV SESSION
====================================================== */

async function getDerivSession() {

  try {

    const response =
      await fetch(
        DERIV_SESSION_ENDPOINT,
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


    /*
    Backend did not return success.
    */

    if (!response.ok) {

      derivAccountConnected =
        false;

      derivAccountData =
        null;


      return {

        connected:
          false,

        account:
          null

      };

    }


    const data =
      await response.json();


    derivAccountConnected =
      data.connected === true;


    derivAccountData =
      data.account || null;


    return {

      connected:
        derivAccountConnected,

      account:
        derivAccountData

    };


  } catch (error) {

    console.error(
      "Deriv session check failed:",
      error
    );


    derivAccountConnected =
      false;

    derivAccountData =
      null;


    return {

      connected:
        false,

      account:
        null

    };

  }

}


/* ======================================================
   GET AUTHENTICATED ACCOUNT
====================================================== */

async function getDerivAccount() {

  try {

    const response =
      await fetch(
        DERIV_ACCOUNT_ENDPOINT,
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


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        data.error ||
        "Unable to load Deriv account."
      );

    }


    derivAccountData =
      data;


    return data;


  } catch (error) {

    console.error(
      "Deriv account request failed:",
      error
    );


    throw error;

  }

}


/* ======================================================
   EXECUTE AUTHENTICATED TRADE
====================================================== */

async function executeDerivTrade(
  trade
) {

  /*
  Make sure the browser believes an account
  session exists before sending a trade.
  */

  const session =
    await getDerivSession();


  if (
    !session ||
    !session.connected
  ) {

    throw new Error(
      "Deriv account is not connected."
    );

  }


  try {

    const response =
      await fetch(
        DERIV_TRADE_ENDPOINT,
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


/* ======================================================
   GET MARKET CONNECTION STATE
====================================================== */

function isDerivMarketConnected() {

  return (
    marketSocket &&
    marketSocket.readyState ===
      WebSocket.OPEN
  );

}


/* ======================================================
   GET ACCOUNT CONNECTION STATE
====================================================== */

function isDerivAccountConnected() {

  return (
    derivAccountConnected === true
  );

}


/* ======================================================
   GLOBAL PELI DERIV API
====================================================== */

window.PELI_DERIV = {

  /*
  PUBLIC MARKET
  */

  connect:
    connectDeriv,

  disconnect:
    disconnectDeriv,

  changeSymbol:
    changeDerivSymbol,

  isMarketConnected:
    isDerivMarketConnected,


  /*
  AUTHENTICATED ACCOUNT
  */

  connectAccount:
    connectDerivAccount,

  getSession:
    getDerivSession,

  getAccount:
    getDerivAccount,

  isAccountConnected:
    isDerivAccountConnected,

  executeTrade:
    executeDerivTrade

};


/* ======================================================
   END
====================================================== */
