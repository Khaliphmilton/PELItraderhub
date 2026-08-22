// PELItradershub — REAL DERIV ENGINE
// Replace the entire existing Deriv engine file.

(() => {
  "use strict";

  const SESSION_URL = "/api/deriv/session";
  const PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const state = {
    publicWs: null,
    authWs: null,

    authenticated: false,
    connecting: false,

    account: null,
    symbol: "R_100",

    pipSize: 0.01,

    lastQuote: null,
    lastDigit: null,
    previousQuote: null,
    previousDigit: null,
    lastEpoch: null,

    digits: Array(10).fill(0),
    recentDigits: [],
    recentTicks: [],

    proposal: null,
    currentContract: null,

    openContracts: new Map(),
    pending: new Map(),

    reqId: 1000,

    publicReconnectTimer: null,
    publicReconnectAttempts: 0,

    manualPublicClose: false,
    manualAuthClose: false
  };


  // ============================================================
  // EVENTS
  // ============================================================

  const listeners = {};

  function on(event, callback) {
    if (!listeners[event]) {
      listeners[event] = [];
    }

    listeners[event].push(callback);

    return () => {
      listeners[event] =
        (listeners[event] || [])
          .filter(fn => fn !== callback);
    };
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(
          `PELI_DERIV event error: ${event}`,
          error
        );
      }
    });
  }


  // ============================================================
  // REQUEST ID
  // ============================================================

  function nextReqId() {
    state.reqId += 1;
    return state.reqId;
  }


  // ============================================================
  // DIGIT
  // ============================================================

  function getDigit(quote) {
    const number = Number(quote);

    if (!Number.isFinite(number)) {
      return null;
    }

    const pip = Number(state.pipSize);

    if (
      Number.isFinite(pip) &&
      pip > 0 &&
      pip < 1
    ) {
      const decimals = Math.max(
        0,
        Math.round(-Math.log10(pip))
      );

      const multiplier =
        Math.pow(10, decimals);

      return (
        Math.round(
          Math.abs(number) * multiplier
        ) % 10
      );
    }

    const match =
      String(quote).match(/(\d)\s*$/);

    return match
      ? Number(match[1])
      : null;
  }


  // ============================================================
  // RESET
  // ============================================================

  function resetStats() {
    state.digits = Array(10).fill(0);
    state.recentDigits = [];
    state.recentTicks = [];

    state.lastQuote = null;
    state.lastDigit = null;
    state.previousQuote = null;
    state.previousDigit = null;
    state.lastEpoch = null;
  }


  // ============================================================
  // TICK
  // ============================================================

  function processTick(tick) {
    if (
      !tick ||
      tick.quote === undefined
    ) {
      return;
    }

    const quote = Number(tick.quote);

    if (!Number.isFinite(quote)) {
      return;
    }

    const digit = getDigit(quote);

    state.previousQuote =
      state.lastQuote;

    state.previousDigit =
      state.lastDigit;

    state.lastQuote = quote;
    state.lastDigit = digit;

    state.lastEpoch =
      tick.epoch || null;

    if (digit !== null) {
      state.digits[digit]++;
      state.recentDigits.push(digit);
    }

    state.recentTicks.push({
      quote,
      digit,
      epoch: tick.epoch || null
    });

    if (state.recentDigits.length > 500) {
      state.recentDigits =
        state.recentDigits.slice(-500);
    }

    if (state.recentTicks.length > 500) {
      state.recentTicks =
        state.recentTicks.slice(-500);
    }

    emit("tick", {
      ...tick,

      quote,

      lastDigit: digit,

      previousQuote:
        state.previousQuote,

      previousDigit:
        state.previousDigit,

      counts:
        [...state.digits],

      sampleSize:
        state.recentDigits.length,

      pipSize:
        state.pipSize
    });
  }


  // ============================================================
  // PUBLIC SOCKET
  // ============================================================

  function connect(symbol = state.symbol) {

    state.symbol = symbol;
    state.manualPublicClose = false;

    if (state.publicWs) {
      try {
        state.publicWs.close();
      } catch {}
    }

    resetStats();

    emit("status", {
      publicConnecting: true,
      publicConnected: false,
      authenticated:
        state.authenticated,
      symbol: state.symbol
    });

    const ws = new WebSocket(PUBLIC_WS);

    state.publicWs = ws;

    ws.onopen = () => {

      state.publicReconnectAttempts = 0;

      emit("status", {
        publicConnecting: false,
        publicConnected: true,
        authenticated:
          state.authenticated,
        symbol: state.symbol
      });

      try {

        sendPublic({
          active_symbols: "brief"
        });

        sendPublic({
          ticks_history:
            state.symbol,

          end: "latest",

          style: "ticks",

          count: 200,

          adjust_start_time: 1
        });

        sendPublic({
          ticks:
            state.symbol,

          subscribe: 1
        });

      } catch (error) {

        emit("error", {
          message: error.message
        });
      }
    };

    ws.onmessage = event => {

      let message;

      try {
        message =
          JSON.parse(event.data);
      } catch {
        return;
      }

      handlePublicMessage(message);
    };

    ws.onerror = () => {

      emit("error", {
        message:
          "Live Deriv market connection error."
      });
    };

    ws.onclose = () => {

      emit("status", {
        publicConnecting: false,
        publicConnected: false,
        authenticated:
          state.authenticated
      });

      if (!state.manualPublicClose) {
        reconnectPublic();
      }
    };

    return ws;
  }


  function sendPublic(payload) {

    if (
      !state.publicWs ||
      state.publicWs.readyState !==
        WebSocket.OPEN
    ) {
      throw new Error(
        "Deriv market is not connected."
      );
    }

    const message = {
      ...payload,
      req_id: nextReqId()
    };

    state.publicWs.send(
      JSON.stringify(message)
    );

    return message.req_id;
  }


  function handlePublicMessage(message) {

    if (!message) {
      return;
    }

    if (message.error) {
      emit("error", message.error);
      return;
    }

    if (
      message.msg_type ===
      "active_symbols"
    ) {

      const symbols =
        Array.isArray(
          message.active_symbols
        )
          ? message.active_symbols
          : [];

      const selected =
        symbols.find(item =>
          (
            item.underlying_symbol ||
            item.symbol
          ) === state.symbol
        );

      if (
        selected &&
        Number(selected.pip_size) > 0
      ) {
        state.pipSize =
          Number(selected.pip_size);
      }

      emit("symbols", symbols);
    }

    if (
      message.msg_type ===
      "history"
    ) {

      const prices =
        Array.isArray(
          message.history?.prices
        )
          ? message.history.prices
          : [];

      resetStats();

      prices.forEach(price => {

        const digit =
          getDigit(price);

        if (digit !== null) {
          state.digits[digit]++;
          state.recentDigits.push(digit);
        }
      });

      if (state.recentDigits.length > 500) {
        state.recentDigits =
          state.recentDigits.slice(-500);
      }

      emit("history", {
        prices,
        counts:
          [...state.digits],
        sampleSize:
          state.recentDigits.length
      });
    }

    if (
      message.msg_type ===
      "tick"
    ) {
      processTick(message.tick);
    }
  }


  function reconnectPublic() {

    clearTimeout(
      state.publicReconnectTimer
    );

    const attempt =
      Math.min(
        state.publicReconnectAttempts,
        6
      );

    const delay =
      Math.min(
        10000,
        1000 *
        Math.pow(2, attempt)
      );

    state.publicReconnectAttempts++;

    state.publicReconnectTimer =
      setTimeout(() => {
        connect(state.symbol);
      }, delay);
  }


  function disconnect() {

    state.manualPublicClose = true;

    clearTimeout(
      state.publicReconnectTimer
    );

    if (state.publicWs) {
      try {
        state.publicWs.close();
      } catch {}
    }

    state.publicWs = null;
  }


  // ============================================================
  // REAL ACCOUNT SESSION
  // ============================================================

  async function getSession() {

    const response =
      await fetch(
        SESSION_URL,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept:
              "application/json"
          }
        }
      );

    let data;

    try {
      data =
        await response.json();
    } catch {
      throw new Error(
        "Invalid response from Deriv session."
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.error ||
        "Unable to connect to Deriv."
      );
    }

    if (
      data.account?.account_type !==
      "real"
    ) {
      throw new Error(
        "REAL Deriv account required."
      );
    }

    if (!data.ws_url) {
      throw new Error(
        "Deriv did not return a trading WebSocket."
      );
    }

    if (
      !String(data.ws_url).includes(
        "/trading/v1/options/ws/real"
      )
    ) {
      throw new Error(
        "Security check failed: non-real Deriv WebSocket."
      );
    }

    return data;
  }


  // ============================================================
  // CONNECT REAL ACCOUNT
  // ============================================================

  async function connectAuthenticated() {

    if (
      state.authenticated &&
      state.authWs &&
      state.authWs.readyState ===
        WebSocket.OPEN
    ) {
      return state.account;
    }

    state.connecting = true;

    emit("status", {
      connecting: true,
      authenticated: false
    });

    const session =
      await getSession();

    state.account =
      session.account;

    state.manualAuthClose = false;

    if (state.authWs) {
      try {
        state.authWs.close();
      } catch {}
    }

    const ws =
      new WebSocket(
        session.ws_url
      );

    state.authWs = ws;

    await new Promise(
      (resolve, reject) => {

        let finished = false;

        const timer =
          setTimeout(() => {

            if (finished) {
              return;
            }

            finished = true;

            try {
              ws.close();
            } catch {}

            reject(
              new Error(
                "Timed out connecting to REAL Deriv."
              )
            );

          }, 15000);

        ws.onopen = () => {

          if (finished) {
            return;
          }

          finished = true;

          clearTimeout(timer);

          state.authenticated = true;
          state.connecting = false;

          emit(
            "authenticated",
            state.account
          );

          emit("status", {
            connecting: false,
            connected: true,
            authenticated: true,
            account: state.account
          });

          /*
           * REAL BALANCE
           */
          authSend({
            balance: 1,
            subscribe: 1
          });

          /*
           * REAL OPEN POSITIONS
           */
          authSend({
            portfolio: 1
          });

          resolve();
        };

        ws.onerror = () => {

          if (finished) {
            return;
          }

          finished = true;

          clearTimeout(timer);

          reject(
            new Error(
              "Could not connect to REAL Deriv."
            )
          );
        };
      }
    );

    ws.onmessage = event => {

      let message;

      try {
        message =
          JSON.parse(event.data);
      } catch {
        return;
      }

      handleAuthMessage(message);
    };

    ws.onerror = () => {

      emit("error", {
        message:
          "REAL Deriv connection error."
      });
    };

    ws.onclose = () => {

      state.authenticated = false;
      state.authWs = null;

      emit("status", {
        connected: false,
        authenticated: false
      });

      if (!state.manualAuthClose) {
        emit(
          "authDisconnected",
          true
        );
      }
    };

    return state.account;
  }


  // ============================================================
  // AUTH MESSAGE
  // ============================================================

  function handleAuthMessage(message) {

    if (!message) {
      return;
    }

    emit("message", message);

    if (message.error) {

      emit(
        "error",
        message.error
      );

      if (message.req_id) {

        const pending =
          state.pending.get(
            message.req_id
          );

        if (pending) {

          pending.reject(
            message.error
          );

          state.pending.delete(
            message.req_id
          );
        }
      }

      return;
    }


    // BALANCE
    if (
      message.msg_type ===
      "balance"
    ) {

      emit(
        "balance",
        message.balance
      );
    }


    // PROPOSAL
    if (
      message.msg_type ===
      "proposal"
    ) {

      state.proposal =
        message.proposal ||
        null;

      emit(
        "proposal",
        state.proposal
      );
    }


    // BUY
    if (
      message.msg_type ===
      "buy"
    ) {

      const buy =
        message.buy ||
        null;

      if (buy?.contract_id) {

        state.currentContract =
          buy;

        state.openContracts.set(
          String(buy.contract_id),
          buy
        );
      }

      emit("buy", buy);
    }


    // CONTRACT
    if (
      message.msg_type ===
      "proposal_open_contract"
    ) {

      const contract =
        message.proposal_open_contract ||
        null;

      if (contract?.contract_id) {

        const id =
          String(
            contract.contract_id
          );

        state.currentContract =
          contract;

        if (contract.is_sold) {

          state.openContracts.delete(id);

        } else {

          state.openContracts.set(
            id,
            contract
          );
        }
      }

      emit(
        "contract",
        contract
      );
    }


    // PORTFOLIO
    if (
      message.msg_type ===
      "portfolio"
    ) {

      const contracts =
        Array.isArray(
          message.portfolio?.contracts
        )
          ? message.portfolio.contracts
          : [];

      contracts.forEach(contract => {

        if (contract?.contract_id) {

          state.openContracts.set(
            String(
              contract.contract_id
            ),
            contract
          );
        }
      });

      emit("portfolio", {
        ...message.portfolio,
        contracts
      });
    }


    // STATEMENT
    if (
      message.msg_type ===
      "statement"
    ) {

      emit(
        "statement",
        message.statement
      );
    }


    // PROFIT TABLE
    if (
      message.msg_type ===
      "profit_table"
    ) {

      emit(
        "profitTable",
        message.profit_table
      );
    }


    // SELL
    if (
      message.msg_type ===
      "sell"
    ) {

      emit(
        "sell",
        message.sell
      );
    }


    // CONTRACT UPDATE
    if (
      message.msg_type ===
      "contract_update"
    ) {

      emit(
        "contractUpdate",
        message.contract_update
      );
    }


    // REQUEST RESOLUTION
    if (message.req_id) {

      const pending =
        state.pending.get(
          message.req_id
        );

      if (pending) {

        pending.resolve(message);

        state.pending.delete(
          message.req_id
        );
      }
    }
  }


  // ============================================================
  // AUTH SEND
  // ============================================================

  function authSend(payload) {

    if (
      !state.authWs ||
      state.authWs.readyState !==
        WebSocket.OPEN
    ) {
      throw new Error(
        "REAL Deriv account is not connected."
      );
    }

    const message = {
      ...payload,
      req_id: nextReqId()
    };

    state.authWs.send(
      JSON.stringify(message)
    );

    return message.req_id;
  }


  function authRequest(
    payload,
    timeout = 15000
  ) {

    return new Promise(
      (resolve, reject) => {

        if (
          !state.authWs ||
          state.authWs.readyState !==
            WebSocket.OPEN
        ) {
          reject(
            new Error(
              "REAL Deriv account is not connected."
            )
          );

          return;
        }

        const req_id =
          nextReqId();

        const timer =
          setTimeout(() => {

            state.pending.delete(
              req_id
            );

            reject(
              new Error(
                "Deriv request timed out."
              )
            );

          }, timeout);

        state.pending.set(
          req_id,
          {
            resolve: value => {

              clearTimeout(timer);
              resolve(value);
            },

            reject: error => {

              clearTimeout(timer);
              reject(error);
            }
          }
        );

        try {

          state.authWs.send(
            JSON.stringify({
              ...payload,
              req_id
            })
          );

        } catch (error) {

          clearTimeout(timer);

          state.pending.delete(
            req_id
          );

          reject(error);
        }
      }
    );
  }


  // ============================================================
  // DISCONNECT REAL ACCOUNT
  // ============================================================

  function disconnectAuthenticated() {

    state.manualAuthClose = true;
    state.authenticated = false;
    state.account = null;

    state.openContracts.clear();
    state.currentContract = null;

    if (state.authWs) {

      try {
        state.authWs.close();
      } catch {}
    }

    state.authWs = null;

    emit("status", {
      connected: false,
      authenticated: false
    });
  }


  // ============================================================
  // BALANCE
  // ============================================================

  function subscribeBalance() {

    return authRequest({
      balance: 1,
      subscribe: 1
    });
  }


  // ============================================================
  // PROPOSAL
  // ============================================================

  async function getProposal(params = {}) {

    if (!state.authenticated) {
      throw new Error(
        "Connect your REAL Deriv account first."
      );
    }

    const amount =
      Number(params.amount);

    const duration =
      Number(params.duration);

    const contractType =
      String(
        params.contractType || ""
      );

    const symbol =
      params.symbol ||
      state.symbol;

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Invalid stake."
      );
    }

    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      throw new Error(
        "Invalid duration."
      );
    }

    if (!contractType) {
      throw new Error(
        "Contract type is required."
      );
    }

    const request = {

      proposal: 1,

      amount,

      basis:
        params.basis ||
        "stake",

      contract_type:
        contractType,

      currency:
        params.currency ||
        state.account?.currency ||
        "USD",

      duration,

      duration_unit:
        params.durationUnit ||
        "t",

      underlying_symbol:
        symbol
    };

    if (
      params.barrier !== undefined &&
      params.barrier !== null &&
      params.barrier !== ""
    ) {

      request.barrier =
        String(
          params.barrier
        );
    }

    const response =
      await authRequest(
        request
      );

    if (response.proposal) {

      state.proposal =
        response.proposal;

      emit(
        "proposal",
        state.proposal
      );
    }

    return response;
  }


  // ============================================================
  // BUY — REAL MONEY
  // ============================================================

  function buyContract(
    proposalId,
    price
  ) {

    if (!state.authenticated) {
      throw new Error(
        "Connect your REAL Deriv account first."
      );
    }

    if (!proposalId) {
      throw new Error(
        "Missing proposal ID."
      );
    }

    const amount =
      Number(price);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Invalid contract price."
      );
    }

    return authRequest({
      buy:
        String(proposalId),

      price:
        amount
    });
  }


  // ============================================================
  // MONITOR
  // ============================================================

  function monitorContract(
    contractId
  ) {

    if (!state.authenticated) {
      throw new Error(
        "REAL Deriv account is not connected."
      );
    }

    const id =
      Number(contractId);

    if (!Number.isFinite(id)) {
      throw new Error(
        "Invalid contract ID."
      );
    }

    return authRequest({
      proposal_open_contract: 1,

      contract_id: id,

      subscribe: 1
    });
  }


  // ============================================================
  // SELL
  // ============================================================

  function sellContract(
    contractId,
    price = 0
  ) {

    if (!state.authenticated) {
      throw new Error(
        "REAL Deriv account is not connected."
      );
    }

    const id =
      Number(contractId);

    if (!Number.isFinite(id)) {
      throw new Error(
        "Invalid contract ID."
      );
    }

    const sellPrice =
      Number(price);

    if (
      !Number.isFinite(sellPrice) ||
      sellPrice < 0
    ) {
      throw new Error(
        "Invalid sell price."
      );
    }

    return authRequest({
      sell: id,
      price: sellPrice
    });
  }


  // ============================================================
  // PORTFOLIO
  // ============================================================

  function getPortfolio() {

    if (!state.authenticated) {
      throw new Error(
        "REAL Deriv account is not connected."
      );
    }

    return authRequest({
      portfolio: 1
    });
  }


  // ============================================================
  // STATEMENT
  // ============================================================

  function getStatement(options = {}) {

    if (!state.authenticated) {
      throw new Error(
        "REAL Deriv account is not connected."
      );
    }

    const request = {

      statement: 1,

      limit:
        Number(
          options.limit || 100
        ),

      description:
        options.description === undefined
          ? 1
          : Number(
              options.description
            )
    };

    if (
      options.dateFrom !== undefined
    ) {
      request.date_from =
        Number(
          options.dateFrom
        );
    }

    if (
      options.dateTo !== undefined
    ) {
      request.date_to =
        Number(
          options.dateTo
        );
    }

    if (options.actionType) {
      request.action_type =
        options.actionType;
    }

    return authRequest(request);
  }


  // ============================================================
  // PROFIT TABLE
  // ============================================================

  function getProfitTable(options = {}) {

    if (!state.authenticated) {
      throw new Error(
        "REAL Deriv account is not connected."
      );
    }

    const request = {

      profit_table: 1,

      limit:
        Number(
          options.limit || 100
        )
    };

    if (
      options.dateFrom !== undefined
    ) {
      request.date_from =
        Number(
          options.dateFrom
        );
    }

    if (
      options.dateTo !== undefined
    ) {
      request.date_to =
        Number(
          options.dateTo
        );
    }

    if (options.contractType) {
      request.contract_type =
        options.contractType;
    }

    return authRequest(request);
  }


  // ============================================================
  // ACTIVE SYMBOLS
  // ============================================================

  function getActiveSymbols() {

    if (state.authenticated) {
      return authRequest({
        active_symbols: "brief"
      });
    }

    return sendPublic({
      active_symbols: "brief"
    });
  }


  // ============================================================
  // CONTRACTS FOR
  // ============================================================

  function getContractsFor(
    symbol = state.symbol
  ) {

    if (!symbol) {
      throw new Error(
        "Market symbol required."
      );
    }

    if (state.authenticated) {
      return authRequest({
        contracts_for: symbol
      });
    }

    return sendPublic({
      contracts_for: symbol
    });
  }


  // ============================================================
  // CHANGE MARKET
  // ============================================================

  function changeSymbol(symbol) {

    if (!symbol) {
      throw new Error(
        "Market symbol required."
      );
    }

    state.symbol = symbol;
    state.proposal = null;

    connect(symbol);

    emit(
      "symbolChanged",
      symbol
    );
  }


  // ============================================================
  // STATS
  // ============================================================

  function getDigitStats() {

    const total =
      state.recentDigits.length;

    return {

      counts:
        [...state.digits],

      percentages:
        state.digits.map(count =>
          total
            ? (count / total) * 100
            : 0
        ),

      total,

      lastDigit:
        state.lastDigit,

      previousDigit:
        state.previousDigit
    };
  }


  function getRecentTicks() {
    return [
      ...state.recentTicks
    ];
  }


  function getOpenContracts() {
    return Array.from(
      state.openContracts.values()
    );
  }


  function getCurrentContract() {
    return state.currentContract;
  }


  // ============================================================
  // CONNECTION INFO
  // ============================================================

  function getConnectionInfo() {

    return {

      authenticated:
        state.authenticated,

      connecting:
        state.connecting,

      publicConnected:
        Boolean(
          state.publicWs &&
          state.publicWs.readyState ===
            WebSocket.OPEN
        ),

      authConnected:
        Boolean(
          state.authWs &&
          state.authWs.readyState ===
            WebSocket.OPEN
        ),

      account:
        state.account,

      symbol:
        state.symbol
    };
  }


  // ============================================================
  // RECONNECT
  // ============================================================

  async function reconnectAuthenticated() {

    disconnectAuthenticated();

    return connectAuthenticated();
  }


  // ============================================================
  // DESTROY
  // ============================================================

  function destroy() {

    disconnect();

    disconnectAuthenticated();

    state.pending.forEach(
      pending => {

        try {
          pending.reject(
            new Error(
              "Deriv engine destroyed."
            )
          );
        } catch {}
      }
    );

    state.pending.clear();
  }


  // ============================================================
  // GLOBAL API
  // ============================================================

  window.PELI_DERIV = {

    on,

    connect,
    disconnect,
    changeSymbol,

    getActiveSymbols,
    getContractsFor,

    connectAuthenticated,
    reconnectAuthenticated,
    disconnectAuthenticated,

    subscribeBalance,

    getProposal,
    buyContract,
    monitorContract,
    sellContract,

    getPortfolio,
    getStatement,
    getProfitTable,

    getDigitStats,
    getRecentTicks,
    getOpenContracts,
    getCurrentContract,

    getConnectionInfo,

    destroy,

    get authenticated() {
      return state.authenticated;
    },

    get account() {
      return state.account;
    },

    get symbol() {
      return state.symbol;
    },

    get lastQuote() {
      return state.lastQuote;
    },

    get lastDigit() {
      return state.lastDigit;
    },

    get proposal() {
      return state.proposal;
    },

    get currentContract() {
      return state.currentContract;
    },

    get state() {
      return state;
    }
  };


  // ============================================================
  // START LIVE MARKET
  // ============================================================

  connect(state.symbol);

})();
