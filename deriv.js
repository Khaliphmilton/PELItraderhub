// PELItradershub — REAL DERIV ENGINE
// FULL REPLACEMENT
// Live ticks + price movement corrected.
// Does not modify the UI/appearance.

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
manualAuthClose: false,  

liveSubscribed: false,  
historyLoaded: false

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

const pip =  
  Number(state.pipSize);  

if (  
  Number.isFinite(pip) &&  
  pip > 0 &&  
  pip < 1  
) {  

  const decimals =  
    Math.max(  
      0,  
      Math.round(  
        -Math.log10(pip)  
      )  
    );  

  const multiplier =  
    Math.pow(  
      10,  
      decimals  
    );  

  return (  
    Math.round(  
      Math.abs(number) *  
      multiplier  
    ) % 10  
  );  

}  

const match =  
  String(quote).match(  
    /(\d)\s*$/  
  );  

return match  
  ? Number(match[1])  
  : null;

}

// ============================================================
// RESET
// ============================================================

function resetStats() {

state.digits =  
  Array(10).fill(0);  

state.recentDigits = [];  

state.recentTicks = [];  

state.lastQuote = null;  
state.lastDigit = null;  

state.previousQuote = null;  
state.previousDigit = null;  

state.lastEpoch = null;  

state.historyLoaded = false;  
state.liveSubscribed = false;

}

// ============================================================
// RESET ONLY STATISTICS
// IMPORTANT:
// Does NOT erase the current live quote.
// ============================================================

function resetDigitStatsOnly() {

state.digits =  
  Array(10).fill(0);  

state.recentDigits = [];

}

// ============================================================
// TICK PROCESSOR
// ============================================================

function processTick(tick) {

if (  
  !tick ||  
  tick.quote === undefined  
) {  
  return;  
}  

const quote =  
  Number(tick.quote);  

if (!Number.isFinite(quote)) {  
  return;  
}  

const digit =  
  getDigit(quote);  

state.previousQuote =  
  state.lastQuote;  

state.previousDigit =  
  state.lastDigit;  

state.lastQuote =  
  quote;  

state.lastDigit =  
  digit;  

state.lastEpoch =  
  tick.epoch || null;  


if (digit !== null) {  

  state.digits[digit]++;  

  state.recentDigits.push(  
    digit  
  );  

}  


state.recentTicks.push({  

  quote,  

  digit,  

  epoch:  
    tick.epoch || null  

});  


if (  
  state.recentDigits.length >  
  500  
) {  

  state.recentDigits =  
    state.recentDigits.slice(  
      -500  
    );  

}  


if (  
  state.recentTicks.length >  
  500  
) {  

  state.recentTicks =  
    state.recentTicks.slice(  
      -500  
    );  

}  


emit("tick", {  

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
    state.pipSize,  

  live:  
    true  

});

}

// ============================================================
// PUBLIC SOCKET
// ============================================================

function connect(
symbol = state.symbol
) {

state.symbol =  
  symbol;  

state.manualPublicClose =  
  false;  

state.historyLoaded =  
  false;  

state.liveSubscribed =  
  false;  


if (state.publicWs) {  

  try {  
    state.publicWs.close();  
  } catch {}  

}  


resetStats();  


emit("status", {  

  publicConnecting:  
    true,  

  publicConnected:  
    false,  

  authenticated:  
    state.authenticated,  

  symbol:  
    state.symbol  

});  


let ws;  

try {  

  ws =  
    new WebSocket(  
      PUBLIC_WS  
    );  

} catch (error) {  

  emit("error", {  

    message:  
      error.message ||  
      "Unable to open Deriv market connection."  

  });  

  reconnectPublic();  

  return null;  

}  


state.publicWs =  
  ws;  


// ==========================================================  
// SOCKET OPEN  
// ==========================================================  

ws.onopen = () => {  

  state.publicReconnectAttempts =  
    0;  


  emit("status", {  

    publicConnecting:  
      false,  

    publicConnected:  
      true,  

    authenticated:  
      state.authenticated,  

    symbol:  
      state.symbol  

  });  


  try {  

    // ------------------------------------------------------  
    // GET MARKET INFORMATION  
    // ------------------------------------------------------  

    sendPublic({  

      active_symbols:  
        "brief"  

    });  


    // ------------------------------------------------------  
    // REQUEST RECENT REAL MARKET HISTORY  
    // ------------------------------------------------------  

    sendPublic({  

      ticks_history:  
        state.symbol,  

      end:  
        "latest",  

      style:  
        "ticks",  

      count:  
        200,  

      adjust_start_time:  
        1  

    });  


    // ------------------------------------------------------  
    // IMPORTANT:  
    // SUBSCRIBE TO LIVE TICKS IMMEDIATELY.  
    //  
    // Do NOT wait for history.  
    // This prevents the terminal from appearing frozen  
    // while the history response is being returned.  
    // ------------------------------------------------------  

    sendPublic({  

      ticks:  
        state.symbol,  

      subscribe:  
        1  

    });  


    state.liveSubscribed =  
      true;  


    emit(  
      "liveSubscribed",  
      {  
        symbol:  
          state.symbol  
      }  
    );  


  } catch (error) {  

    emit("error", {  

      message:  
        error.message  

    });  

  }  

};  


// ==========================================================  
// SOCKET MESSAGE  
// ==========================================================  

ws.onmessage =  
  event => {  

    let message;  

    try {  

      message =  
        JSON.parse(  
          event.data  
        );  

    } catch {  

      return;  

    }  


    handlePublicMessage(  
      message  
    );  

  };  


// ==========================================================  
// SOCKET ERROR  
// ==========================================================  

ws.onerror = () => {  

  emit("error", {  

    message:  
      "Live Deriv market connection error."  

  });  

};  


// ==========================================================  
// SOCKET CLOSED  
// ==========================================================  

ws.onclose = () => {  

  state.liveSubscribed =  
    false;  


  emit("status", {  

    publicConnecting:  
      false,  

    publicConnected:  
      false,  

    authenticated:  
      state.authenticated  

  });  


  if (  
    !state.manualPublicClose  
  ) {  

    reconnectPublic();  

  }  

};  


return ws;

}

// ============================================================
// PUBLIC SEND
// ============================================================

function sendPublic(
payload
) {

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

  req_id:  
    nextReqId()  

};  


state.publicWs.send(  
  JSON.stringify(  
    message  
  )  
);  


return message.req_id;

}

// ============================================================
// PUBLIC MESSAGE HANDLER
// ============================================================

function handlePublicMessage(
message
) {

if (!message) {  
  return;  
}  


// ----------------------------------------------------------  
// ERROR  
// ----------------------------------------------------------  

if (message.error) {  

  emit(  
    "error",  
    message.error  
  );  

  return;  

}  


// ----------------------------------------------------------  
// ACTIVE SYMBOLS  
// ----------------------------------------------------------  

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
    Number(  
      selected.pip_size  
    ) > 0  
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


// ----------------------------------------------------------  
// HISTORY  
// ----------------------------------------------------------  

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


  /*  
   * IMPORTANT:  
   *  
   * Do NOT call resetStats() here.  
   *  
   * Live ticks may already have arrived.  
   *  
   * Clearing state here was the reason the terminal could  
   * lose the current price / digit information.  
   */  

  resetDigitStatsOnly();  


  prices.forEach(  
    price => {  

      const number =  
        Number(price);  

      if (  
        !Number.isFinite(  
          number  
        )  
      ) {  
        return;  
      }  


      const digit =  
        getDigit(number);  


      if (  
        digit !== null  
      ) {  

        state.digits[digit]++;  

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
      state.recentDigits.slice(  
        -500  
      );  

  }  


  state.historyLoaded =  
    true;  


  // --------------------------------------------------------  
  // Display the latest historical price immediately IF  
  // a live tick has not already arrived.  
  // --------------------------------------------------------  

  if (  
    prices.length > 0 &&  
    state.lastQuote === null  
  ) {  

    const latestPrice =  
      Number(  
        prices[  
          prices.length - 1  
        ]  
      );  


    if (  
      Number.isFinite(  
        latestPrice  
      )  
    ) {  

      const latestDigit =  
        getDigit(  
          latestPrice  
        );  


      state.lastQuote =  
        latestPrice;  

      state.lastDigit =  
        latestDigit;  


      emit("tick", {  

        quote:  
          latestPrice,  

        lastDigit:  
          latestDigit,  

        previousQuote:  
          null,  

        previousDigit:  
          null,  

        epoch:  
          null,  

        counts:  
          [...state.digits],  

        sampleSize:  
          state.recentDigits.length,  

        pipSize:  
          state.pipSize,  

        historical:  
          true,  

        live:  
          false  

      });  

    }  

  }  


  emit("history", {  

    prices,  

    counts:  
      [...state.digits],  

    sampleSize:  
      state.recentDigits.length  

  });  


  emit(  
    "ready",  
    {  
      symbol:  
        state.symbol,  

      price:  
        state.lastQuote,  

      digit:  
        state.lastDigit,  

      live:  
        state.liveSubscribed  
    }  
  );  

}  


// ----------------------------------------------------------  
// LIVE TICK  
// ----------------------------------------------------------  

if (  
  message.msg_type ===  
  "tick"  
) {  

  processTick(  
    message.tick  
  );  

}

}

// ============================================================
// PUBLIC RECONNECT
// ============================================================

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
    Math.pow(  
      2,  
      attempt  
    )  

  );  


state.publicReconnectAttempts++;  


state.publicReconnectTimer =  
  setTimeout(  
    () => {  

      connect(  
        state.symbol  
      );  

    },  
    delay  
  );

}

// ============================================================
// PUBLIC DISCONNECT
// ============================================================

function disconnect() {

state.manualPublicClose =  
  true;  


clearTimeout(  
  state.publicReconnectTimer  
);  


if (state.publicWs) {  

  try {  
    state.publicWs.close();  
  } catch {}  

}  


state.publicWs =  
  null;  

state.liveSubscribed =  
  false;

}

// ============================================================
// REAL ACCOUNT SESSION
// ============================================================

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
  !String(  
    data.ws_url  
  ).includes(  
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
// REAL ACCOUNT CONNECTION
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


state.connecting =  
  true;  


emit("status", {  

  connecting:  
    true,  

  authenticated:  
    false  

});  


let session;  


try {  

  session =  
    await getSession();  

} catch (error) {  

  state.connecting =  
    false;  

  emit("status", {  

    connecting:  
      false,  

    authenticated:  
      false  

  });  

  throw error;  

}  


state.account =  
  session.account;  


state.manualAuthClose =  
  false;  


if (state.authWs) {  

  try {  
    state.authWs.close();  
  } catch {}  

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

    let finished =  
      false;  


    const timer =  
      setTimeout(  
        () => {  

          if (finished) {  
            return;  
          }  

          finished =  
            true;  


          try {  
            ws.close();  
          } catch {}  


          reject(  
            new Error(  
              "Timed out connecting to REAL Deriv."  
            )  
          );  

        },  
        15000  
      );  


    ws.onopen =  
      () => {  

        if (finished) {  
          return;  
        }  


        finished =  
          true;  


        clearTimeout(  
          timer  
        );  


        state.authenticated =  
          true;  

        state.connecting =  
          false;  


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


        try {  

          authSend({  

            balance:  
              1,  

            subscribe:  
              1  

          });  


          authSend({  

            portfolio:  
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


        resolve();  

      };  


    ws.onerror =  
      () => {  

        if (finished) {  
          return;  
        }  


        finished =  
          true;  


        clearTimeout(  
          timer  
        );  


        state.connecting =  
          false;  


        reject(  
          new Error(  
            "Could not connect to REAL Deriv."  
          )  
        );  

      };  

  }  
);  


ws.onmessage =  
  event => {  

    let message;  


    try {  

      message =  
        JSON.parse(  
          event.data  
        );  

    } catch {  

      return;  

    }  


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
          "REAL Deriv connection error."  

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
      !state.manualAuthClose  
    ) {  

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

function handleAuthMessage(
message
) {

if (!message) {  
  return;  
}  


emit(  
  "message",  
  message  
);  


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


// OPEN CONTRACT  

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


    state.currentContract =  
      contract;  


    if (  
      contract.is_sold  
    ) {  

      state.openContracts.delete(  
        id  
      );  

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

if (  
  message.req_id  
) {  

  const pending =  
    state.pending.get(  
      message.req_id  
    );  


  if (pending) {  

    pending.resolve(  
      message  
    );  


    state.pending.delete(  
      message.req_id  
    );  

  }  

}

}

// ============================================================
// AUTH SEND
// ============================================================

function authSend(
payload
) {

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

  req_id:  
    nextReqId()  

};  


state.authWs.send(  
  JSON.stringify(  
    message  
  )  
);  


return message.req_id;

}

// ============================================================
// AUTH REQUEST
// ============================================================

function authRequest(
payload,
timeout = 15000
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
          "REAL Deriv account is not connected."  
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
        timeout  
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
        JSON.stringify({  

          ...payload,  

          req_id  

        })  
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

// ============================================================
// DISCONNECT REAL ACCOUNT
// ============================================================

function disconnectAuthenticated() {

state.manualAuthClose =  
  true;  

state.authenticated =  
  false;  

state.account =  
  null;  


state.openContracts.clear();  

state.currentContract =  
  null;  


if (state.authWs) {  

  try {  
    state.authWs.close();  
  } catch {}  

}  


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

// ============================================================
// BALANCE
// ============================================================

function subscribeBalance() {

return authRequest({  

  balance:  
    1,  

  subscribe:  
    1  

});

}

// ============================================================
// PROPOSAL
// ============================================================

async function getProposal(
params = {}
) {

if (!state.authenticated) {  

  throw new Error(  
    "Connect your REAL Deriv account first."  
  );  

}  


const amount =  
  Number(  
    params.amount  
  );  


const duration =  
  Number(  
    params.duration  
  );  


const contractType =  
  String(  
    params.contractType ||  
    ""  
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


const response =  
  await authRequest(  
    request  
  );  


if (  
  response.proposal  
) {  

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
    "Connect your REAL Deriv account first."  
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

  proposal_open_contract:  
    1,  

  contract_id:  
    id,  

  subscribe:  
    1  

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
    "Connect your REAL Deriv account first."  
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
  !Number.isFinite(  
    sellPrice  
  ) ||  
  sellPrice < 0  
) {  

  throw new Error(  
    "Invalid sell price."  
  );  

}  


return authRequest({  

  sell:  
    id,  

  price:  
    sellPrice  

});

}

// ============================================================
// PORTFOLIO
// ============================================================

function getPortfolio() {

if (!state.authenticated) {  

  throw new Error(  
    "Connect your REAL Deriv account first."  
  );  

}  


return authRequest({  

  portfolio:  
    1  

});

}

// ============================================================
// STATEMENT
// ============================================================

function getStatement(
options = {}
) {

if (!state.authenticated) {  

  throw new Error(  
    "Connect your REAL Deriv account first."  
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
  options.actionType  
) {  

  request.action_type =  
    options.actionType;  

}  


return authRequest(  
  request  
);

}

// ============================================================
// PROFIT TABLE
// ============================================================

function getProfitTable(
options = {}
) {

if (!state.authenticated) {  

  throw new Error(  
    "Connect your REAL Deriv account first."  
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

// ============================================================
// ACTIVE SYMBOLS
// ============================================================

function getActiveSymbols() {

if (  
  state.authenticated  
) {  

  return authRequest({  

    active_symbols:  
      "brief"  

  });  

}  


return sendPublic({  

  active_symbols:  
    "brief"  

});

}

// ============================================================
// CONTRACTS FOR
// ============================================================

function getContractsFor(
symbol =
state.symbol
) {

if (!symbol) {  

  throw new Error(  
    "Market symbol required."  
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


return sendPublic({  

  contracts_for:  
    symbol  

});

}

// ============================================================
// CHANGE MARKET
// ============================================================

function changeSymbol(
symbol
) {

if (!symbol) {  

  throw new Error(  
    "Market symbol required."  
  );  

}  


state.symbol =  
  symbol;  

state.proposal =  
  null;  


connect(  
  symbol  
);  


emit(  
  "symbolChanged",  
  symbol  
);

}

// ============================================================
// DIGIT STATISTICS
// ============================================================

function getDigitStats() {

const total =  
  state.recentDigits.length;  


return {  

  counts:  
    [...state.digits],  

  percentages:  
    state.digits.map(  
      count =>  
        total  
          ? (  
              count /  
              total  
            ) *  
            100  
          : 0  
    ),  

  total,  

  lastDigit:  
    state.lastDigit,  

  previousDigit:  
    state.previousDigit  

};

}

// ============================================================
// RECENT TICKS
// ============================================================

function getRecentTicks() {

return [  
  ...state.recentTicks  
];

}

// ============================================================
// OPEN CONTRACTS
// ============================================================

function getOpenContracts() {

return Array.from(  
  state.openContracts.values()  
);

}

// ============================================================
// CURRENT CONTRACT
// ============================================================

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

  liveSubscribed:  
    state.liveSubscribed,  

  historyLoaded:  
    state.historyLoaded,  

  account:  
    state.account,  

  symbol:  
    state.symbol,  

  lastQuote:  
    state.lastQuote,  

  lastDigit:  
    state.lastDigit  

};

}

// ============================================================
// RECONNECT AUTHENTICATED
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

connect(
state.symbol
);

})();
