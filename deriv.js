/*
========================================================
PELItradershub — Deriv Connection Manager
========================================================

- Public Deriv market data through WebSocket
- Deriv OAuth through secure backend
- Account data through secure backend
- Trading through secure backend
- No Deriv token is exposed to the browser
========================================================
*/


/* ======================================================
   PUBLIC MARKET WEBSOCKET
====================================================== */

const DERIV_WS =
  "wss://ws.derivws.com/websockets/v3";


let derivSocket = null;
let derivReconnectTimer = null;

let currentSymbol = "R_75";

let currentTickCallback = null;
let currentStatusCallback = null;

let intentionalDisconnect = false;


/* ======================================================
   STATUS
====================================================== */

function setDerivStatus(status) {

  if (
    typeof currentStatusCallback === "function"
  ) {

    currentStatusCallback(status);

  }

}


/* ======================================================
   CONNECT PUBLIC MARKET
====================================================== */

function connectDeriv(
  symbol = "R_75",
  onTick,
  onStatus
) {

  currentSymbol = symbol;

  currentTickCallback = onTick;

  currentStatusCallback = onStatus;

  intentionalDisconnect = false;


  clearTimeout(
    derivReconnectTimer
  );


  /*
  Close old connection.
  */

  if (derivSocket) {

    try {

      derivSocket.onclose = null;

      derivSocket.close();

    } catch (error) {

      console.warn(
        "Previous Deriv socket could not be closed:",
        error
      );

    }

    derivSocket = null;

  }


  setDerivStatus(
    "Connecting..."
  );


  /*
  Create WebSocket.
  */

  try {

    derivSocket =
      new WebSocket(
        DERIV_WS
      );

  } catch (error) {

    console.error(
      "Deriv WebSocket creation failed:",
      error
    );

    setDerivStatus(
      "Connection error"
    );

    return;

  }


  /* ====================================================
     OPEN
  ==================================================== */

  derivSocket.onopen =
    function () {

      console.log(
        "Deriv market WebSocket connected."
      );


      setDerivStatus(
        "Connected"
      );


      /*
      Subscribe to the selected market.
      */

      const request = {

        ticks:
          currentSymbol,

        subscribe:
          1,

        req_id:
          1

      };


      console.log(
        "Deriv tick subscription:",
        request
      );


      derivSocket.send(
        JSON.stringify(
          request
        )
      );

    };


  /* ====================================================
     MESSAGE
  ==================================================== */

  derivSocket.onmessage =
    function (event) {

      try {

        const data =
          JSON.parse(
            event.data
          );


        console.log(
          "Deriv:",
          data
        );


        /*
        API error.
        */

        if (data.error) {

          console.error(
            "Deriv API error:",
            data.error
          );


          setDerivStatus(
            data.error.message ||
            "Deriv API error"
          );


          return;

        }


        /*
        Live tick.
        */

        if (
          data.msg_type === "tick" &&
          data.tick
        ) {

          const quote =
            Number(
              data.tick.quote
            );


          if (
            typeof currentTickCallback ===
            "function"
          ) {

            currentTickCallback({

              symbol:
                data.tick.symbol,

              quote:
                quote,

              epoch:
                data.tick.epoch

            });

          }

        }

      } catch (error) {

        console.error(
          "Invalid Deriv WebSocket message:",
          error
        );

      }

    };


  /* ====================================================
     ERROR
  ==================================================== */

  derivSocket.onerror =
    function (error) {

      console.error(
        "Deriv WebSocket error:",
        error
      );


      setDerivStatus(
        "Connection error"
      );

    };


  /* ====================================================
     CLOSE
  ==================================================== */

  derivSocket.onclose =
    function (event) {

      console.log(
        "Deriv WebSocket closed:",
        event.code,
        event.reason
      );


      if (
        intentionalDisconnect
      ) {

        setDerivStatus(
          "Disconnected"
        );

        return;

      }


      setDerivStatus(
        "Disconnected"
      );


      /*
      Automatically reconnect.
      */

      clearTimeout(
        derivReconnectTimer
      );


      derivReconnectTimer =
        setTimeout(
          function () {

            if (
              !intentionalDisconnect
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


/* ======================================================
   CHANGE MARKET
====================================================== */

function changeDerivSymbol(
  symbol
) {

  if (!symbol) {
    return;
  }


  currentSymbol =
    symbol;


  /*
  Existing connection.
  */

  if (
    derivSocket &&
    derivSocket.readyState ===
      WebSocket.OPEN
  ) {

    try {

      /*
      Remove existing tick subscriptions.
      */

      derivSocket.send(
        JSON.stringify({

          forget_all:
            "ticks"

        })
      );


      /*
      Subscribe to new market.
      */

      derivSocket.send(
        JSON.stringify({

          ticks:
            symbol,

          subscribe:
            1,

          req_id:
            1

        })
      );


      setDerivStatus(
        "Connected"
      );

    } catch (error) {

      console.error(
        "Unable to change Deriv market:",
        error
      );

    }


    return;

  }


  /*
  No active connection.
  */

  connectDeriv(

    symbol,

    currentTickCallback,

    currentStatusCallback

  );

}


/* ======================================================
   DISCONNECT MARKET
====================================================== */

function disconnectDeriv() {

  intentionalDisconnect =
    true;


  clearTimeout(
    derivReconnectTimer
  );


  derivReconnectTimer =
    null;


  if (derivSocket) {

    try {

      derivSocket.onclose =
        null;

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


/* ======================================================
   DERIV ACCOUNT OAUTH
====================================================== */

function connectDerivAccount() {

  window.location.href =
    "/api/deriv/start";

}


/* ======================================================
   DERIV SESSION
====================================================== */

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
          false,

        account:
          null

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


/* ======================================================
   DERIV ACCOUNT
====================================================== */

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


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(

        data.message ||
        data.error ||
        "Unable to load Deriv account."

      );

    }


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
   DERIV TRADE
====================================================== */

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


/* ======================================================
   GLOBAL PELI DERIV API
====================================================== */

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
