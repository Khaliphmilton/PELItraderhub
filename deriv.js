<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>Dashboard | PELItradershub</title>

<meta
  name="description"
  content="PELItradershub real Deriv trading dashboard."
>

<link rel="stylesheet" href="styles.css">

<style>

.dashboard {
  max-width: 1400px;
  margin: auto;
  padding: 30px 5%;
}

.dashboard-header {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:20px;
  margin-bottom:30px;
}

.dashboard-header h1 {
  font-size:38px;
  margin:5px 0;
}

.dashboard-header p {
  color:#7d879b;
}

.dashboard-actions {
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}

.logout-button {
  padding:11px 16px;
  border-radius:9px;
  border:1px solid #713345;
  background:#351923;
  color:#ff7186;
  font-weight:700;
  cursor:pointer;
}

.dash-grid {
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:15px;
  margin-bottom:20px;
}

.dash-card {
  background:#0d121c;
  border:1px solid #202838;
  border-radius:16px;
  padding:20px;
}

.dash-label {
  color:#7d879b;
  font-size:13px;
}

.dash-value {
  font-size:28px;
  font-weight:800;
  margin:8px 0;
}

.positive {
  color:#39d4b6;
}

.negative {
  color:#ff7186;
}

.muted {
  color:#7d879b;
}

.dashboard-grid {
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:15px;
}

.panel {
  background:#0d121c;
  border:1px solid #202838;
  border-radius:16px;
  padding:20px;
}

.panel h2 {
  font-size:18px;
  margin-bottom:18px;
}

.chart-box {
  height:350px;
  background:
    linear-gradient(
      180deg,
      rgba(120,108,255,.08),
      transparent
    );
  border-radius:12px;
  overflow:hidden;
}

#portfolioChart {
  width:100%;
  height:100%;
}

.market-row,
.position {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:14px 0;
  border-bottom:1px solid #202838;
}

.market-row:last-child,
.position:last-child {
  border-bottom:0;
}

.market-name {
  font-weight:700;
}

.market-type {
  color:#667187;
  font-size:11px;
  display:block;
  margin-top:3px;
}

.market-price {
  font-weight:800;
  text-align:right;
}

.position-left strong {
  display:block;
}

.position-left small {
  color:#667187;
}

.dashboard-bottom {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:15px;
  margin-top:15px;
}

.quick-actions {
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:10px;
}

.quick-action {
  padding:16px;
  border-radius:12px;
  border:1px solid #252e40;
  background:#111722;
  color:white;
  text-align:left;
  cursor:pointer;
  text-decoration:none;
}

.quick-action:hover {
  border-color:#786cff;
}

.user-box {
  margin-top:10px;
  font-size:12px;
  color:#667187;
}

.user-box span {
  color:#39d4b6;
}

.connection {
  display:inline-flex;
  align-items:center;
  gap:7px;
  margin-top:10px;
  font-size:12px;
  font-weight:700;
}

.connection-dot {
  width:8px;
  height:8px;
  border-radius:50%;
  background:#ff7186;
}

.connection.live .connection-dot {
  background:#39d4b6;
}

.account-info {
  margin-top:15px;
  padding:12px;
  border-radius:10px;
  background:#111722;
  border:1px solid #202838;
  font-size:12px;
}

.account-info div {
  display:flex;
  justify-content:space-between;
  padding:5px 0;
}

.empty {
  padding:20px 0;
  text-align:center;
  color:#667187;
  font-size:13px;
}

.error-box {
  display:none;
  margin-bottom:20px;
  padding:14px;
  border-radius:10px;
  border:1px solid #713345;
  background:#351923;
  color:#ff7186;
  font-size:13px;
}

@media(max-width:900px) {

  .dash-grid {
    grid-template-columns:repeat(2,1fr);
  }

  .dashboard-grid {
    grid-template-columns:1fr;
  }

}

@media(max-width:600px) {

  .dashboard {
    padding:20px 15px;
  }

  .dashboard-header {
    align-items:flex-start;
    flex-direction:column;
  }

  .dashboard-header h1 {
    font-size:30px;
  }

  .dash-grid {
    grid-template-columns:1fr 1fr;
  }

  .dashboard-bottom {
    grid-template-columns:1fr;
  }

  .dashboard-actions {
    width:100%;
  }

  .dashboard-actions a,
  .dashboard-actions button {
    flex:1;
  }

}

</style>

</head>

<body>

<header class="navbar">

<a href="index.html" class="brand">

<span class="brand-icon">P</span>

<span>
PELI<span>tradershub</span>
</span>

</a>

<div class="nav-actions">

<a
  href="markets.html"
  class="login-link"
>
Markets
</a>

<a
  href="settings.html"
  class="button secondary"
>
⚙
</a>

<button
  type="button"
  onclick="peliLogout()"
  class="logout-button"
>
Log out
</button>

</div>

</header>


<main class="dashboard">

<div class="dashboard-header">

<div>

<div class="eyebrow">
REAL TRADING DASHBOARD
</div>

<h1 id="welcomeTitle">
Good day, Trader.
</h1>

<p>
Your live Deriv account and market information.
</p>

<div class="user-box">
Signed in as:
<span id="userEmail">Loading...</span>
</div>

<div
  id="connectionStatus"
  class="connection"
>
<span class="connection-dot"></span>
<span id="connectionText">
Connecting to Deriv...
</span>
</div>

</div>


<div class="dashboard-actions">

<a
  href="trade.html"
  class="button primary"
>
Open Terminal
</a>

<a
  href="markets.html"
  class="button secondary"
>
Markets
</a>

</div>

</div>


<div
  id="errorBox"
  class="error-box"
></div>


<!-- REAL ACCOUNT STATISTICS -->

<section class="dash-grid">

<div class="dash-card">

<div class="dash-label">
Account Balance
</div>

<div
  id="balanceValue"
  class="dash-value"
>
—
</div>

<span
  id="balanceCurrency"
  class="muted"
>
Connecting...
</span>

</div>


<div class="dash-card">

<div class="dash-label">
Today's P/L
</div>

<div
  id="todayPL"
  class="dash-value"
>
—
</div>

<span
  id="todayPLPercent"
  class="muted"
>
Waiting for account data
</span>

</div>


<div class="dash-card">

<div class="dash-label">
Open Positions
</div>

<div
  id="openPositions"
  class="dash-value"
>
0
</div>

<span class="muted">
Live Deriv portfolio
</span>

</div>


<div class="dash-card">

<div class="dash-label">
Win Rate
</div>

<div
  id="winRate"
  class="dash-value"
>
—
</div>

<span
  id="winRateDetail"
  class="muted"
>
Calculating from history
</span>

</div>

</section>


<!-- MARKET + WATCHLIST -->

<section class="dashboard-grid">


<div class="panel">

<h2>
Live Market
</h2>

<div class="chart-box">

<svg
  id="portfolioChart"
  viewBox="0 0 900 350"
  preserveAspectRatio="none"
>

<defs>

<linearGradient
  id="liveArea"
  x1="0"
  y1="0"
  x2="0"
  y2="1"
>

<stop
  offset="0%"
  stop-color="#786cff"
  stop-opacity=".35"
/>

<stop
  offset="100%"
  stop-color="#786cff"
  stop-opacity="0"
/>

</linearGradient>

</defs>

<path
  id="chartArea"
  d=""
  fill="url(#liveArea)"
/>

<path
  id="chartLine"
  d=""
  fill="none"
  stroke="#786cff"
  stroke-width="4"
/>

</svg>

</div>

<div class="account-info">

<div>

<span>Market</span>

<strong id="chartSymbol">
R_100
</strong>

</div>

<div>

<span>Live Price</span>

<strong id="chartPrice">
—
</strong>

</div>

<div>

<span>Last Digit</span>

<strong id="chartDigit">
—
</strong>

</div>

</div>

</div>


<div class="panel">

<h2>
Watchlist
</h2>


<div
  id="watchlist"
>

<div class="empty">
Loading live markets...
</div>

</div>


<a
  href="markets.html"
  class="button secondary"
  style="width:100%;margin-top:15px;"
>
View All Markets
</a>

</div>

</section>


<!-- POSITIONS + QUICK ACTIONS -->

<section class="dashboard-bottom">


<div class="panel">

<h2>
Open Positions
</h2>

<div id="positions">

<div class="empty">
No open positions.
</div>

</div>

<a
  href="portfolio.html"
  class="button secondary"
  style="width:100%;margin-top:15px;"
>
View Portfolio
</a>

</div>


<div class="panel">

<h2>
Quick Actions
</h2>

<div class="quick-actions">

<a
  href="trade.html"
  class="quick-action"
>

<strong>
📈 Trade
</strong>

<small>
Open trading terminal
</small>

</a>


<a
  href="strategies.html"
  class="quick-action"
>

<strong>
🤖 Strategy
</strong>

<small>
Manage strategies
</small>

</a>


<a
  href="history.html"
  class="quick-action"
>

<strong>
◷ History
</strong>

<small>
View transactions
</small>

</a>


<a
  href="settings.html"
  class="quick-action"
>

<strong>
⚙ Settings
</strong>

<small>
Configure account
</small>

</a>

</div>

</div>

</section>


<div
  id="accountInfo"
  class="account-info"
  style="margin-top:20px;"
>

<div>

<span>Deriv Account</span>

<strong id="derivAccount">
Not connected
</strong>

</div>

<div>

<span>Account Type</span>

<strong id="derivType">
—
</strong>

</div>

<div>

<span>Currency</span>

<strong id="derivCurrency">
—
</strong>

</div>

</div>


</main>


<footer>

<div class="brand">

<span class="brand-icon">
P
</span>

PELItradershub

</div>

<p>
Trading involves risk. No profits are guaranteed.
</p>

</footer>


<!-- SUPABASE -->

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<script src="supabase.js"></script>

<!-- YOUR REAL DERIV ENGINE -->

<script src="deriv-engine.js"></script>


<script>

"use strict";


const $ = id =>
  document.getElementById(id);


let balance = null;
let currency = "USD";
let openingBalance = null;
let chartPrices = [];


/* =========================================================
   FORMAT MONEY
========================================================= */

function money(value) {

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return new Intl.NumberFormat(
    undefined,
    {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ).format(number);

}


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  const box = $("errorBox");

  if (!box) return;

  box.textContent =
    message ||
    "Unable to load Deriv account data.";

  box.style.display = "block";

}


/* =========================================================
   CONNECTION STATUS
========================================================= */

function setConnection(
  live,
  text
) {

  const box =
    $("connectionStatus");

  const label =
    $("connectionText");

  if (!box || !label) return;

  box.classList.toggle(
    "live",
    Boolean(live)
  );

  label.textContent =
    text;

}


/* =========================================================
   ACCOUNT
========================================================= */

function updateAccount(account) {

  if (!account) return;

  currency =
    account.currency ||
    "USD";


  if (
    account.balance !==
    undefined
  ) {

    balance =
      Number(
        account.balance
      );

  }


  $("derivAccount").textContent =
    account.account_id ||
    account.loginid ||
    account.id ||
    "Connected";


  $("derivType").textContent =
    account.account_type ||
    "real";


  $("derivCurrency").textContent =
    currency;


  $("balanceCurrency").textContent =
    currency;


  if (
    Number.isFinite(balance)
  ) {

    $("balanceValue").textContent =
      money(balance);

  }

}


/* =========================================================
   BALANCE
========================================================= */

PELI_DERIV.on(
  "balance",
  data => {

    if (!data) return;


    const newBalance =
      Number(
        data.balance
      );


    if (
      !Number.isFinite(
        newBalance
      )
    ) {
      return;
    }


    balance =
      newBalance;


    currency =
      data.currency ||
      currency;


    if (
      openingBalance === null
    ) {

      openingBalance =
        balance;

    }


    $("balanceValue").textContent =
      money(balance);


    $("balanceCurrency").textContent =
      currency;


    updatePL();

  }
);


/* =========================================================
   CALCULATE P/L
========================================================= */

function updatePL() {

  if (
    openingBalance === null ||
    balance === null
  ) {
    return;
  }


  const pl =
    balance -
    openingBalance;


  const percent =
    openingBalance !== 0
      ? (
          pl /
          openingBalance
        ) *
        100
      : 0;


  const element =
    $("todayPL");


  element.textContent =
    money(pl);


  element.className =
    "dash-value " +
    (
      pl >= 0
        ? "positive"
        : "negative"
    );


  const percentElement =
    $("todayPLPercent");


  percentElement.textContent =
    (
      pl >= 0
        ? "+"
        : ""
    ) +
    percent.toFixed(2) +
    "% today";


  percentElement.className =
    pl >= 0
      ? "positive"
      : "negative";

}


/* =========================================================
   PORTFOLIO
========================================================= */

PELI_DERIV.on(
  "portfolio",
  data => {

    const contracts =
      Array.isArray(
        data?.contracts
      )
        ? data.contracts
        : [];


    $("openPositions").textContent =
      contracts.length;


    renderPositions(
      contracts
    );

  }
);


/* =========================================================
   POSITION DISPLAY
========================================================= */

function renderPositions(
  contracts
) {

  const container =
    $("positions");


  if (
    !contracts.length
  ) {

    container.innerHTML =
      '<div class="empty">No open positions.</div>';

    return;

  }


  container.innerHTML =
    contracts.map(
      contract => {

        const symbol =
          contract.underlying_symbol ||
          contract.symbol ||
          contract.display_name ||
          "Contract";


        const id =
          contract.contract_id ||
          contract.id ||
          "—";


        const profit =
          Number(
            contract.profit
          );


        const profitText =
          Number.isFinite(profit)
            ? money(profit)
            : "—";


        const profitClass =
          profit >= 0
            ? "positive"
            : "negative";


        return `

          <div class="position">

            <div class="position-left">

              <strong>
                ${escapeHTML(symbol)}
              </strong>

              <small>
                Contract #${escapeHTML(String(id))}
              </small>

            </div>

            <strong class="${profitClass}">
              ${profitText}
            </strong>

          </div>

        `;

      }
    ).join("");

}


/* =========================================================
   PROFIT TABLE / WIN RATE
========================================================= */

PELI_DERIV.on(
  "profitTable",
  data => {

    const transactions =
      Array.isArray(
        data?.transactions
      )
        ? data.transactions
        : Array.isArray(
            data?.contracts
          )
          ? data.contracts
          : [];


    calculateWinRate(
      transactions
    );

  }
);


function calculateWinRate(
  trades
) {

  if (!trades.length) {

    $("winRate").textContent =
      "—";

    $("winRateDetail").textContent =
      "No closed trades found";

    return;

  }


  let wins = 0;
  let completed = 0;


  trades.forEach(
    trade => {

      const profit =
        Number(
          trade.profit
        );


      if (
        !Number.isFinite(
          profit
        )
      ) {
        return;
      }


      completed++;


      if (profit > 0) {
        wins++;
      }

    }
  );


  if (!completed) {

    $("winRate").textContent =
      "—";

    $("winRateDetail").textContent =
      "No completed trades found";

    return;

  }


  const rate =
    (
      wins /
      completed
    ) *
    100;


  $("winRate").textContent =
    rate.toFixed(1) +
    "%";


  $("winRateDetail").textContent =
    `${wins} wins / ${completed} closed`;

}


/* =========================================================
   LIVE TICKS
========================================================= */

PELI_DERIV.on(
  "tick",
  tick => {

    if (!tick) return;


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


    $("chartPrice").textContent =
      quote;


    $("chartDigit").textContent =
      tick.lastDigit ??
      "—";


    $("chartSymbol").textContent =
      PELI_DERIV.symbol;


    chartPrices.push(
      quote
    );


    if (
      chartPrices.length >
      100
    ) {

      chartPrices =
        chartPrices.slice(
          -100
        );

    }


    drawChart();

  }
);


/* =========================================================
   LIVE CHART
========================================================= */

function drawChart() {

  if (
    chartPrices.length <
    2
  ) {
    return;
  }


  const width = 900;
  const height = 350;
  const padding = 20;


  const min =
    Math.min(
      ...chartPrices
    );


  const max =
    Math.max(
      ...chartPrices
    );


  const range =
    max - min ||
    1;


  const points =
    chartPrices.map(
      (price, index) => {

        const x =
          padding +
          (
            index /
            (chartPrices.length - 1)
          ) *
          (
            width -
            padding * 2
          );


        const y =
          height -
          padding -
          (
            (
              price -
              min
            ) /
            range
          ) *
          (
            height -
            padding * 2
          );


        return `${x},${y}`;

      }
    );


  const line =
    "M" +
    points.join(" L");


  const area =
    line +
    ` L${width - padding},${height - padding}` +
    ` L${padding},${height - padding} Z`;


  $("chartLine")
    .setAttribute(
      "d",
      line
    );


  $("chartArea")
    .setAttribute(
      "d",
      area
    );

}


/* =========================================================
   SYMBOLS / WATCHLIST
========================================================= */

PELI_DERIV.on(
  "symbols",
  symbols => {

    if (!Array.isArray(symbols)) {
      return;
    }


    const wanted = [

      "R_25",
      "R_50",
      "R_75",
      "R_100"

    ];


    const available =
      symbols.filter(
        item =>
          wanted.includes(
            item.underlying_symbol ||
            item.symbol
          )
      );


    const container =
      $("watchlist");


    if (!available.length) {

      container.innerHTML =
        '<div class="empty">No market symbols returned.</div>';

      return;

    }


    container.innerHTML =
      available.map(
        item => {

          const symbol =
            item.underlying_symbol ||
            item.symbol;


          const name =
            item.display_name ||
            symbol;


          return `

            <div
              class="market-row"
              data-symbol="${escapeHTML(symbol)}"
            >

              <div>

                <span class="market-name">
                  ${escapeHTML(name)}
                </span>

                <span class="market-type">
                  Deriv Synthetic
                </span>

              </div>

              <div
                class="market-price"
                id="price-${escapeHTML(symbol)}"
              >
                —
              </div>

            </div>

          `;

        }
      ).join("");

  }
);


/* =========================================================
   AUTHENTICATED CONNECTION
========================================================= */

PELI_DERIV.on(
  "authenticated",
  account => {

    setConnection(
      true,
      "REAL DERIV ACCOUNT CONNECTED"
    );


    updateAccount(
      account
    );


    loadAccountData();

  }
);


/* =========================================================
   AUTH STATUS
========================================================= */

PELI_DERIV.on(
  "status",
  status => {

    if (
      status?.authenticated
    ) {

      setConnection(
        true,
        "REAL DERIV ACCOUNT CONNECTED"
      );

    }

  }
);


/* =========================================================
   ACCOUNT DATA
========================================================= */

async function loadAccountData() {

  try {

    await PELI_DERIV.getPortfolio();

  } catch (error) {

    console.error(
      "Portfolio:",
      error
    );

  }


  try {

    await PELI_DERIV.getProfitTable({
      limit:100
    });

  } catch (error) {

    console.error(
      "Profit table:",
      error
    );

  }


  try {

    await PELI_DERIV.getStatement({
      limit:100,
      description:1
    });

  } catch (error) {

    console.error(
      "Statement:",
      error
    );

  }

}


/* =========================================================
   AUTHENTICATE
========================================================= */

async function connectRealAccount() {

  try {

    setConnection(
      false,
      "CONNECTING TO REAL DERIV..."
    );


    const account =
      await PELI_DERIV.connectAuthenticated();


    updateAccount(
      account
    );


  } catch (error) {

    console.error(
      "REAL DERIV:",
      error
    );


    setConnection(
      false,
      "REAL DERIV NOT CONNECTED"
    );


    showError(
      error.message ||
      "Unable to connect to your REAL Deriv account."
    );

  }

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
  value
) {

  return String(
    value
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   SUPABASE AUTH
========================================================= */

(async function initDashboard() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .auth
        .getSession();


    if (error) {
      throw error;
    }


    const session =
      data.session;


    if (!session) {

      window.location.replace(
        "login.html"
      );

      return;

    }


    window.PELI_USER =
      session.user;


    $("userEmail").textContent =
      session.user.email ||
      "Authenticated user";


    const fullName =
      session.user
        .user_metadata
        ?.full_name;


    if (fullName) {

      const firstName =
        fullName
          .trim()
          .split(/\s+/)[0];


      $("welcomeTitle").textContent =
        "Good day, " +
        firstName +
        ".";

    }


    /*
     * Public market stream starts automatically
     * from deriv-engine.js.
     *
     * Now connect the REAL account.
     */

    await connectRealAccount();

  } catch (error) {

    console.error(
      "Dashboard initialization:",
      error
    );


    window.location.replace(
      "login.html"
    );

  }

})();


/* =========================================================
   LOGOUT
========================================================= */

async function peliLogout() {

  try {

    if (
      window.PELI_DERIV
    ) {

      PELI_DERIV
        .disconnectAuthenticated();

      PELI_DERIV
        .disconnect();

    }


    const {
      error
    } =
      await supabaseClient
        .auth
        .signOut();


    if (error) {
      throw error;
    }


    window.location.replace(
      "login.html"
    );

  } catch (error) {

    console.error(
      "Logout:",
      error
    );


    alert(
      "Unable to log out. Please try again."
    );

  }

}

</script>

</body>
</html>
