/* ============================================================
   PELItradershub — REAL DERIV TRADING ENGINE
   ============================================================

   REAL MARKET DATA
   REAL ACCOUNT SESSION
   REAL PROPOSALS
   REAL CONTRACT PURCHASE
   REAL CONTRACT MONITORING
   REAL SELL
   REAL PORTFOLIO
   REAL STATEMENT

   UI contract types supported:

      DIGITMATCH
      DIGITDIFF
      DIGITEVEN
      DIGITODD
      DIGITOVER
      DIGITUNDER

   The browser receives the authenticated WebSocket URL from:

      /api/deriv/session

   The backend must return an authenticated REAL account session.

   ============================================================ */

(() => {

  "use strict";


  /* ==========================================================
     CONFIGURATION
     ========================================================== */

  const PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const SESSION_URL =
    "/api/deriv/session";


  /* ==========================================================
     EVENT SYSTEM
     ========================================================== */

  const listeners = Object.create(null);


  function on(name, callback) {

    if (!listeners[name]) {
      listeners[name] = [];
    }

    listeners[name].push(callback);

    return () => {

      listeners[name] =
        (listeners[name] || [])
          .filter(fn => fn !== callback);

    };
  }


  function emit(name, data) {

    const callbacks =
      listeners[name] || [];

    callbacks.forEach(callback => {

      try {

        callback(data);

      } catch (error) {

        console.error(
          `PELI Deriv listener error [${name}]`,
          error
        );

      }

    });

  }


  /* ==========================================================
     INTERNAL STATE
     ========================================================== */

  const state = {

    publicWs: null,

    authWs: null,

    authenticated: false,

    account: null,

    symbol: "R_100",

    pipSize: 0.01,

    lastQuote: null,

    lastDigit: null,

    lastEpoch: null,

    previousQuote: null,

    previousDigit: null,

    digits: Array(10).fill(0),

    recentDigits: [],

    recentTicks: [],

    proposal: null,

    activeProposalId: null,

    currentContract: null,

    openContracts: new Map(),

    reqId: 1000,

    pending: new Map(),

    publicReconnectTimer: null,

    authReconnectTimer: null,

    publicReconnectAttempts: 0,

    authReconnectAttempts: 0,

    manuallyClosedPublic: false,

    manuallyClosedAuth: false,

    connectionGeneration: 0

  };


  /* ==========================================================
     CONSTANTS
     ========================================================== */

  const DIGIT_CONTRACTS = [

    "DIGITMATCH",
    "DIGITDIFF",
    "DIGITEVEN",
    "DIGITODD",
    "DIGITOVER",
    "DIGITUNDER"

  ];


  const PREDICTION_CONTRACTS = [

    "DIGITMATCH",
    "DIGITDIFF",
    "DIGITOVER",
    "DIGITUNDER"

  ];


  /* ==========================================================
     REQUEST IDS
     ========================================================== */

  function nextReqId() {

    state.reqId += 1;

    return state.reqId;

  }


  /* ==========================================================
     SAFE JSON
     ========================================================== */

  function parseMessage(raw) {

    try {

      return JSON.parse(raw);

    } catch (error) {

      console.error(
        "Invalid Deriv WebSocket message:",
        raw
      );

      return null;

    }

  }


  /* ==========================================================
     GENERIC SEND
     ========================================================== */

  function send(ws, payload) {

    if (
      !ws ||
      ws.readyState !== WebSocket.OPEN
    ) {

      throw new Error(
        "Deriv WebSocket is not connected."
      );

    }


    const req_id =
      payload.req_id ||
      nextReqId();


    const message = {

      ...payload,

      req_id

    };


    ws.send(
      JSON.stringify(message)
    );


    return req_id;

  }


  function publicSend(payload) {

    return send(
      state.publicWs,
      payload
    );

  }


  function authSend(payload) {

    return send(
      state.authWs,
      payload
    );

  }


  /* ==========================================================
     DIGIT CALCULATION
     ========================================================== */

  function digitFromQuote(quote) {

    const number =
      Number(quote);


    if (
      !Number.isFinite(number)
    ) {

      return null;

    }


    const pip =
      Number(state.pipSize);


    if (
      Number.isFinite(pip) &&
      pip > 0 &&
      pip < 1
    ) {

      const decimalPlaces =
        Math.max(
          0,
          Math.round(
            -Math.log10(pip)
          )
        );


      const multiplier =
        Math.pow(
          10,
          decimalPlaces
        );


      const scaled =
        Math.round(
          Math.abs(number) *
          multiplier
        );


      return (
        scaled % 10
      );

    }


    const text =
      String(quote);


    const match =
      text.match(
        /(\d)\s*$/
      );


    if (!match) {

      return null;

    }


    return Number(
      match[1]
    );

  }


  /* ==========================================================
     RESET DIGIT DATA
     ========================================================== */

  function resetStats() {

    state.digits =
      Array(10).fill(0);

    state.recentDigits = [];

    state.recentTicks = [];

    state.lastDigit = null;

  }


  /* ==========================================================
     PROCESS TICK
     ========================================================== */

  function handleTick(tick) {

    if (
      !tick ||
      tick.quote === undefined
    ) {

      return;

    }


    const quote =
      Number(tick.quote);


    if (
      !Number.isFinite(quote)
    ) {

      return;

    }


    const digit =
      digitFromQuote(
        quote
      );


    state.previousQuote =
      state.lastQuote;


    state.previousDigit =
      state.lastDigit;


    state.lastQuote =
      quote;


    state.lastDigit =
      digit;


    state.lastEpoch =
      tick.epoch ||
      null;


    if (
      digit !== null
    ) {

      state.digits[digit] += 1;

      state.recentDigits.push(
        digit
      );

    }


    state.recentTicks.push({

      quote,

      digit,

      epoch:
        tick.epoch ||
        null

    });


    if (
      state.recentDigits.length >
      500
    ) {

      state.recentDigits =
        state.recentDigits.slice(-500);

    }


    if (
      state.recentTicks.length >
      500
    ) {

      state.recentTicks =
        state.recentTicks.slice(-500);

    }


    emit(
      "tick",
      {

        ...tick,

        quote,

        lastDigit:
          digit,

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

      }
    );

  }


  /* ==========================================================
     PUBLIC MESSAGE HANDLER
     ========================================================== */

  function handlePublicMessage(message) {

    if (!message) {
      return;
    }


    if (message.error) {

      emit(
        "error",
        message.error
      );

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
        symbols.find(
          item =>
            (
              item.underlying_symbol ||
              item.symbol
            ) ===
            state.symbol
        );


      if (
        selected &&
        Number(selected.pip_size) > 0
      ) {

        state.pipSize =
          Number(
            selected.pip_size
          );

      }


      emit(
        "symbols",
        symbols
      );

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


      prices.forEach(
        priceValue => {

          const digit =
            digitFromQuote(
              priceValue
            );


          if (
            digit !== null
          ) {

            state.digits[digit] += 1;

            state.recentDigits.push(
              digit
            );

          }

        }
      );


      if (
        state.recentDigits.length >
        500
      ) {

        state.recentDigits =
          state.recentDigits.slice(-500);

      }


      emit(
        "history",
        {

          prices,

          counts:
            [...state.digits],

          sampleSize:
            state.recentDigits.length

        }
      );

    }


    if (
      message.msg_type ===
      "tick"
    ) {

      handleTick(
        message.tick
      );

    }

  }


  /* ==========================================================
     PUBLIC CONNECTION
     ========================================================== */

  function connectPublic(
    symbol = state.symbol
  ) {

    state.symbol =
      symbol;


    state.manuallyClosedPublic =
      false;


    state.connectionGeneration += 1;


    if (
      state.publicWs
    ) {

      try {

        state.publicWs.close();

      } catch (_) {}

    }


    resetStats();


    emit(
      "status",
      {

        publicConnecting:
          true,

        publicConnected:
          false,

        authenticated:
          state.authenticated,

        symbol:
          state.symbol

      }
    );


    const ws =
      new WebSocket(
        PUBLIC_WS
      );


    state.publicWs =
      ws;


    ws.onopen = () => {

      state.publicReconnectAttempts =
        0;


      emit(
        "status",
        {

          publicConnecting:
            false,

          publicConnected:
            true,

          authenticated:
            state.authenticated,

          symbol:
            state.symbol

        }
      );


      try {

        publicSend({

          active_symbols:
            "brief"

        });


        publicSend({

          ticks_history:
            state.symbol,

          end:
            "latest",

          style:
            "ticks",

          count:
            200,

          adjust_start_time:
            1,

          subscribe:
            0

        });


        publicSend({

          ticks:
            state.symbol,

          subscribe:
            1

        });

      } catch (error) {

        emit(
          "error",
          {

            message:
              error.message

          }
        );

      }

    };


    ws.onmessage =
      event => {

        const message =
          parseMessage(
            event.data
          );


        handlePublicMessage(
          message
        );

      };


    ws.onerror =
      () => {

        emit(
          "error",
          {

            message:
              "Live Deriv market connection error."

          }
        );

      };


    ws.onclose =
      () => {

        emit(
          "status",
          {

            publicConnecting:
              false,

            publicConnected:
              false,

            authenticated:
              state.authenticated

          }
        );


        if (
          state.manuallyClosedPublic
        ) {

          return;

        }


        schedulePublicReconnect();

      };


    return ws;

  }


  /* ==========================================================
     PUBLIC RECONNECT
     ========================================================== */

  function schedulePublicReconnect() {

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
        Math.pow(
          2,
          attempt
        )
      );


    state.publicReconnectAttempts +=
      1;


    state.publicReconnectTimer =
      setTimeout(
        () => {

          connectPublic(
            state.symbol
          );

        },
        delay
      );

  }


  /* ==========================================================
     CLOSE PUBLIC
     ========================================================== */

  function disconnectPublic() {

    state.manuallyClosedPublic =
      true;


    clearTimeout(
      state.publicReconnectTimer
    );


    if (
      state.publicWs
    ) {

      try {

        state.publicWs.close();

      } catch (_) {}

    }


    state.publicWs =
      null;

  }


  /* ==========================================================
     GET AUTH SESSION
     ========================================================== */

  async function getSession() {

    const response =
      await fetch(
        SESSION_URL,
        {

          method:
            "GET",

          credentials:
            "same-origin",

          cache:
            "no-store",

          headers:
            {

              Accept:
                "application/json"

            }

        }
      );


    let session;


    try {

      session =
        await response.json();

    } catch (_) {

      throw new Error(
        "The Deriv session endpoint returned invalid JSON."
      );

    }


    if (
      !response.ok
    ) {

      throw new Error(
        session?.error ||
        `Deriv session request failed (${response.status}).`
      );

    }


    if (
      !session ||
      !session.ws_url
    ) {

      throw new Error(
        session?.error ||
        "No authenticated Deriv WebSocket URL was returned."
      );

    }


    /*
      Critical REAL-account protection.

      Your backend must identify the account as real.
    */
    if (
      session.account?.account_type !==
      "real"
    ) {

      throw new Error(
        "A REAL Deriv account session is required. The received account is not marked as real."
      );

    }


    return session;

  }


  /* ==========================================================
     AUTHENTICATED CONNECTION
     ========================================================== */

  async function connectAuthenticated() {

    if (
      state.authenticated &&
      state.authWs &&
      state.authWs.readyState ===
      WebSocket.OPEN
    ) {

      return state.account;

    }


    emit(
      "status",
      {

        connecting:
          true,

        authenticated:
          false

      }
    );


    const session =
      await getSession();


    state.account =
      session.account ||
      null;


    state.manuallyClosedAuth =
      false;


    if (
      state.authWs
    ) {

      try {

        state.authWs.close();

      } catch (_) {}

    }


    const ws =
      new WebSocket(
        session.ws_url
      );


    state.authWs =
      ws;


    await new Promise(
      (
        resolve,
        reject
      ) => {

        let settled =
          false;


        const timeout =
          setTimeout(
            () => {

              if (
                settled
              ) {
                return;
              }

              settled =
                true;

              try {

                ws.close();

              } catch (_) {}

              reject(
                new Error(
                  "Timed out connecting to the real Deriv account."
                )
              );

            },
            15000
          );


        ws.onopen =
          () => {

            if (
              settled
            ) {
              return;
            }


            settled =
              true;


            clearTimeout(
              timeout
            );


            state.authenticated =
              true;


            state.authReconnectAttempts =
              0;


            emit(
              "authenticated",
              state.account
            );


            emit(
              "status",
              {

                connecting:
                  false,

                connected:
                  true,

                authenticated:
                  true,

                account:
                  state.account

              }
            );


            /*
              Real account balance.
            */
            try {

              authSend({

                balance:
                  1,

                subscribe:
                  1

              });

            } catch (_) {}


            /*
              Open positions.
            */
            try {

              authSend({

                portfolio:
                  1

              });

            } catch (_) {}


            resolve();

          };


        ws.onerror =
          () => {

            if (
              settled
            ) {
              return;
            }


            settled =
              true;


            clearTimeout(
              timeout
            );


            reject(
              new Error(
                "Could not open the authenticated Deriv WebSocket."
              )
            );

          };

      }
    );


    ws.onmessage =
      event => {

        const message =
          parseMessage(
            event.data
          );


        handleAuthMessage(
          message
        );

      };


    ws.onerror =
      () => {

        emit(
          "error",
          {

            message:
              "Authenticated Deriv connection error."

          }
        );

      };


    ws.onclose =
      () => {

        state.authenticated =
          false;


        state.authWs =
          null;


        emit(
          "status",
          {

            connected:
              false,

            authenticated:
              false

          }
        );


        if (
          !state.manuallyClosedAuth
        ) {

          emit(
            "authDisconnected",
            true
          );

        }

      };


    return state.account;

  }


  /* ==========================================================
     AUTH MESSAGE HANDLER
     ========================================================== */

  function handleAuthMessage(
    message
  ) {

    if (!message) {
      return;
    }


    /*
      Always expose raw messages.
    */
    emit(
      "message",
      message
    );


    /*
      Errors.
    */
    if (
      message.error
    ) {

      emit(
        "error",
        message.error
      );


      if (
        message.req_id
      ) {

        const pending =
          state.pending.get(
            message.req_id
          );


        if (
          pending
        ) {

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


    /*
      Balance.
    */
    if (
      message.msg_type ===
      "balance"
    ) {

      emit(
        "balance",
        message.balance
      );

    }


    /*
      Proposal.
    */
    if (
      message.msg_type ===
      "proposal"
    ) {

      state.proposal =
        message.proposal ||
        null;


      state.activeProposalId =
        message.proposal?.id ||
        null;


      emit(
        "proposal",
        state.proposal
      );

    }


    /*
      Buy.
    */
    if (
      message.msg_type ===
      "buy"
    ) {

      const buy =
        message.buy ||
        null;


      if (
        buy?.contract_id
      ) {

        state.currentContract =
          buy;


        state.openContracts.set(
          String(
            buy.contract_id
          ),
          buy
        );

      }


      emit(
        "buy",
        buy
      );

    }


    /*
      Open contract updates.
    */
    if (
      message.msg_type ===
      "proposal_open_contract"
    ) {

      const contract =
        message.proposal_open_contract ||
        null;


      if (
        contract?.contract_id
      ) {

        const id =
          String(
            contract.contract_id
          );


        state.openContracts.set(
          id,
          contract
        );


        state.currentContract =
          contract;


        if (
          contract.is_sold
        ) {

          state.openContracts.delete(
            id
          );

        }

      }


      emit(
        "contract",
        contract
      );

    }


    /*
      Portfolio.
    */
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


      contracts.forEach(
        contract => {

          if (
            contract?.contract_id
          ) {

            state.openContracts.set(
              String(
                contract.contract_id
              ),
              contract
            );

          }

        }
      );


      emit(
        "portfolio",
        {

          ...message.portfolio,

          contracts

        }
      );

    }


    /*
      Statement.
    */
    if (
      message.msg_type ===
      "statement"
    ) {

      emit(
        "statement",
        message.statement
      );

    }


    /*
      Profit table.
    */
    if (
      message.msg_type ===
      "profit_table"
    ) {

      emit(
        "profitTable",
        message.profit_table
      );

    }


    /*
      Sell response.
    */
    if (
      message.msg_type ===
      "sell"
    ) {

      emit(
        "sell",
        message.sell
      );

    }


    /*
      Contract update.
    */
    if (
      message.msg_type ===
      "contract_update"
    ) {

      emit(
        "contractUpdate",
        message.contract_update
      );

    }


    /*
      Generic request resolution.
    */
    if (
      message.req_id
    ) {

      const pending =
        state.pending.get(
          message.req_id
        );


      if (
        pending
      ) {

        pending.resolve(
          message
        );

        state.pending.delete(
          message.req_id
        );

      }

    }

  }


  /* ==========================================================
     AUTH SEND WITH REQUEST TRACKING
     ========================================================== */

  function authRequest(
    payload,
    timeoutMs = 15000
  ) {

    return new Promise(
      (
        resolve,
        reject
      ) => {

        if (
          !state.authWs ||
          state.authWs.readyState !==
          WebSocket.OPEN
        ) {

          reject(
            new Error(
              "Real Deriv account is not connected."
            )
          );

          return;

        }


        const req_id =
          nextReqId();


        const timer =
          setTimeout(
            () => {

              state.pending.delete(
                req_id
              );


              reject(
                new Error(
                  "Deriv request timed out."
                )
              );

            },
            timeoutMs
          );


        state.pending.set(
          req_id,
          {

            resolve:
              value => {

                clearTimeout(
                  timer
                );

                resolve(
                  value
                );

              },

            reject:
              error => {

                clearTimeout(
                  timer
                );

                reject(
                  error
                );

              }

          }
        );


        try {

          state.authWs.send(
            JSON.stringify(
              {

                ...payload,

                req_id

              }
            )
          );

        } catch (error) {

          clearTimeout(
            timer
          );

          state.pending.delete(
            req_id
          );

          reject(
            error
          );

        }

      }
    );

  }


  /* ==========================================================
     DISCONNECT AUTH
     ========================================================== */

  function disconnectAuthenticated() {

    state.manuallyClosedAuth =
      true;


    state.authenticated =
      false;


    state.account =
      null;


    state.openContracts.clear();


    state.currentContract =
      null;


    state.authWs &&
      (() => {

        try {

          state.authWs.close();

        } catch (_) {}

      })();


    state.authWs =
      null;


    emit(
      "status",
      {

        connected:
          false,

        authenticated:
          false

      }
    );

  }


  /* ==========================================================
     BALANCE
     ========================================================== */

  function subscribeBalance() {

    return authRequest({

      balance:
        1,

      subscribe:
        1

    });

  }


  /* ==========================================================
     PROPOSAL
     ========================================================== */

  function validateContractType(
    contractType
  ) {

    if (
      typeof contractType !==
      "string" ||
      !contractType.trim()
    ) {

      throw new Error(
        "A contract type is required."
      );

    }

  }


  function getProposal(
    params = {}
  ) {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Connect a real Deriv account first."
      );

    }


    validateContractType(
      params.contractType
    );


    const amount =
      Number(
        params.amount
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      throw new Error(
        "Stake must be greater than zero."
      );

    }


    const duration =
      Number(
        params.duration
      );


    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {

      throw new Error(
        "Duration must be greater than zero."
      );

    }


    if (
      !params.symbol
    ) {

      throw new Error(
        "A Deriv market symbol is required."
      );

    }


    const contractType =
      String(
        params.contractType
      );


    /*
      Current Deriv API uses:
        underlying_symbol

      not:
        symbol
    */
    const request = {

      proposal:
        1,

      amount,

      basis:
        params.basis ||
        "stake",

      contract_type:
        contractType,

      currency:
        params.currency ||
        "USD",

      duration,

      duration_unit:
        params.durationUnit ||
        "t",

      underlying_symbol:
        params.symbol,

      subscribe:
        1

    };


    /*
      Digit prediction contracts use barrier.
    */
    if (
      PREDICTION_CONTRACTS.includes(
        contractType
      ) &&
      params.barrier !==
        undefined &&
      params.barrier !==
        null &&
      params.barrier !==
        ""
    ) {

      request.barrier =
        String(
          params.barrier
        );

    }


    state.proposal =
      null;


    state.activeProposalId =
      null;


    return authRequest(
      request
    );

  }


  /* ==========================================================
     BUY CONTRACT
     ========================================================== */

  function buyContract(
    proposalId,
    price
  ) {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Real Deriv account is not connected."
      );

    }


    if (
      !proposalId
    ) {

      throw new Error(
        "Missing Deriv proposal ID."
      );

    }


    const buyPrice =
      Number(price);


    if (
      !Number.isFinite(buyPrice) ||
      buyPrice <= 0
    ) {

      throw new Error(
        "Invalid contract price."
      );

    }


    /*
      This is the actual Deriv trading
      operation.
    */
    return authRequest({

      buy:
        String(
          proposalId
        ),

      price:
        buyPrice

    });

  }


  /* ==========================================================
     MONITOR CONTRACT
     ========================================================== */

  function monitorContract(
    contractId
  ) {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Real Deriv account is not connected."
      );

    }


    const id =
      Number(
        contractId
      );


    if (
      !Number.isFinite(id)
    ) {

      throw new Error(
        "Invalid contract ID."
      );

    }


    return authRequest({

      proposal_open_contract:
        1,

      contract_id:
        id,

      subscribe:
        1

    });

  }


  /* ==========================================================
     SELL OPEN CONTRACT
     ========================================================== */

  function sellContract(
    contractId,
    price = 0
  ) {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Real Deriv account is not connected."
      );

    }


    const id =
      Number(
        contractId
      );


    if (
      !Number.isFinite(id)
    ) {

      throw new Error(
        "Invalid contract ID."
      );

    }


    const sellPrice =
      Number(price);


    if (
      !Number.isFinite(
        sellPrice
      ) ||
      sellPrice < 0
    ) {

      throw new Error(
        "Invalid sell price."
      );

    }


    /*
      price = 0 means sell at market.
    */
    return authRequest({

      sell:
        id,

      price:
        sellPrice

    });

  }


  /* ==========================================================
     PORTFOLIO
     ========================================================== */

  function getPortfolio() {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Real Deriv account is not connected."
      );

    }


    return authRequest({

      portfolio:
        1

    });

  }


  /* ==========================================================
     STATEMENT
     ========================================================== */

  function getStatement(
    options = {}
  ) {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Real Deriv account is not connected."
      );

    }


    const request = {

      statement:
        1,

      limit:
        Number(
          options.limit ||
          100
        ),

      description:
        options.description ===
        undefined
          ? 1
          : Number(
              options.description
            )

    };


    if (
      options.actionType
    ) {

      request.action_type =
        options.actionType;

    }


    if (
      options.dateFrom !==
      undefined
    ) {

      request.date_from =
        Number(
          options.dateFrom
        );

    }


    if (
      options.dateTo !==
      undefined
    ) {

      request.date_to =
        Number(
          options.dateTo
        );

    }


    return authRequest(
      request
    );

  }


  /* ==========================================================
     PROFIT TABLE
     ========================================================== */

  function getProfitTable(
    options = {}
  ) {

    if (
      !state.authenticated
    ) {

      throw new Error(
        "Real Deriv account is not connected."
      );

    }


    const request = {

      profit_table:
        1,

      limit:
        Number(
          options.limit ||
          100
        )

    };


    if (
      options.dateFrom !==
      undefined
    ) {

      request.date_from =
        Number(
          options.dateFrom
        );

    }


    if (
      options.dateTo !==
      undefined
    ) {

      request.date_to =
        Number(
          options.dateTo
        );

    }


    if (
      options.contractType
    ) {

      request.contract_type =
        options.contractType;

    }


    return authRequest(
      request
    );

  }


  /* ==========================================================
     ACTIVE SYMBOLS
     ========================================================== */

  function getActiveSymbols() {

    if (
      state.authenticated
    ) {

      return authRequest({

        active_symbols:
          "brief"

      });

    }


    return publicSend({

      active_symbols:
        "brief"

    });

  }


  /* ==========================================================
     CONTRACTS FOR
     ========================================================== */

  function getContractsFor(
    symbol = state.symbol
  ) {

    if (
      !symbol
    ) {

      throw new Error(
        "Market symbol is required."
      );

    }


    if (
      state.authenticated
    ) {

      return authRequest({

        contracts_for:
          symbol

      });

    }


    return publicSend({

      contracts_for:
        symbol

    });

  }


  /* ==========================================================
     CHANGE MARKET
     ========================================================== */

  function changeSymbol(
    symbol
  ) {

    if (
      !symbol
    ) {

      throw new Error(
        "Market symbol is required."
      );

    }


    state.symbol =
      symbol;


    state.proposal =
      null;


    state.activeProposalId =
      null;


    connectPublic(
      symbol
    );


    emit(
      "symbolChanged",
      symbol
    );

  }


  /* ==========================================================
     DIGIT STATISTICS
     ========================================================== */

  function getDigitStats() {

    const total =
      state.recentDigits.length;


    const percentages =
      state.digits.map(
        count =>
          total > 0
            ? (
                count /
                total
              ) *
              100
            : 0
      );


    return {

      counts:
        [...state.digits],

      percentages,

      total,

      lastDigit:
        state.lastDigit,

      previousDigit:
        state.previousDigit

    };

  }


  /* ==========================================================
     RECENT TICKS
     ========================================================== */

  function getRecentTicks() {

    return [
      ...state.recentTicks
    ];

  }


  /* ==========================================================
     OPEN CONTRACTS
     ========================================================== */

  function getOpenContracts() {

    return Array.from(
      state.openContracts.values()
    );

  }


  /* ==========================================================
     CURRENT CONTRACT
     ========================================================== */

  function getCurrentContract() {

    return state.currentContract;

  }


  /* ==========================================================
     CONNECTION INFO
     ========================================================== */

  function getConnectionInfo() {

    return {

      authenticated:
        state.authenticated,

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

      symbol:
        state.symbol,

      account:
        state.account

    };

  }


  /* ==========================================================
     FORCE ACCOUNT RECONNECT
     ========================================================== */

  async function reconnectAuthenticated() {

    disconnectAuthenticated();

    return connectAuthenticated();

  }


  /* ==========================================================
     CLEANUP
     ========================================================== */

  function destroy() {

    disconnectPublic();

    disconnectAuthenticated();


    state.pending.forEach(
      pending => {

        try {

          pending.reject(
            new Error(
              "Deriv engine destroyed."
            )
          );

        } catch (_) {}

      }
    );


    state.pending.clear();

  }


  /* ==========================================================
     PUBLIC API
     ========================================================== */

  window.PELI_DERIV = {

    /* events */

    on,


    /* market */

    connect:
      connectPublic,

    disconnect:
      disconnectPublic,

    changeSymbol,

    getActiveSymbols,

    getContractsFor,


    /* account */

    connectAuthenticated,

    reconnectAuthenticated,

    disconnectAuthenticated,

    subscribeBalance,


    /* trading */

    getProposal,

    buyContract,

    monitorContract,

    sellContract,


    /* account data */

    getPortfolio,

    getStatement,

    getProfitTable,


    /* statistics */

    getDigitStats,

    getRecentTicks,

    getOpenContracts,

    getCurrentContract,

    getConnectionInfo,


    /* cleanup */

    destroy,


    /* compatibility getters */

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


  /* ==========================================================
     START PUBLIC MARKET
     ========================================================== */

  connectPublic(
    state.symbol
  );


})();
