const DERIV_WS =
  "wss://api.derivws.com/trading/v1/options/ws/public";

let derivSocket = null;
let derivReconnectTimer = null;

function connectDeriv(symbol = "R_75", onTick, onStatus) {

  if (derivSocket) {
    derivSocket.close();
  }

  onStatus?.("Connecting...");

  derivSocket = new WebSocket(DERIV_WS);

  derivSocket.onopen = () => {

    onStatus?.("Connected");

    derivSocket.send(
      JSON.stringify({
        ticks: symbol,
        subscribe: 1,
        req_id: 1
      })
    );

  };


  derivSocket.onmessage = (event) => {

    try {

      const data = JSON.parse(event.data);

      if (data.msg_type === "tick" && data.tick) {

        onTick?.({
          symbol: data.tick.symbol,
          quote: data.tick.quote,
          epoch: data.tick.epoch
        });

      }

      if (data.error) {

        console.error(
          "Deriv error:",
          data.error
        );

        onStatus?.(
          data.error.message || "Deriv error"
        );

      }

    } catch (error) {

      console.error(
        "Invalid Deriv response:",
        error
      );

    }

  };


  derivSocket.onerror = () => {

    onStatus?.("Connection error");

  };


  derivSocket.onclose = () => {

    onStatus?.("Disconnected");

    clearTimeout(
      derivReconnectTimer
    );

    derivReconnectTimer = setTimeout(
      () => connectDeriv(
        symbol,
        onTick,
        onStatus
      ),
      3000
    );

  };

}


function disconnectDeriv() {

  clearTimeout(
    derivReconnectTimer
  );

  if (derivSocket) {

    derivSocket.close();

    derivSocket = null;

  }

}


window.PELI_DERIV = {

  connect: connectDeriv,

  disconnect: disconnectDeriv

};
