const scenarioNames = { purchase: "Purchase selected", decline: "Purchase declined", policyBlock: "Policy blocked" };
const strategyNames = { noBuy: "No purchases", buyAll: "Buy all", oasis: "Oasis selective purchasing" };
const reasons = {
  highest_positive_estimated_surplus: "Highest estimated value after cost",
  better_offer_available: "A better offer was available",
  insufficient_value: "Estimated value did not cover the price",
  quote_mismatch: "Quote did not match the approved offer"
};

const scenarios = document.querySelector("#scenarios");
const replayButton = document.querySelector("#replay");
const results = document.querySelector("#results");

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function usdc(amount) {
  const value = BigInt(amount);
  const magnitude = value < 0n ? -value : value;
  const decimal = String(magnitude % 1000000n).padStart(6, "0").replace(/0+$/, "");
  return (value < 0n ? "-" : "") + (magnitude / 1000000n) + (decimal ? "." + decimal : "");
}

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Request failed (HTTP " + response.status + ")");
  return response.json();
}

async function showScenarios() {
  try {
    const data = await getJson("/research/demo");
    const cards = Object.entries(data.scenarios).map(([id, scenario]) => {
      const card = element("article");
      const title = scenarioNames[id] + (scenario.selectedProvider ? " · " + scenario.selectedProvider : "");
      const list = element("ul");
      for (const evaluation of scenario.evaluations) {
        const amounts = evaluation.amount === undefined ? "" :
          " · " + usdc(evaluation.amount) + " USDC price · " + usdc(evaluation.estimatedValue) + " USDC estimated value";
        list.append(element("li", evaluation.provider + amounts + " · " + (reasons[evaluation.reason] ?? evaluation.reason)));
      }
      card.append(element("h3", title), list);
      return card;
    });
    scenarios.replaceChildren(...cards);
  } catch (error) {
    scenarios.textContent = error.message;
  }
}

replayButton.addEventListener("click", async () => {
  replayButton.disabled = true;
  results.textContent = "Fetching historical candles…";
  try {
    const data = await getJson("/research/replay");
    const table = element("table");
    const header = table.createTHead().insertRow();
    for (const title of ["Strategy", "Accuracy", "Purchases", "Spend (USDC)", "Modeled utility (USDC)"]) {
      const cell = element("th", title);
      cell.scope = "col";
      header.append(cell);
    }
    const body = table.createTBody();
    for (const [id, strategy] of Object.entries(data.strategies)) {
      const row = body.insertRow();
      for (const value of [strategyNames[id], (strategy.accuracy * 100).toFixed(1) + "%", strategy.purchases,
        usdc(strategy.spendAtomic), usdc(strategy.utilityAtomic)]) row.append(element("td", value));
    }
    results.replaceChildren(element("p", data.cases + " evaluation windows"), table);
  } catch (error) {
    results.textContent = error.message;
  } finally {
    replayButton.disabled = false;
  }
});

void showScenarios();
