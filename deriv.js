/*
 * ============================================================
 * PELI Trader Hub
 * Deriv Options API Client
 * ============================================================
 *
 * Works with the current trade.html you provided.
 *
 * Expected backend endpoints:
 *
 *   GET /api/deriv/session
 *   GET /api/deriv/account
 *
 * The session endpoint is responsible for returning:
 *
 * {
 *   connected: true,
 *   account: {...},
 *   ws_url: "wss://..."
 * }
 *
 * Public market data:
 *
 *   wss://api.derivws.com/trading/v1/options/ws/public
 *
 * Authenticated trading:
 *
 *   The backend provides a short-lived authenticated
 *   WebSocket URL through /api/deriv/session.
 *
 * ============================================================
 */

(function () {

  "use strict";


  /*
   * ==========================================================
   * CONFIGURATION
   * ==========================================================
   */

  const PUBLIC_WS =
    "wss://api.derivws.com/trading/v1/options/ws/public";


  const SESSION_ENDPOINT =
    "/api/deriv/session";


  const ACCOUNT_ENDPOINT =
    "/api/deriv/account";


  /*
   * ==========================================================
   * CONNECTION STATE
   * ==========================================================
   */

  let publicSocket = null;

  let authenticatedSocket = null;

  let currentSymbol = "R_75";

  let tickSubscriptionId = null;

  let requestId = 1;

  let currentAccount = null;

  let authenticated = false;

  let reconnectTimer = null;

  let manualDisconnect = false;


  /*
   * ==========================================================
   * CALLBACK STORAGE
   * ==========================================================
   */

  let tickCallback = null;

  let statusCallback = null;


  /*
   * ==========================================================
   * EVENT LISTENERS
   * ==========================================================
   */

  const listeners = {

    tick: [],

    status: [],

    error: [],

    account: [],

    balance: [],

    proposal: [],

    buy: [],

    contract: []

  };


  function emit(
    type,
    data
  ) {

    if (
      !listeners[type]
    ) {

      return;

    }


    listeners[type].forEach(
      function (callback) {

        try {

          callback(data);

        } catch (error) {

          console.error(
            "PELI_DERIV listener error:",
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

    if (
      !listeners[type]
    ) {

      listeners[type] = [];

    }


    listeners[type].push(
      callback
    );


    return function () {

      listeners[type] =
        listeners[type].filter(
          function (item) {

            return item !== callback;

          }
        );

    };

  }


  /*
   * ==========================================================
   * REQUEST ID
   * ==========================================================
   */

  function nextRequestId() {

    return requestId++;

  }


  /*
   * ==========================================================
   * STATUS
   * ==========================================================
   */

  function sendStatus(
    text,
    connected,
    extra
  ) {

    const status = {

      text:
        text,

      connected:
        Boolean(connected),

      authenticated:
        authenticated

    };


    if (
      extra
    ) {

      Object.assign(
        status,
        extra
      );

    }


    if (
      typeof statusCallback ===
      "function"
    ) {

      try {

        statusCallback(
          text
        );

      } catch (error) {

        console.error(
          "Status callback error:",
          error
        );

      }

    }


    emit(
      "status",
      status
    );

  }


  /*
   * ==========================================================
   * PUBLIC MARKET CONNECTION
   * ==========================================================
   */

  function connect(
    symbol,
    onTick,
    onStatus
  ) {

    if (
      symbol
    ) {

      currentSymbol =
        symbol;

    }


    if (
      typeof onTick ===
      "function"
    ) {

      tickCallback =
        onTick;

    }


    if (
      typeof onStatus ===
      "function"
    ) {

      statusCallback =
        onStatus;

    }


    manualDisconnect =
      false;


    closePublicSocket();


    sendStatus(
      "Connecting",
      false
    );


    try {

      publicSocket =
        new WebSocket(
          PUBLIC_WS
        );

    } catch (error) {

      handlePublicError(
        error
      );

      return;

    }


    publicSocket.onopen =
      function () {

        sendStatus(
          "Connected",
          true
        );


        subscribeTicks(
          currentSymbol
        );

      };


    publicSocket.onmessage =
      function (event) {

        handlePublicMessage(
          event
        );

      };


    publicSocket.onerror =
      function (error) {

        handlePublicError(
          error
        );

      };


    publicSocket.onclose =
      function () {

        tickSubscriptionId =
          null;


        sendStatus(
          "Disconnected",
          false
        );


        if (
          !manualDisconnect
        ) {

          scheduleReconnect();

        }

      };

  }


  /*
   * ==========================================================
   * PUBLIC MESSAGE HANDLER
   * ==========================================================
   */

  function handlePublicMessage(
    event
  ) {

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
        data.error
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

  }


  /*
   * ==========================================================
   * SUBSCRIBE TO TICKS
   * ==========================================================
   */

  function subscribeTicks(
    symbol
  ) {

    if (
      !publicSocket ||
      publicSocket.readyState !==
        WebSocket.OPEN
    ) {

      return;

    }


    currentSymbol =
      symbol;


    /*
     * Remove the previous subscription
     * when changing markets.
     */

    if (
      tickSubscriptionId
    ) {

      try {

        publicSocket.send(
          JSON.stringify({

            forget:
              tickSubscriptionId

          })
        );

      } catch (error) {

        console.warn(
          "Unable to remove previous tick subscription."
        );

      }

    }


    tickSubscriptionId =
      null;


    try {

      publicSocket.send(
        JSON.stringify({

          ticks:
            symbol,

          subscribe:
            1,

          req_id:
            nextRequestId()

        })
      );

    } catch (error) {

      emit(
        "error",
        {
          message:
            "Unable to subscribe to market data."
        }
      );

    }

  }


  /*
   * ==========================================================
   * HANDLE TICK
   * ==========================================================
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

      tickSubscriptionId =
        data.subscription.id;

    }


    const quote =
      Number(
        tick.quote
      );


    if (
      !Number.isFinite(
        quote
      )
    ) {

      return;

    }


    const formattedTick = {

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


    /*
     * Callback used by your current
     * trade.html.
     */

    if (
      typeof tickCallback ===
      "function"
    ) {

      try {

        tickCallback(
          formattedTick
        );

      } catch (error) {

        console.error(
          "Tick callback error:",
          error
        );

      }

    }


    emit(
      "tick",
      formattedTick
    );

  }


  /*
   * ==========================================================
   * LAST DIGIT
   * ==========================================================
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
   * ==========================================================
   * CHANGE SYMBOL
   * ==========================================================
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
      publicSocket &&
      publicSocket.readyState ===
        WebSocket.OPEN
    ) {

      subscribeTicks(
        symbol
      );

    } else {

      connect(
        symbol,
        tickCallback,
        statusCallback
      );

    }

  }


  /*
   * ==========================================================
   * CLOSE PUBLIC SOCKET
   * ==========================================================
   */

  function closePublicSocket() {

    if (
      publicSocket
    ) {

      try {

        publicSocket.onclose =
          null;

        publicSocket.close();

      } catch (_) {}

    }


    publicSocket =
      null;


    tickSubscriptionId =
      null;

  }


  /*
   * ==========================================================
   * DISCONNECT
   * ==========================================================
   */

  function disconnect() {

    manualDisconnect =
      true;


    if (
      reconnectTimer
    ) {

      clearTimeout(
        reconnectTimer
      );

      reconnectTimer =
        null;

    }


    closePublicSocket();


    sendStatus(
      "Disconnected",
      false
    );

  }


  /*
   * ==========================================================
   * RECONNECT
   * ==========================================================
   */

  function scheduleReconnect() {

    if (
      reconnectTimer ||
      manualDisconnect
    ) {

      return;

    }


    reconnectTimer =
      setTimeout(
        function () {

          reconnectTimer =
            null;


          connect(
            currentSymbol,
            tickCallback,
            statusCallback
          );

        },
        5000
      );

  }


  /*
   * ==========================================================
   * PUBLIC SOCKET ERROR
   * ==========================================================
   */

  function handlePublicError(
    error
  ) {

    console.error(
      "Deriv market error:",
      error
    );


    emit(
      "error",
      {
        message:
          "Deriv market connection error."
      }
    );


    sendStatus(
      "Connection error",
      false
    );

  }


  /*
   * ==========================================================
   * GET SESSION
   * ==========================================================
   *
   * This matches:
   *
   *   await PELI_DERIV.getSession()
   *
   * from your current trade.html.
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

      } catch (error) {

        throw new Error(
          "Invalid response from Deriv session endpoint."
        );

      }


      if (
        !response.ok
      ) {

        throw new Error(
          data?.error ||
          "Unable to check Deriv session."
        );

      }


      /*
       * The backend returns:
       *
       * connected
       * account
       * ws_url
       */

      currentAccount =
        data?.account ||
        null;


      return {

        connected:
          Boolean(
            data?.connected &&
            data?.ws_url
          ),

        account:
          data?.account ||
          null,

        ws_url:
          data?.ws_url ||
          null,

        error:
          data?.error ||
          null

      };

    } catch (error) {

      console.error(
        "getSession failed:",
        error
      );


      return {

        connected:
          false,

        account:
          null,

        ws_url:
          null,

        error:
          error.message

      };

    }

  }


  /*
   * ==========================================================
   * GET ACCOUNT
   * ==========================================================
   *
   * Matches:
   *
   *   await PELI_DERIV.getAccount()
   *
   * from trade.html.
   *
   * Your backend endpoint returns the
   * Deriv Options accounts response.
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

      } catch (error) {

        throw new Error(
          "Invalid response from Deriv account endpoint."
        );

      }


      if (
        !response.ok
      ) {

        throw new Error(
          data?.error ||
          data?.errors?.[0]?.message ||
          "Unable to load Deriv account."
        );

      }


      /*
       * Your backend may return:
       *
       * {
       *   data: {
       *     accounts: [...]
       *   }
       * }
       *
       * or:
       *
       * {
       *   accounts: [...]
       * }
       */

      const accounts =
        data?.data?.accounts ||
        data?.accounts ||
        [];


      if (
        Array.isArray(
          accounts
        ) &&
        accounts.length
      ) {

        /*
         * Prefer demo because your
         * trade.html has Demo / Practice.
         */

        const demo =
          accounts.find(
            function (account) {

              return String(
                account?.account_type ||
                account?.type ||
                ""
              ).toLowerCase() ===
              "demo";

            }
          );


        currentAccount =
          demo ||
          accounts[0];

      } else if (
        data?.data &&
        !Array.isArray(
          data.data
        )
      ) {

        currentAccount =
          data.data;

      } else {

        currentAccount =
          null;

      }


      if (
        currentAccount
      ) {

        emit(
          "account",
          currentAccount
        );

      }


      return normalizeAccount(
        currentAccount
      );

    } catch (error) {

      console.error(
        "getAccount failed:",
        error
      );


      throw error;

    }

  }


  /*
   * ==========================================================
   * NORMALIZE ACCOUNT
   * ==========================================================
   *
   * Makes the result easier for trade.html
   * to use regardless of the exact Deriv
   * account response structure.
   */

  function normalizeAccount(
    account
  ) {

    if (
      !account
    ) {

      return null;

    }


    const balance =
      account.balance ??
      account.amount ??
      account.available_balance ??
      null;


    const currency =
      account.currency ??
      account.currency_code ??
      null;


    const accountId =
      account.account_id ??
      account.id ??
      null;


    return {

      ...account,

      balance:
        balance,

      currency:
        currency,

      account_id:
        accountId

    };

  }


  /*
   * ==========================================================
   * CONNECT ACCOUNT
   * ==========================================================
   *
   * Called by:
   *
   *   connectAccount()
   *
   * in trade.html.
   *
   * The OAuth flow itself is handled by
   * your backend.
   */

  async function connectAccount() {

    try {

      /*
       * Your project already has the
       * Deriv OAuth start endpoint.
       */

      window.location.href =
        "/api/deriv/start";

    } catch (error) {

      console.error(
        "Unable to start Deriv authentication:",
        error
      );


      emit(
        "error",
        {
          message:
            "Unable to start Deriv authentication."
        }
      );

    }

  }


  /*
   * ==========================================================
   * AUTHENTICATED CONNECTION
   * ==========================================================
   *
   * Gets the authenticated WebSocket URL
   * from /api/deriv/session.
   *
   * The OTP URL should be opened immediately.
   */

  async function connectAuthenticated() {

    const session =
      await getSession();


    if (
      !session ||
      !session.connected ||
      !session.ws_url
    ) {

      throw new Error(
        session?.error ||
        "Deriv account is not connected."
      );

    }


    await openAuthenticatedSocket(
      session.ws_url
    );


    return {

      connected:
        true,

      account:
        session.account ||
        null

    };

  }


  /*
   * ==========================================================
   * OPEN AUTHENTICATED SOCKET
   * ==========================================================
   */

  function openAuthenticatedSocket(
    wsUrl
  ) {

    return new Promise(
      function (
        resolve,
        reject
      ) {

        if (
          authenticatedSocket
        ) {

          try {

            authenticatedSocket.close();

          } catch (_) {}

        }


        authenticated =
          false;


        let settled =
          false;


        try {

          authenticatedSocket =
            new WebSocket(
              wsUrl
            );

        } catch (error) {

          reject(
            error
          );

          return;

        }


        authenticatedSocket.onopen =
          function () {

            authenticated =
              true;


            sendStatus(
              "Authenticated",
              true
            );


            /*
             * Automatically subscribe to
             * balance updates after authentication.
             */

            try {

              sendAuthenticated(
                {
                  balance:
                    1,

                  subscribe:
                    1
                }
              );

            } catch (error) {

              console.warn(
                "Balance subscription failed:",
                error
              );

            }


            if (
              !settled
            ) {

              settled =
                true;

              resolve();

            }

          };


        authenticatedSocket.onmessage =
          function (
            event
          ) {

            handleAuthenticatedMessage(
              event
            );

          };


        authenticatedSocket.onerror =
          function (
            error
          ) {

            console.error(
              "Authenticated Deriv WebSocket error:",
              error
            );


            authenticated =
              false;


            emit(
              "error",
              {
                message:
                  "Authenticated Deriv connection failed."
              }
            );


            if (
              !settled
            ) {

              settled =
                true;

              reject(
                new Error(
                  "Authenticated Deriv connection failed."
                )
              );

            }

          };


        authenticatedSocket.onclose =
          function () {

            authenticated =
              false;


            sendStatus(
              "Disconnected",
              false
            );


            authenticatedSocket =
              null;

          };

      }
    );

  }


  /*
   * ==========================================================
   * AUTHENTICATED MESSAGE HANDLER
   * ==========================================================
   */

  function handleAuthenticatedMessage(
    event
  ) {

    let data;


    try {

      data =
        JSON.parse(
          event.data
        );

    } catch (error) {

      console.warn(
        "Invalid authenticated Deriv response."
      );

      return;

    }


    if (
      data.error
    ) {

      console.error(
        "Deriv trading error:",
        data.error
      );


      emit(
        "error",
        data.error
      );


      return;

    }


    switch (
      data.msg_type
    ) {

      case "balance":

        emit(
          "balance",
          data.balance
        );

        break;


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


      case "tick":

        /*
         * Some authenticated sessions can
         * also return tick data.
         */

        handleTick(
          data
        );

        break;


      default:

        break;

    }

  }


  /*
   * ==========================================================
   * SEND AUTHENTICATED REQUEST
   * ==========================================================
   */

  function sendAuthenticated(
    payload
  ) {

    if (
      !authenticatedSocket ||
      authenticatedSocket.readyState !==
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


    authenticatedSocket.send(
      JSON.stringify(
        request
      )
    );


    return request.req_id;

  }


  /*
   * ==========================================================
   * EXECUTE TRADE
   * ==========================================================
   *
   * This is the function your current
   * trade.html calls:
   *
   *   PELI_DERIV.executeTrade({...})
   *
   * It performs:
   *
   * 1. Session verification
   * 2. Authenticated WebSocket connection
   * 3. Proposal request
   * 4. Waits for proposal
   * 5. Buys the proposal
   * 6. Returns the buy result
   *
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


    const symbol =
      params.symbol ||
      currentSymbol;


    const direction =
      params.direction;


    const stake =
      Number(
        params.stake
      );


    const duration =
      Number(
        params.duration
      );


    const currency =
      params.currency ||
      "USD";


    if (
      !symbol
    ) {

      throw new Error(
        "Trading symbol is required."
      );

    }


    if (
      direction !== "CALL" &&
      direction !== "PUT"
    ) {

      throw new Error(
        "Select UP or DOWN before trading."
      );

    }


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


    if (
      !Number.isFinite(
        duration
      ) ||
      duration <= 0
    ) {

      throw new Error(
        "Enter a valid duration."
      );

    }


    /*
     * Make sure the authenticated
     * WebSocket is connected.
     */

    if (
      !authenticated
    ) {

      await connectAuthenticated();

    }


    /*
     * Determine the contract type.
     *
     * CALL = UP
     * PUT  = DOWN
     *
     * This is appropriate for
     * Rise/Fall style contracts.
     */

    const contractType =
      direction === "CALL"
        ? "CALL"
        : "PUT";


    /*
     * Request a proposal.
     */

    const proposal =
      await requestProposal(
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
            "t",

          symbol:
            symbol

        }
      );


    if (
      !proposal
    ) {

      throw new Error(
        "Deriv did not return a trade proposal."
      );

    }


    const proposalId =
      proposal.id ||
      proposal.proposal_id;


    const proposalAskPrice =
      Number(
        proposal.ask_price ??
        proposal.display_value ??
        stake
      );


    if (
      !proposalId
    ) {

      throw new Error(
        "Deriv proposal did not contain a proposal ID."
      );

    }


    if (
      !Number.isFinite(
        proposalAskPrice
      )
    ) {

      throw new Error(
        "Invalid proposal price returned by Deriv."
      );

    }


    /*
     * Buy the contract.
     */

    const buyResult =
      await buyContract(
        proposalId,
        proposalAskPrice
      );


    /*
     * Return useful information to
     * trade.html.
     */

    return {

      success:
        true,

      symbol:
        symbol,

      direction:
        direction,

      stake:
        stake,

      duration:
        duration,

      currency:
        currency,

      proposal:
        proposal,

      buy:
        buyResult

    };

  }


  /*
   * ==========================================================
   * REQUEST PROPOSAL
   * ==========================================================
   */

  function requestProposal(
    params
  ) {

    return new Promise(
      function (
        resolve,
        reject
      ) {

        if (
          !authenticatedSocket ||
          authenticatedSocket.readyState !==
            WebSocket.OPEN
        ) {

          reject(
            new Error(
              "Deriv trading account is not connected."
            )
          );

          return;

        }


        const reqId =
          sendAuthenticated(
            {

              proposal:
                1,

              amount:
                Number(
                  params.amount
                ),

              basis:
                params.basis ||
                "stake",

              contract_type:
                params.contractType,

              currency:
                params.currency ||
                "USD",

              duration:
                Number(
                  params.duration
                ),

              duration_unit:
                params.durationUnit ||
                "t",

              underlying_symbol:
                params.symbol ||
                currentSymbol

            }
          );


        let finished =
          false;


        const timeout =
          setTimeout(
            function () {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              cleanup();


              reject(
                new Error(
                  "Timed out waiting for Deriv trade proposal."
                )
              );

            },
            15000
          );


        function cleanup() {

          clearTimeout(
            timeout
          );


          unsubscribeProposal();

        }


        const unsubscribeProposal =
          on(
            "proposal",
            function (
              proposal
            ) {

              if (
                finished
              ) {

                return;

              }


              /*
               * Match the proposal to
               * the request where possible.
               */

              if (
                proposal &&
                proposal.req_id !==
                  undefined &&
                Number(
                  proposal.req_id
                ) !== Number(
                  reqId
                )
              ) {

                return;

              }


              finished =
                true;


              cleanup();


              resolve(
                proposal
              );

            }
          );


        /*
         * Listen for API errors associated
         * with this proposal.
         */

        const unsubscribeError =
          on(
            "error",
            function (
              error
            ) {

              if (
                finished
              ) {

                return;

              }


              /*
               * Don't immediately reject on
               * unrelated errors when possible.
               */

              const message =
                error?.message ||
                "Deriv proposal request failed.";


              finished =
                true;


              cleanup();


              unsubscribeError();


              reject(
                new Error(
                  message
                )
              );

            }
          );

      }
    );

  }


  /*
   * ==========================================================
   * BUY CONTRACT
   * ==========================================================
   */

  function buyContract(
    proposalId,
    price
  ) {

    return new Promise(
      function (
        resolve,
        reject
      ) {

        const reqId =
          sendAuthenticated(
            {

              buy:
                String(
                  proposalId
                ),

              price:
                Number(
                  price
                )

            }
          );


        let finished =
          false;


        const timeout =
          setTimeout(
            function () {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              cleanup();


              reject(
                new Error(
                  "Timed out waiting for Deriv trade confirmation."
                )
              );

            },
            15000
          );


        function cleanup() {

          clearTimeout(
            timeout
          );


          unsubscribeBuy();


          unsubscribeError();

        }


        const unsubscribeBuy =
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


              if (
                buy &&
                buy.req_id !==
                  undefined &&
                Number(
                  buy.req_id
                ) !== Number(
                  reqId
                )
              ) {

                return;

              }


              finished =
                true;


              cleanup();


              resolve(
                buy
              );

            }
          );


        const unsubscribeError =
          on(
            "error",
            function (
              error
            ) {

              if (
                finished
              ) {

                return;

              }


              finished =
                true;


              cleanup();


              reject(
                new Error(
                  error?.message ||
                  "Deriv trade request failed."
                )
              );

            }
          );

      }
    );

  }


  /*
   * ==========================================================
   * GET PROPOSAL - PUBLIC HELPER
   * ==========================================================
   */

  function getProposal(
    params
  ) {

    return sendAuthenticated(
      {

        proposal:
          1,

        amount:
          Number(
            params.amount
          ),

        basis:
          params.basis ||
          "stake",

        contract_type:
          params.contractType,

        currency:
          params.currency ||
          "USD",

        duration:
          Number(
            params.duration
          ),

        duration_unit:
          params.durationUnit ||
          "t",

        underlying_symbol:
          params.symbol ||
          currentSymbol

      }
    );

  }


  /*
   * ==========================================================
   * MONITOR CONTRACT
   * ==========================================================
   */

  function monitorContract(
    contractId
  ) {

    return sendAuthenticated(
      {

        proposal_open_contract:
          1,

        contract_id:
          Number(
            contractId
          ),

        subscribe:
          1

      }
    );

  }


  /*
   * ==========================================================
   * SUBSCRIBE BALANCE
   * ==========================================================
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
   * ==========================================================
   * SELL CONTRACT
   * ==========================================================
   */

  function sellContract(
    contractId,
    price
  ) {

    return sendAuthenticated(
      {

        sell:
          Number(
            contractId
          ),

        price:
          Number(
            price || 0
          )

      }
    );

  }


  /*
   * ==========================================================
   * CLOSE AUTHENTICATED CONNECTION
   * ==========================================================
   */

  function disconnectAuthenticated() {

    authenticated =
      false;


    if (
      authenticatedSocket
    ) {

      try {

        authenticatedSocket.close();

      } catch (_) {}

    }


    authenticatedSocket =
      null;

  }


  /*
   * ==========================================================
   * PUBLIC API
   * ==========================================================
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
     * Authentication/account
     */

    getSession:
      getSession,

    getAccount:
      getAccount,

    connectAccount:
      connectAccount,

    connectAuthenticated:
      connectAuthenticated,


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
     * Events
     */

    on:
      on,


    /*
     * Connection state
     */

    get currentSymbol() {

      return currentSymbol;

    },


    get connected() {

      return Boolean(
        publicSocket &&
        publicSocket.readyState ===
          WebSocket.OPEN
      );

    },


    get authenticated() {

      return Boolean(
        authenticatedSocket &&
        authenticatedSocket.readyState ===
          WebSocket.OPEN &&
        authenticated
      );

    },


    get account() {

      return currentAccount;

    }

  };


  /*
   * ==========================================================
   * AUTOMATIC PUBLIC MARKET START
   * ==========================================================
   *
   * Your trade.html also explicitly calls:
   *
   *   startLiveMarket();
   *
   * so this automatic connection is mainly
   * useful on pages that load deriv.js by itself.
   */

  window.addEventListener(
    "DOMContentLoaded",
    function () {

      /*
       * Do not overwrite callbacks supplied
       * later by trade.html.
       */

      if (
        !publicSocket
      ) {

        connect(
          currentSymbol
        );

      }

    }
  );


})();
