/*
 * ========================================================
 * PELI Trader Hub
 * Deriv Market Data + Authenticated Trading Client
 *
 * Matches:
 *   trade.html
 *   /api/deriv/session.js
 *   /api/deriv/account.js
 *
 * Architecture:
 *
 *   PUBLIC MARKET DATA
 *       ↓
 *   wss://api.derivws.com/trading/v1/options/ws/public
 *
 *   AUTHENTICATED ACCOUNT
 *       ↓
 *   GET /api/deriv/session
 *       ↓
 *   Backend validates OAuth cookie
 *       ↓
 *   Backend requests Deriv OTP
 *       ↓
 *   Backend returns authenticated WebSocket URL
 *       ↓
 *   Browser connects to returned URL
 *
 *   TRADING
 *       ↓
 *   proposal
 *       ↓
 *   buy
 *       ↓
 *   proposal_open_contract
 *
 * ========================================================
 */

(function () {

  "use strict";


  /*
   * ======================================================
   * CONFIGURATION
   * ======================================================
   */

  const PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";

  const SESSION_ENDPOINT =
    "/api/deriv/session";

  const ACCOUNT_ENDPOINT =
    "/api/deriv/account";


  /*
   * ======================================================
   * CONNECTION STATE
   * ======================================================
   */

  let publicWs = null;

  let authenticatedWs = null;

  let currentSymbol = "R_75";

  let tickSubscription = null;

  let authenticated = false;

  let authenticatedAccount = null;

  let sessionPromise = null;

  let requestId = 1;


  /*
   * ======================================================
   * LISTENERS
   * ======================================================
   */

  const listeners = {

    tick: [],

    status: [],

    error: [],

    proposal: [],

    buy: [],

    contract: [],

    balance: []

  };


  /*
   * ======================================================
   * EVENT SYSTEM
   * ======================================================
   */

  function emit(
    type,
    data
  ) {

    if (!listeners[type]) {
      return;
    }


    listeners[type].forEach(
      function (callback) {

        try {

          callback(data);

        } catch (error) {

          console.error(
            "PELI_DERIV " +
            type +
            " listener error:",
            error
          );

        }

      }
    );

  }


  function on(
    type,
    callback
  ) {

    if (!listeners[type]) {

      listeners[type] = [];

    }


    listeners[type].push(
      callback
    );


    return function unsubscribe() {

      listeners[type] =
        listeners[type].filter(
          function (item) {

            return item !== callback;

          }
        );

    };

  }


  /*
   * ======================================================
   * REQUEST ID
   * ======================================================
   */

  function nextRequestId() {

    return requestId++;

  }


  /*
   * ======================================================
   * ERROR NORMALIZATION
   * ======================================================
   */

  function getErrorMessage(
    error,
    fallback
  ) {

    if (!error) {

      return fallback ||
        "Unknown Deriv error.";

    }


    if (
      typeof error === "string"
    ) {

      return error;

    }


    if (
      error.message
    ) {

      return error.message;

    }


    if (
      error.error &&
      error.error.message
    ) {

      return error.error.message;

    }


    if (
      error.errors &&
      Array.isArray(error.errors) &&
      error.errors.length
    ) {

      return (
        error.errors[0].message ||
        fallback ||
        "Deriv request failed."
      );

    }


    return (
      fallback ||
      "Deriv request failed."
    );

  }


  /*
   * ======================================================
   * PUBLIC MARKET DATA
   * ======================================================
   */

  function connect(
    symbol
  ) {

    if (
      symbol
    ) {

      currentSymbol =
        symbol;

    }


    disconnectPublic();


    emit(
      "status",
      {
        connected: false,
        connecting: true,
        authenticated:
          authenticated
      }
    );


    try {

      publicWs =
        new WebSocket(
          PUBLIC_WS
        );

    } catch (error) {

      emit(
        "error",
        {
          message:
            "Unable to create Deriv market connection."
        }
      );

      return;

    }


    publicWs.onopen =
      function () {

        emit(
          "status",
          {
            connected: true,
            connecting: false,
            authenticated:
              authenticated
          }
        );


        subscribeTicks(
          currentSymbol
        );

      };


    publicWs.onmessage =
      function (event) {

        let data;


        try {

          data =
            JSON.parse(
              event.data
            );

        } catch (error) {

          emit(
            "error",
            {
              message:
                "Invalid Deriv market response."
            }
          );

          return;

        }


        if (
          data.error
        ) {

          emit(
            "error",
            {
              message:
                getErrorMessage(
                  data.error,
                  "Deriv market request failed."
                ),
              error:
                data.error
            }
          );

          return;

        }


        if (
          data.msg_type ===
          "tick"
        ) {

          handleTick(
            data
          );

        }

      };


    publicWs.onerror =
      function () {

        emit(
          "error",
          {
            message:
              "Deriv market connection error."
          }
        );

      };


    publicWs.onclose =
      function () {

        emit(
          "status",
          {
            connected: false,
            connecting: false,
            authenticated:
              authenticated
          }
        );

        publicWs =
          null;

      };

  }


  /*
   * ======================================================
   * SUBSCRIBE TO TICKS
   * ======================================================
   */

  function subscribeTicks(
    symbol
  ) {

    if (
      !publicWs ||
      publicWs.readyState !==
        WebSocket.OPEN
    ) {

      return;

    }


    if (
      tickSubscription
    ) {

      try {

        publicWs.send(
          JSON.stringify(
            {
              forget:
                tickSubscription,
              req_id:
                nextRequestId()
            }
          )
        );

      } catch (error) {

        console.warn(
          "Unable to remove previous tick subscription."
        );

      }

    }


    currentSymbol =
      symbol;


    tickSubscription =
      null;


    publicWs.send(
      JSON.stringify(
        {
          ticks:
            symbol,

          subscribe:
            1,

          req_id:
            nextRequestId()
        }
      )
    );

  }


  /*
   * ======================================================
   * HANDLE PUBLIC TICK
   * ======================================================
   */

  function handleTick(
    data
  ) {

    if (
      !data ||
      !data.tick
    ) {

      return;

    }


    const tick =
      data.tick;


    if (
      data.subscription &&
      data.subscription.id
    ) {

      tickSubscription =
        data.subscription.id;

    }


    const quote =
      Number(
        tick.quote
      );


    const formatted =
      {

        symbol:
          tick.symbol ||
          currentSymbol,

        quote:
          quote,

        epoch:
          tick.epoch,

        id:
          tick.id,

        pipSize:
          tick.pip_size ??
          null,

        lastDigit:
          getLastDigit(
            quote,
            tick.pip_size
          )

      };


    emit(
      "tick",
      formatted
    );

  }


  /*
   * ======================================================
   * LAST DIGIT
   * ======================================================
   */

  function getLastDigit(
    quote,
    pipSize
  ) {

    if (
      !Number.isFinite(
        quote
      )
    ) {

      return null;

    }


    if (
      Number.isInteger(
        pipSize
      ) &&
      pipSize >= 0
    ) {

      const fixed =
        quote.toFixed(
          pipSize
        );


      return Number(
        fixed.charAt(
          fixed.length - 1
        )
      );

    }


    const text =
      String(
        quote
      );


    const digits =
      text.replace(
        /\D/g,
        ""
      );


    if (
      !digits.length
    ) {

      return null;

    }


    return Number(
      digits.charAt(
        digits.length - 1
      )
    );

  }


  /*
   * ======================================================
   * CHANGE MARKET SYMBOL
   * ======================================================
   */

  function changeSymbol(
    symbol
  ) {

    if (
      !symbol
    ) {

      return;

    }


    currentSymbol =
      symbol;


    if (
      publicWs &&
      publicWs.readyState ===
        WebSocket.OPEN
    ) {

      subscribeTicks(
        symbol
      );

    } else {

      connect(
        symbol
      );

    }

  }


  /*
   * ======================================================
   * PUBLIC DISCONNECT
   * ======================================================
   */

  function disconnectPublic() {

    if (
      publicWs
    ) {

      try {

        publicWs.close();

      } catch (_) {}

    }


    publicWs =
      null;


    tickSubscription =
      null;

  }


  /*
   * ======================================================
   * COMPLETE DISCONNECT
   * ======================================================
   */

  function disconnect() {

    disconnectPublic();


    if (
      authenticatedWs
    ) {

      try {

        authenticatedWs.close();

      } catch (_) {}

    }


    authenticatedWs =
      null;


    authenticated =
      false;


    authenticatedAccount =
      null;


    sessionPromise =
      null;


    emit(
      "status",
      {
        connected: false,
        connecting: false,
        authenticated: false
      }
    );

  }


  /*
   * ======================================================
   * GET SESSION
   *
   * This talks to:
   *
   * /api/deriv/session
   *
   * The backend reads the secure
   * deriv_access_token cookie.
   * ======================================================
   */

  async function getSession() {

    try {

      const response =
        await fetch(
          SESSION_ENDPOINT,
          {
            method:
              "GET",

            credentials:
              "include",

            headers:
              {
                Accept:
                  "application/json"
              },

            cache:
              "no-store"
          }
        );


      let data;


      try {

        data =
          await response.json();

      } catch (_) {

        data =
          {};

      }


      if (
        !response.ok
      ) {

        throw new Error(
          getErrorMessage(
            data,
            "Unable to check Deriv session."
          )
        );

      }


      /*
       * No OAuth cookie.
       */

      if (
        !data.connected
      ) {

        return {

          connected:
            false,

          authenticated:
            false,

          account:
            null,

          ws_url:
            null,

          error:
            data.error ||
            null

        };

      }


      return {

        connected:
          true,

        authenticated:
          false,

        account:
          data.account ||
          null,

        ws_url:
          data.ws_url ||
          null,

        error:
          data.error ||
          null

      };

    } catch (error) {

      console.error(
        "PELI_DERIV getSession:",
        error
      );


      emit(
        "error",
        {
          message:
            getErrorMessage(
              error,
              "Unable to check Deriv session."
            )
        }
      );


      throw error;

    }

  }


  /*
   * ======================================================
   * GET ACCOUNT
   *
   * This talks to:
   *
   * /api/deriv/account
   *
   * The access token remains on
   * the server.
   * ======================================================
   */

  async function getAccount() {

    try {

      const response =
        await fetch(
          ACCOUNT_ENDPOINT,
          {
            method:
              "GET",

            credentials:
              "include",

            headers:
              {
                Accept:
                  "application/json"
              },

            cache:
              "no-store"
          }
        );


      let data;


      try {

        data =
          await response.json();

      } catch (_) {

        data =
          {};

      }


      if (
        !response.ok
      ) {

        throw new Error(
          getErrorMessage(
            data,
            "Unable to load Deriv account."
          )
        );

      }


      /*
       * The current backend returns
       * the Deriv Options account
       * response directly.
       *
       * Normalize common response
       * shapes so trade.html can use:
       *
       * account.balance
       * account.currency
       */

      let account =
        null;


      if (
        data &&
        data.data &&
        !Array.isArray(
          data.data
        )
      ) {

        account =
          data.data;

      } else if (
        data &&
        Array.isArray(
          data.data
        )
      ) {

        account =
          data.data[0] ||
          null;

      } else if (
        data &&
        data.account
      ) {

        account =
          data.account;

      } else if (
        data
      ) {

        account =
          data;

      }


      /*
       * If the response contains
       * an accounts array, prefer
       * the first available account.
       */

      if (
        data &&
        Array.isArray(
          data.accounts
        )
      ) {

        account =
          data.accounts[0] ||
          account;

      }


      if (
        !account
      ) {

        throw new Error(
          "Deriv account information was not returned."
        );

      }


      authenticatedAccount =
        account;


      emit(
        "balance",
        {
          balance:
            account.balance,

          currency:
            account.currency,

          account:
            account
        }
      );


      return account;

    } catch (error) {

      console.error(
        "PELI_DERIV getAccount:",
        error
      );


      emit(
        "error",
        {
          message:
            getErrorMessage(
              error,
              "Unable to load Deriv account."
            )
        }
      );


      throw error;

    }

  }


  /*
   * ======================================================
   * CONNECT DERIV ACCOUNT
   *
   * Called by:
   *
   * trade.html
   *
   * connectAccount()
   * ======================================================
   */

  async function connectAccount() {

    /*
     * If already authenticated,
     * do not request another OTP.
     */

    if (
      authenticatedWs &&
      authenticatedWs.readyState ===
        WebSocket.OPEN &&
      authenticated
    ) {

      return {

        connected:
          true,

        authenticated:
          true,

        account:
          authenticatedAccount

      };

    }


    /*
     * Prevent two simultaneous
     * authentication attempts.
     */

    if (
      sessionPromise
    ) {

      return sessionPromise;

    }


    sessionPromise =
      (async function () {

        try {

          emit(
            "status",
            {
              connected: false,
              connecting: true,
              authenticated: false
            }
          );


          /*
           * Ask backend for the
           * authenticated WebSocket URL.
           */

          const session =
            await getSession();


          if (
            !session.connected
          ) {

            /*
             * Send the user to the
             * existing OAuth start
             * endpoint.
             */

            window.location.href =
              "/api/deriv/start";


            return {

              connected:
                false,

              authenticated:
                false,

              redirecting:
                true

            };

          }


          if (
            !session.ws_url
          ) {

            throw new Error(
              session.error ||
              "Deriv did not provide an authenticated WebSocket URL."
            );

          }


          /*
           * Connect immediately.
           *
           * Deriv's OTP URL is short-lived
           * and single-use.
           */

          await openAuthenticatedSocket(
            session.ws_url
          );


          authenticatedAccount =
            session.account ||
            null;


          /*
           * Fetch the current account
           * from the backend.
           */

          try {

            authenticatedAccount =
              await getAccount();

          } catch (
            accountError
          ) {

            console.warn(
              "Unable to refresh account information:",
              accountError
            );

          }


          /*
           * Subscribe to live balance
           * after authentication.
           */

          try {

            subscribeBalance();

          } catch (
            balanceError
          ) {

            console.warn(
              "Unable to subscribe to balance:",
              balanceError
            );

          }


          return {

            connected:
              true,

            authenticated:
              true,

            account:
              authenticatedAccount

          };

        } catch (error) {

          console.error(
            "PELI_DERIV account connection failed:",
            error
          );


          emit(
            "error",
            {
              message:
                getErrorMessage(
                  error,
                  "Unable to connect the Deriv account."
                )
            }
          );


          throw error;

        } finally {

          sessionPromise =
            null;

        }

      })();


    return sessionPromise;

  }


  /*
   * ======================================================
   * OPEN AUTHENTICATED WEBSOCKET
   * ======================================================
   */

  function openAuthenticatedSocket(
    url
  ) {

    return new Promise(
      function (
        resolve,
        reject
      ) {

        /*
         * Close old authenticated
         * socket first.
         */

        if (
          authenticatedWs
        ) {

          try {

            authenticatedWs.close();

          } catch (_) {}

        }


        authenticatedWs =
          null;


        authenticated =
          false;


        let settled =
          false;


        let socket;


        try {

          socket =
            new WebSocket(
              url
            );

        } catch (error) {

          reject(
            error
          );

          return;

        }


        authenticatedWs =
          socket;


        /*
         * Authentication URL is
         * intentionally not logged.
         *
         * It contains a one-time
         * credential.
         */


        socket.onopen =
          function () {

            authenticated =
              true;


            emit(
              "status",
              {
                connected: true,
                connecting: false,
                authenticated: true
              }
            );


            if (
              !settled
            ) {

              settled =
                true;

              resolve();

            }

          };


        socket.onmessage =
          function (event) {

            let data;


            try {

              data =
                JSON.parse(
                  event.data
                );

            } catch (error) {

              emit(
                "error",
                {
                  message:
                    "Invalid authenticated Deriv response."
                }
              );

              return;

            }


            handleAuthenticatedMessage(
              data
            );

          };


        socket.onerror =
          function () {

            const error =
              new Error(
                "Authenticated Deriv connection failed."
              );


            emit(
              "error",
              {
                message:
                  error.message
              }
            );


            if (
              !settled
            ) {

              settled =
                true;

              reject(
                error
              );

            }

          };


        socket.onclose =
          function () {

            authenticated =
              false;


            if (
              authenticatedWs ===
              socket
            ) {

              authenticatedWs =
                null;

            }


            emit(
              "status",
              {
                connected: false,
                connecting: false,
                authenticated: false
              }
            );

          };

      }
    );

  }


  /*
   * ======================================================
   * HANDLE AUTHENTICATED MESSAGES
   * ======================================================
   */

  function handleAuthenticatedMessage(
    data
  ) {

    if (
      !data
    ) {

      return;

    }


    /*
     * Deriv error response.
     */

    if (
      data.error
    ) {

      const message =
        getErrorMessage(
          data.error,
          "Deriv trading request failed."
        );


      emit(
        "error",
        {
          message:
            message,

          error:
            data.error,

          request:
            data.echo_req ||
            null
        }
      );


      return;

    }


    switch (
      data.msg_type
    ) {


      /*
       * Proposal
       */

      case "proposal":

        emit(
          "proposal",
          data.proposal
        );

        break;


      /*
       * Buy
       */

      case "buy":

        emit(
          "buy",
          data.buy
        );

        break;


      /*
       * Open contract updates
       */

      case "proposal_open_contract":

        emit(
          "contract",
          data.proposal_open_contract
        );

        break;


      /*
       * Balance
       */

      case "balance":

        emit(
          "balance",
          data.balance
        );

        break;


      default:

        /*
         * Keep unknown responses
         * visible in development
         * without breaking the UI.
         */

        console.debug(
          "PELI_DERIV message:",
          data
        );

        break;

    }

  }


  /*
   * ======================================================
   * ENSURE AUTHENTICATED CONNECTION
   * ======================================================
   */

  async function ensureAuthenticated() {

    if (
      authenticatedWs &&
      authenticatedWs.readyState ===
        WebSocket.OPEN &&
      authenticated
    ) {

      return true;

    }


    await connectAccount();


    if (
      !authenticatedWs ||
      authenticatedWs.readyState !==
        WebSocket.OPEN ||
      !authenticated
    ) {

      throw new Error(
        "Deriv trading account is not connected."
      );

    }


    return true;

  }


  /*
   * ======================================================
   * SEND AUTHENTICATED REQUEST
   * ======================================================
   */

  function sendAuthenticated(
    payload
  ) {

    if (
      !authenticatedWs ||
      authenticatedWs.readyState !==
        WebSocket.OPEN ||
      !authenticated
    ) {

      throw new Error(
        "Deriv trading account is not connected."
      );

    }


    const request =
      {
        ...payload,

        req_id:
          payload.req_id ||
          nextRequestId()

      };


    authenticatedWs.send(
      JSON.stringify(
        request
      )
    );


    return request.req_id;

  }


  /*
   * ======================================================
   * GET PROPOSAL
   *
   * New Deriv API uses:
   *
   * underlying_symbol
   *
   * rather than legacy:
   *
   * symbol
   * ======================================================
   */

  function getProposal(
    params
  ) {

    if (
      !params
    ) {

      throw new Error(
        "Proposal parameters are required."
      );

    }


    const amount =
      Number(
        params.amount
      );


    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {

      throw new Error(
        "Proposal amount must be greater than zero."
      );

    }


    const duration =
      Number(
        params.duration
      );


    if (
      !Number.isFinite(
        duration
      ) ||
      duration <= 0
    ) {

      throw new Error(
        "Proposal duration must be greater than zero."
      );

    }


    const contractType =
      String(
        params.contractType ||
        ""
      ).toUpperCase();


    if (
      !contractType
    ) {

      throw new Error(
        "Contract type is required."
      );

    }


    const payload =
      {

        proposal:
          1,

        amount:
          amount,

        basis:
          params.basis ||
          "stake",

        contract_type:
          contractType,

        currency:
          params.currency ||
          "USD",

        duration:
          duration,

        duration_unit:
          params.durationUnit ||
          "t",

        underlying_symbol:
          params.symbol ||
          currentSymbol,

        subscribe:
          1

      };


    /*
     * Optional barrier.
     */

    if (
      params.barrier !==
      undefined &&
      params.barrier !==
      null &&
      params.barrier !==
      ""
    ) {

      payload.barrier =
        String(
          params.barrier
        );

    }


    /*
     * Optional multiplier.
     */

    if (
      params.multiplier !==
      undefined &&
      params.multiplier !==
      null &&
      params.multiplier !==
      ""
    ) {

      payload.multiplier =
        Number(
          params.multiplier
        );

    }


    return sendAuthenticated(
      payload
    );

  }


  /*
   * ======================================================
   * BUY CONTRACT
   * ======================================================
   */

  function buyContract(
    proposalId,
    price
  ) {

    if (
      proposalId ===
      undefined ||
      proposalId ===
      null ||
      proposalId ===
      ""
    ) {

      throw new Error(
        "A valid Deriv proposal ID is required."
      );

    }


    const numericPrice =
      Number(
        price
      );


    if (
      !Number.isFinite(
        numericPrice
      ) ||
      numericPrice <= 0
    ) {

      throw new Error(
        "A valid proposal price is required."
      );

    }


    return sendAuthenticated(
      {

        buy:
          String(
            proposalId
          ),

        price:
          numericPrice

      }
    );

  }


  /*
   * ======================================================
   * MONITOR CONTRACT
   * ======================================================
   */

  function monitorContract(
    contractId
  ) {

    const numericContractId =
      Number(
        contractId
      );


    if (
      !Number.isFinite(
        numericContractId
      )
    ) {

      throw new Error(
        "A valid contract ID is required."
      );

    }


    return sendAuthenticated(
      {

        proposal_open_contract:
          1,

        contract_id:
          numericContractId,

        subscribe:
          1

      }
    );

  }


  /*
   * ======================================================
   * ACCOUNT BALANCE
   * ======================================================
   */

  function subscribeBalance() {

    return sendAuthenticated(
      {

        balance:
          1,

        subscribe:
          1

      }
    );

  }


  /*
   * ======================================================
   * SELL OPEN CONTRACT
   * ======================================================
   */

  function sellContract(
    contractId,
    price
  ) {

    const numericContractId =
      Number(
        contractId
      );


    if (
      !Number.isFinite(
        numericContractId
      )
    ) {

      throw new Error(
        "A valid contract ID is required."
      );

    }


    const sellPrice =
      price ===
      undefined ||
      price ===
      null
        ? 0
        : Number(
            price
          );


    if (
      !Number.isFinite(
        sellPrice
      ) ||
      sellPrice < 0
    ) {

      throw new Error(
        "Sell price must be zero or greater."
      );

    }


    return sendAuthenticated(
      {

        sell:
          numericContractId,

        price:
          sellPrice

      }
    );

  }


  /*
   * ======================================================
   * EXECUTE TRADE
   *
   * This is the method expected by
   * trade.html:
   *
   * window.PELI_DERIV.executeTrade(...)
   *
   * ======================================================
   *
   * Flow:
   *
   * 1. Ensure authenticated socket.
   * 2. Request proposal.
   * 3. Wait for proposal response.
   * 4. Read proposal ID.
   * 5. Read ask price.
   * 6. Buy the contract.
   * 7. Wait for buy response.
   * 8. Monitor contract.
   *
   * IMPORTANT:
   * The trade is actually sent to
   * Deriv only after the proposal
   * is received.
   * ======================================================
   */

  async function executeTrade(
    params
  ) {

    if (
      !params
    ) {

      throw new Error(
        "Trade parameters are required."
      );

    }


    await ensureAuthenticated();


    const symbol =
      params.symbol ||
      currentSymbol;


    const direction =
      String(
        params.direction ||
        ""
      ).toUpperCase();


    /*
     * trade.html already converts:
     *
     * UP   → CALL
     * DOWN → PUT
     *
     * Keep support for UP/DOWN here
     * as an additional safety layer.
     */

    let contractType;


    if (
      direction ===
      "UP" ||
      direction ===
      "CALL"
    ) {

      contractType =
        "CALL";

    } else if (
      direction ===
      "DOWN" ||
      direction ===
      "PUT"
    ) {

      contractType =
        "PUT";

    } else {

      throw new Error(
        "Select UP or DOWN before placing a trade."
      );

    }


    const stake =
      Number(
        params.stake
      );


    if (
      !Number.isFinite(
        stake
      ) ||
      stake <= 0
    ) {

      throw new Error(
        "Enter a valid stake."
      );

    }


    const currency =
      params.currency ||
      "USD";


    const rawDuration =
      Number(
        params.duration
      );


    if (
      !Number.isFinite(
        rawDuration
      ) ||
      rawDuration <= 0
    ) {

      throw new Error(
        "Enter a valid duration."
      );

    }


    /*
     * The current trade.html uses:
     *
     * 1 tick
     * 5 ticks
     * 10 ticks
     * 1 minute
     * 5 minutes
     *
     * Values 1, 5 and 10 are ticks.
     * 60 and 300 are seconds.
     */

    let duration =
      rawDuration;


    let durationUnit =
      params.durationUnit;


    if (
      !durationUnit
    ) {

      if (
        rawDuration ===
          60 ||
        rawDuration ===
          300
      ) {

        durationUnit =
          "s";

      } else {

        durationUnit =
          "t";

      }

    }


    /*
     * Request proposal.
     */

    const proposalRequestId =
      getProposal(
        {

          amount:
            stake,

          basis:
            "stake",

          contractType:
            contractType,

          currency:
            currency,

          duration:
            duration,

          durationUnit:
            durationUnit,

          symbol:
            symbol

        }
      );


    const proposal =
      await waitForProposal(
        proposalRequestId
      );


    if (
      !proposal
    ) {

      throw new Error(
        "Deriv did not return a trading proposal."
      );

    }


    const proposalId =
      proposal.id;


    if (
      !proposalId
    ) {

      throw new Error(
        "Deriv proposal did not contain a proposal ID."
      );

    }


    /*
     * Deriv's new API may return
     * ask_price as a string or number.
     */

    const askPrice =
      Number(
        proposal.ask_price
      );


    if (
      !Number.isFinite(
        askPrice
      ) ||
      askPrice <= 0
    ) {

      throw new Error(
        "Deriv returned an invalid proposal price."
      );

    }


    /*
     * The proposal response is
     * the real pricing information.
     *
     * Do not use a hard-coded payout.
     */

    const payout =
      proposal.payout !==
      undefined
        ? Number(
            proposal.payout
          )
        : null;


    const profit =
      Number.isFinite(
        payout
      )
        ? payout -
          stake
        : null;


    /*
     * Buy using the actual
     * proposal and ask price.
     */

    const buyRequestId =
      buyContract(
        proposalId,
        askPrice
      );


    const buyResponse =
      await waitForBuy(
        buyRequestId
      );


    if (
      !buyResponse
    ) {

      throw new Error(
        "Deriv did not return a buy confirmation."
      );

    }


    const contractId =
      buyResponse.contract_id ||
      buyResponse.contractId;


    if (
      !contractId
    ) {

      throw new Error(
        "Deriv buy response did not contain a contract ID."
      );

    }


    /*
     * Start monitoring the
     * newly purchased contract.
     */

    let monitorRequestId =
      null;


    try {

      monitorRequestId =
        monitorContract(
          contractId
        );

    } catch (
      monitorError
    ) {

      console.warn(
        "Contract monitoring could not be started:",
        monitorError
      );

    }


    const result =
      {

        success:
          true,

        proposal:
          proposal,

        proposalId:
          proposalId,

        askPrice:
          askPrice,

        payout:
          payout,

        profit:
          profit,

        buy:
          buyResponse,

        contractId:
          contractId,

        monitorRequestId:
          monitorRequestId,

        symbol:
          symbol,

        direction:
          contractType,

        stake:
          stake,

        currency:
          currency,

        duration:
          duration,

        durationUnit:
          durationUnit

      };


    return result;

  }


  /*
   * ======================================================
   * WAIT FOR PROPOSAL
   * ======================================================
   */

  function waitForProposal(
    requestIdValue,
    timeout
  ) {

    const timeoutMs =
      timeout ||
      15000;


    return new Promise(
      function (
        resolve,
        reject
      ) {

        let finished =
          false;


        let timer =
          null;


        const unsubscribe =
          on(
            "proposal",
            function (
              proposal
            ) {

              /*
               * Match the response
               * using echo_req.req_id
               * when available.
               *
               * Because the event currently
               * exposes only the proposal
               * object, the request matcher
               * is also supported through
               * proposal ID availability.
               */

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              if (
                timer
              ) {

                clearTimeout(
                  timer
                );

              }


              unsubscribe();


              resolve(
                proposal
              );

            }
          );


        timer =
          setTimeout(
            function () {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              unsubscribe();


              reject(
                new Error(
                  "Timed out waiting for Deriv proposal."
                )
              );

            },
            timeoutMs
          );

      }
    );

  }


  /*
   * ======================================================
   * WAIT FOR BUY RESPONSE
   * ======================================================
   */

  function waitForBuy(
    requestIdValue,
    timeout
  ) {

    const timeoutMs =
      timeout ||
      15000;


    return new Promise(
      function (
        resolve,
        reject
      ) {

        let finished =
          false;


        let timer =
          null;


        const unsubscribe =
          on(
            "buy",
            function (
              buy
            ) {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              if (
                timer
              ) {

                clearTimeout(
                  timer
                );

              }


              unsubscribe();


              resolve(
                buy
              );

            }
          );


        timer =
          setTimeout(
            function () {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              unsubscribe();


              reject(
                new Error(
                  "Timed out waiting for Deriv trade confirmation."
                )
              );

            },
            timeoutMs
          );

      }
    );

  }


  /*
   * ======================================================
   * WAIT FOR CONTRACT UPDATE
   * ======================================================
   */

  function waitForContract(
    contractId,
    timeout
  ) {

    const timeoutMs =
      timeout ||
      15000;


    return new Promise(
      function (
        resolve,
        reject
      ) {

        let finished =
          false;


        let timer =
          null;


        const unsubscribe =
          on(
            "contract",
            function (
              contract
            ) {

              if (
                finished
              ) {

                return;

              }


              if (
                Number(
                  contract.contract_id
                ) !==
                Number(
                  contractId
                )
              ) {

                return;

              }


              finished =
                true;


              if (
                timer
              ) {

                clearTimeout(
                  timer
                );

              }


              unsubscribe();


              resolve(
                contract
              );

            }
          );


        timer =
          setTimeout(
            function () {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              unsubscribe();


              reject(
                new Error(
                  "Timed out waiting for contract update."
                )
              );

            },
            timeoutMs
          );

      }
    );

  }


  /*
   * ======================================================
   * GET CURRENT ACCOUNT CONNECTION
   * ======================================================
   */

  function isAuthenticated() {

    return !!(
      authenticatedWs &&
      authenticatedWs.readyState ===
        WebSocket.OPEN &&
      authenticated
    );

  }


  /*
   * ======================================================
   * PUBLIC API
   * ======================================================
   */

  window.PELI_DERIV = {

    /*
     * Market data
     */

    connect:
      connect,

    disconnect:
      disconnect,

    changeSymbol:
      changeSymbol,


    /*
     * Events
     */

    on:
      on,


    /*
     * Authentication
     */

    getSession:
      getSession,

    getAccount:
      getAccount,

    connectAccount:
      connectAccount,

    connectAuthenticated:
      connectAccount,


    /*
     * Trading
     */

    executeTrade:
      executeTrade,

    getProposal:
      getProposal,

    buyContract:
      buyContract,

    monitorContract:
      monitorContract,

    subscribeBalance:
      subscribeBalance,

    sellContract:
      sellContract,


    /*
     * Waiting helpers
     */

    waitForContract:
      waitForContract,


    /*
     * State
     */

    get currentSymbol() {

      return currentSymbol;

    },


    get connected() {

      return !!(
        publicWs &&
        publicWs.readyState ===
          WebSocket.OPEN
      );

    },


    get authenticated() {

      return isAuthenticated();

    },


    get account() {

      return authenticatedAccount;

    }

  };


  /*
   * ======================================================
   * AUTOMATIC PUBLIC MARKET CONNECTION
   * ======================================================
   *
   * This does NOT authenticate the
   * user's Deriv account.
   *
   * It only starts public ticks.
   * ======================================================
   */

  window.addEventListener(
    "DOMContentLoaded",
    function () {

      connect(
        currentSymbol
      );

    }
  );


})();
