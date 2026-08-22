/*
 * PELI Trader Hub
 * Deriv market-data + trading client
 *
 * Public ticks:
 *   wss://api.derivws.com/trading/v1/options/ws/public
 *
 * Authenticated trading:
 *   The backend must provide an authenticated WebSocket URL.
 */

(function () {
  "use strict";

  const PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  let ws = null;
  let authenticatedWs = null;

  let currentSymbol = "1HZ100V";
  let tickSubscription = null;

  let requestId = 1;

  const listeners = {
    tick: [],
    status: [],
    error: [],
    proposal: [],
    buy: [],
    contract: [],
    balance: []
  };

  function emit(type, data) {
    if (!listeners[type]) return;

    listeners[type].forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `PELI_DERIV ${type} listener error:`,
          error
        );
      }
    });
  }

  function on(type, callback) {
    if (!listeners[type]) {
      listeners[type] = [];
    }

    listeners[type].push(callback);

    return function unsubscribe() {
      listeners[type] =
        listeners[type].filter(
          (item) => item !== callback
        );
    };
  }

  function nextRequestId() {
    return requestId++;
  }

  /*
   * PUBLIC MARKET DATA
   */

  function connect(symbol = currentSymbol) {
    currentSymbol = symbol;

    disconnect();

    emit("status", {
      connected: false,
      connecting: true
    });

    ws = new WebSocket(PUBLIC_WS);

    ws.onopen = function () {
      emit("status", {
        connected: true,
        connecting: false,
        authenticated: false
      });

      subscribeTicks(currentSymbol);
    };

    ws.onmessage = function (event) {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch (error) {
        emit("error", {
          message: "Invalid Deriv response."
        });
        return;
      }

      if (data.error) {
        emit("error", data.error);
        return;
      }

      if (data.msg_type === "tick") {
        handleTick(data);
      }
    };

    ws.onerror = function () {
      emit("error", {
        message: "Deriv market connection error."
      });
    };

    ws.onclose = function () {
      emit("status", {
        connected: false,
        connecting: false,
        authenticated: false
      });
    };
  }

  function subscribeTicks(symbol) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    if (tickSubscription) {
      try {
        ws.send(
          JSON.stringify({
            forget: tickSubscription
          })
        );
      } catch (error) {
        console.warn(
          "Unable to remove old tick subscription."
        );
      }
    }

    currentSymbol = symbol;

    ws.send(
      JSON.stringify({
        ticks: symbol,
        subscribe: 1,
        req_id: nextRequestId()
      })
    );
  }

  function handleTick(data) {
    if (!data.tick) return;

    const tick = data.tick;

    tickSubscription =
      data.subscription?.id ||
      tickSubscription;

    const quote = Number(tick.quote);

    const formatted = {
      symbol: tick.symbol,
      quote: quote,
      epoch: tick.epoch,
      id: tick.id,
      pipSize: tick.pip_size ?? null,
      lastDigit: getLastDigit(
        quote,
        tick.pip_size
      )
    };

    emit("tick", formatted);
  }

  function getLastDigit(
    quote,
    pipSize
  ) {
    if (!Number.isFinite(quote)) {
      return null;
    }

    if (
      Number.isInteger(pipSize) &&
      pipSize >= 0
    ) {
      const fixed =
        quote.toFixed(pipSize);

      return Number(
        fixed.charAt(fixed.length - 1)
      );
    }

    const text = String(quote);

    const digits =
      text.replace(/\D/g, "");

    return digits.length
      ? Number(digits.charAt(digits.length - 1))
      : null;
  }

  function changeSymbol(symbol) {
    currentSymbol = symbol;

    if (
      ws &&
      ws.readyState === WebSocket.OPEN
    ) {
      subscribeTicks(symbol);
    } else {
      connect(symbol);
    }
  }

  function disconnect() {
    if (ws) {
      try {
        ws.close();
      } catch (_) {}

      ws = null;
    }

    tickSubscription = null;
  }

  /*
   * AUTHENTICATED TRADING
   *
   * The backend should return an authenticated
   * Deriv WebSocket URL obtained through the
   * current OTP/session flow.
   */

  async function connectAuthenticated() {
    try {
      const response =
        await fetch(
          "/api/deriv/session",
          {
            method: "GET",
            credentials: "include",
            headers: {
              Accept:
                "application/json"
            }
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
          "Unable to authenticate with Deriv."
        );
      }

      if (!data.ws_url) {
        throw new Error(
          "Authenticated Deriv WebSocket URL was not provided."
        );
      }

      await openAuthenticatedSocket(
        data.ws_url
      );

      return {
        connected: true
      };

    } catch (error) {
      emit("error", {
        message: error.message
      });

      throw error;
    }
  }

  function openAuthenticatedSocket(
    url
  ) {
    return new Promise(
      (resolve, reject) => {
        if (authenticatedWs) {
          try {
            authenticatedWs.close();
          } catch (_) {}
        }

        authenticatedWs =
          new WebSocket(url);

        let settled = false;

        authenticatedWs.onopen =
          function () {
            emit("status", {
              connected: true,
              authenticated: true
            });

            if (!settled) {
              settled = true;
              resolve();
            }
          };

        authenticatedWs.onmessage =
          function (event) {
            let data;

            try {
              data = JSON.parse(
                event.data
              );
            } catch (_) {
              return;
            }

            handleAuthenticatedMessage(
              data
            );
          };

        authenticatedWs.onerror =
          function () {
            const error = new Error(
              "Authenticated Deriv connection failed."
            );

            emit("error", {
              message: error.message
            });

            if (!settled) {
              settled = true;
              reject(error);
            }
          };

        authenticatedWs.onclose =
          function () {
            emit("status", {
              connected: false,
              authenticated: false
            });

            authenticatedWs = null;
          };
      }
    );
  }

  function handleAuthenticatedMessage(
    data
  ) {
    if (data.error) {
      emit("error", data.error);
      return;
    }

    switch (data.msg_type) {
      case "proposal":
        emit(
          "proposal",
          data.proposal
        );
        break;

      case "buy":
        emit(
          "buy",
          data.buy
        );
        break;

      case "proposal_open_contract":
        emit(
          "contract",
          data.proposal_open_contract
        );
        break;

      case "balance":
        emit(
          "balance",
          data.balance
        );
        break;

      default:
        break;
    }
  }

  function sendAuthenticated(
    payload
  ) {
    if (
      !authenticatedWs ||
      authenticatedWs.readyState !==
        WebSocket.OPEN
    ) {
      throw new Error(
        "Deriv trading account is not connected."
      );
    }

    const request = {
      ...payload,
      req_id:
        payload.req_id ||
        nextRequestId()
    };

    authenticatedWs.send(
      JSON.stringify(request)
    );

    return request.req_id;
  }

  /*
   * GET PROPOSAL
   */

  function getProposal(params) {
    return sendAuthenticated({
      proposal: 1,

      amount: Number(
        params.amount
      ),

      basis:
        params.basis || "stake",

      contract_type:
        params.contractType,

      currency:
        params.currency || "USD",

      duration:
        Number(params.duration),

      duration_unit:
        params.durationUnit || "t",

      underlying_symbol:
        params.symbol ||
        currentSymbol,

      subscribe: 1,

      ...(params.barrier !== undefined
        ? {
            barrier:
              String(params.barrier)
          }
        : {}),

      ...(params.multiplier
        ? {
            multiplier:
              Number(params.multiplier)
          }
        : {})
    });
  }

  /*
   * BUY CONTRACT
   */

  function buyContract(
    proposalId,
    price
  ) {
    return sendAuthenticated({
      buy: String(proposalId),
      price: Number(price)
    });
  }

  /*
   * MONITOR CONTRACT
   */

  function monitorContract(
    contractId
  ) {
    return sendAuthenticated({
      proposal_open_contract: 1,
      contract_id:
        Number(contractId),
      subscribe: 1
    });
  }

  /*
   * ACCOUNT BALANCE
   */

  function subscribeBalance() {
    return sendAuthenticated({
      balance: 1,
      subscribe: 1
    });
  }

  /*
   * SELL OPEN CONTRACT
   */

  function sellContract(
    contractId,
    price = 0
  ) {
    return sendAuthenticated({
      sell: Number(contractId),
      price: Number(price)
    });
  }

  /*
   * PUBLIC API
   */

  window.PELI_DERIV = {
    connect,
    disconnect,
    changeSymbol,

    on,

    connectAuthenticated,

    getProposal,
    buyContract,
    monitorContract,
    subscribeBalance,
    sellContract,

    get currentSymbol() {
      return currentSymbol;
    },

    get connected() {
      return !!(
        ws &&
        ws.readyState === WebSocket.OPEN
      );
    },

    get authenticated() {
      return !!(
        authenticatedWs &&
        authenticatedWs.readyState ===
          WebSocket.OPEN
      );
    }
  };

  /*
   * Start public ticks automatically.
   */

  window.addEventListener(
    "DOMContentLoaded",
    function () {
      connect(currentSymbol);
    }
  );

})();
