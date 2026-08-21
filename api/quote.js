export default async function handler(req, res) {
  try {
    const symbol = req.query.symbol || "R_75";

    const allowedSymbols = [
      "R_10",
      "R_25",
      "R_50",
      "R_75",
      "R_100",
      "frxEURUSD",
      "frxGBPUSD",
      "frxUSDJPY",
      "cryBTCUSD"
    ];

    if (!allowedSymbols.includes(symbol)) {
      return res.status(400).json({
        ok: false,
        error: "Unsupported market symbol"
      });
    }

    const response = await fetch(
      "https://api.derivws.com/trading/v1/options/ticks",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          symbols: [symbol]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "Deriv market request failed",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      symbol,
      data
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Unable to contact Deriv",
      details: error.message
    });
  }
}
