/* deriv.js — REAL Deriv Digits engine
   Uses:
   - public Options WebSocket for live ticks/history
   - authenticated real-account WebSocket for balance/proposals/buy/contracts
   - /api/deriv/session to obtain the one-time authenticated WebSocket URL
*/

(() => {
  "use strict";

  const PUBLIC_WS = "wss://api.derivws.com/trading/v1/options/ws/public";
  const SESSION_URL = "/api/deriv/session";

  const listeners = {};
  const emit = (name, value) =>
    (listeners[name] || []).forEach(fn => {
      try { fn(value); } catch (e) { console.error(e); }
    });

  const state = {
    publicWs: null,
    authWs: null,
    authenticated: false,
    account: null,
    symbol: "R_100",
    pipSize: 0.01,
    lastQuote: null,
    lastDigit: null,
    digits: Array(10).fill(0),
    recentDigits: [],
    proposal: null,
    reqId: 100,
    pending: new Map(),
    reconnectTimer: null
  };

  function on(name, fn) {
    (listeners[name] ||= []).push(fn);
    return () => {
      listeners[name] = (listeners[name] || []).filter(x => x !== fn);
    };
  }

  function nextReq() {
    state.reqId += 1;
    return state.reqId;
  }

  function send(ws, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Deriv WebSocket is not connected.");
    }

    const req_id = payload.req_id || nextReq();
    const message = { ...payload, req_id };

    ws.send(JSON.stringify(message));
    return req_id;
  }

  function publicSend(payload) {
    return send(state.publicWs, payload);
  }

  function authSend(payload) {
    return send(state.authWs, payload);
  }

  function resetStats() {
    state.digits = Array(10).fill(0);
    state.recentDigits = [];
  }

  function digitFromQuote(quote) {
    const n = Number(quote);

    if (!Number.isFinite(n)) return null;

    const pip = Number(state.pipSize);

    if (Number.isFinite(pip) && pip > 0 && pip < 1) {
      const decimalPlaces =
        Math.max(0, Math.round(-Math.log10(pip)));

      const scaled =
        Math.round(
          n * Math.pow(10, decimalPlaces)
        );

      return Math.abs(scaled) % 10;
    }

    // Fallback for symbols whose metadata does not provide pip_size.
    const text = String(quote);
    const digits = text.replace(/\D/g, "");

    return digits.length
      ? Number(digits[digits.length - 1])
      : null;
  }

  function handleTick(tick) {
    if (!tick || tick.quote === undefined) return;

    state.lastQuote = Number(tick.quote);

    const d = digitFromQuote(tick.quote);

    if (d !== null) {
      state.lastDigit = d;
      state.digits[d] += 1;
      state.recentDigits.push(d);

      if (state.recentDigits.length > 500) {
        state.recentDigits.shift();
      }
    }

    emit("tick", {
      ...tick,
      quote: state.lastQuote,
      lastDigit: d,
      counts: [...state.digits],
      sampleSize: state.recentDigits.length,
      pipSize: state.pipSize
    });
  }

  function handlePublicMessage(msg) {
    if (msg.error) {
      emit("error", msg.error);
      return;
    }

    if (msg.msg_type === "active_symbols") {
      const list =
        Array.isArray(msg.active_symbols)
          ? msg.active_symbols
          : [];

      const item = list.find(
        x =>
          (x.underlying_symbol || x.symbol) ===
          state.symbol
      );

      if (
        item &&
        Number(item.pip_size) > 0
      ) {
        state.pipSize =
          Number(item.pip_size);
      }

      emit("symbols", list);
    }

    if (msg.msg_type === "history") {
      const prices =
        msg.history?.prices || [];

      resetStats();

      prices.forEach(price => {
        const d = digitFromQuote(price);

        if (d !== null) {
          state.digits[d] += 1;
          state.recentDigits.push(d);
        }
      });

      if (state.recentDigits.length > 500) {
        state.recentDigits =
          state.recentDigits.slice(-500);
      }

      emit("history", {
        prices,
        counts: [...state.digits],
        sampleSize:
          state.recentDigits.length
      });
    }

    if (msg.msg_type === "tick") {
      handleTick(msg.tick);
    }
  }
     function connectPublic(symbol = state.symbol) {
    state.symbol = symbol;

    if (state.publicWs) {
      try {
        state.publicWs.close();
      } catch (_) {}
    }

    resetStats();

    emit("status", {
      publicConnecting: true,
      authenticated: state.authenticated
    });

    const ws =
      new WebSocket(PUBLIC_WS);

    state.publicWs = ws;

    ws.onopen = () => {
      emit("status", {
        publicConnected: true,
        authenticated: state.authenticated
      });

      // Get symbol metadata so last-digit extraction
      // uses the actual pip size.
      publicSend({
        active_symbols: "brief"
      });

      // Real historical ticks — no generated/demo values.
      publicSend({
        ticks_history: symbol,
        end: "latest",
        style: "ticks",
        count: 200,
        adjust_start_time: 1,
        subscribe: 0
      });

      publicSend({
        ticks: symbol,
        subscribe: 1
      });
    };

    ws.onmessage = event => {
      try {
        handlePublicMessage(
          JSON.parse(event.data)
        );
      } catch (e) {
        console.error(
          "Public Deriv message error:",
          e
        );
      }
    };

    ws.onerror = () =>
      emit("error", {
        message:
          "Live Deriv market connection error."
      });

    ws.onclose = () => {
      emit("status", {
        publicConnected: false,
        authenticated:
          state.authenticated
      });

      clearTimeout(
        state.reconnectTimer
      );

      state.reconnectTimer =
        setTimeout(
          () =>
            connectPublic(
              state.symbol
            ),
          2500
        );
    };
  }

  async function connectAuthenticated() {
    if (
      state.authenticated &&
      state.authWs?.readyState ===
        WebSocket.OPEN
    ) {
      return state.account;
    }

    emit("status", {
      connecting: true,
      authenticated: false
    });

    const response =
      await fetch(
        SESSION_URL,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        }
      );

    const session =
      await response.json();

    if (
      !response.ok ||
      !session.ws_url ||
      session.account?.account_type !==
        "real"
    ) {
      throw new Error(
        session.error ||
        "A real Deriv Options account is required."
      );
    }

    state.account =
      session.account;

    if (state.authWs) {
      try {
        state.authWs.close();
      } catch (_) {}
    }

    const ws =
      new WebSocket(
        session.ws_url
      );

    state.authWs = ws;

    await new Promise(
      (resolve, reject) => {
        const timeout =
          setTimeout(
            () =>
              reject(
                new Error(
                  "Timed out connecting to the real Deriv account."
                )
              ),
            15000
          );

        ws.onopen = () => {
          clearTimeout(timeout);

          state.authenticated =
            true;

          emit(
            "authenticated",
            state.account
          );

          emit("status", {
            connected: true,
            authenticated: true,
            account: state.account
          });

          // Real balance from the authenticated account.
          authSend({
            balance: 1,
            subscribe: 1
          });

          resolve();
        };

        ws.onerror = () => {
          clearTimeout(timeout);

          reject(
            new Error(
              "Could not open the authenticated Deriv WebSocket."
            )
          );
        };
      }
    );

    ws.onmessage = event => {
      try {
        const msg =
          JSON.parse(event.data);

        if (msg.error) {
          emit(
            "error",
            msg.error
          );
          return;
        }

        if (
          msg.msg_type ===
          "balance"
        ) {
          emit(
            "balance",
            msg.balance
          );
        }

        if (
          msg.msg_type ===
          "proposal"
        ) {
          state.proposal =
            msg.proposal || null;

          emit(
            "proposal",
            state.proposal
          );
        }

        if (
          msg.msg_type ===
          "buy"
        ) {
          emit(
            "buy",
            msg.buy
          );
        }

        if (
          msg.msg_type ===
          "proposal_open_contract"
        ) {
          emit(
            "contract",
            msg.proposal_open_contract
          );
        }

        emit(
          "message",
          msg
        );
      } catch (e) {
        console.error(
          "Authenticated Deriv message error:",
          e
        );
      }
    };

    ws.onclose = () => {
      state.authenticated =
        false;

      state.authWs =
        null;

      emit("status", {
        connected: false,
        authenticated: false
      });
    };

    return state.account;
  }
     function disconnectAuthenticated() {
    state.authenticated = false;

    if (state.authWs) {
      try {
        state.authWs.close();
      } catch (_) {}
    }

    state.authWs = null;
  }

  function subscribeBalance() {
    authSend({
      balance: 1,
      subscribe: 1
    });
  }

  function getProposal(params) {
    if (!state.authenticated) {
      throw new Error(
        "Connect a real Deriv account first."
      );
    }

    state.proposal = null;

    const request = {
      proposal: 1,
      amount: Number(params.amount),
      basis: "stake",
      contract_type: params.contractType,
      currency: params.currency,
      duration: Number(params.duration),
      duration_unit: params.durationUnit,
      underlying_symbol: params.symbol,
      subscribe: 1
    };

    if (
      params.barrier !== undefined &&
      params.barrier !== null &&
      params.barrier !== ""
    ) {
      request.barrier =
        String(params.barrier);
    }

    return authSend(request);
  }

  function buyContract(
    proposalId,
    price
  ) {
    if (!state.authenticated) {
      throw new Error(
        "Real Deriv account is not connected."
      );
    }

    if (!proposalId) {
      throw new Error(
        "Missing proposal ID."
      );
    }

    return authSend({
      buy: String(proposalId),
      price: Number(price)
    });
  }

  function monitorContract(
    contractId
  ) {
    if (!state.authenticated) {
      throw new Error(
        "Real Deriv account is not connected."
      );
    }

    return authSend({
      proposal_open_contract: 1,
      contract_id: Number(contractId),
      subscribe: 1
    });
  }

  function changeSymbol(symbol) {
    state.symbol = symbol;
    connectPublic(symbol);
  }

  window.PELI_DERIV = {
    on,
    connect: connectPublic,
    changeSymbol,
    connectAuthenticated,
    disconnectAuthenticated,
    subscribeBalance,
    getProposal,
    buyContract,
    monitorContract,

    get authenticated() {
      return state.authenticated;
    },

    get account() {
      return state.account;
    },

    get state() {
      return state;
    }
  };
})();
