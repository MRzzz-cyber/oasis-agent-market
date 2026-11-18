const scenarioNames = { purchase: "选购", decline: "拒绝购买", policyBlock: "策略拦截" };
const strategyNames = { noBuy: "不买", buyAll: "全买", oasis: "Oasis 智能购买" };
const reasons = {
  highest_positive_estimated_surplus: "扣除成本后的预估价值最高",
  better_offer_available: "有更优报价",
  insufficient_value: "预估价值低于或等于报价",
  quote_mismatch: "报价与批准条件不一致"
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
  if (!response.ok) throw new Error("请求失败 (HTTP " + response.status + ")");
  return response.json();
}

async function showScenarios() {
  try {
    const data = await getJson("/api/research/demo");
    const cards = Object.entries(data.scenarios).map(([id, scenario]) => {
      const card = element("article");
      const title = scenarioNames[id] + (scenario.selectedProvider ? " · " + scenario.selectedProvider : "");
      const list = element("ul");
      for (const evaluation of scenario.evaluations) {
        const amounts = evaluation.amount === undefined ? "" :
          " · " + usdc(evaluation.amount) + " USDC 报价 · " + usdc(evaluation.estimatedValue) + " USDC 预估价值";
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
  results.textContent = "正在获取历史日线…";
  try {
    const data = await getJson("/api/research/replay");
    const table = element("table");
    const header = table.createTHead().insertRow();
    for (const title of ["策略", "准确率", "购买次数", "成本 (USDC)", "模拟净效用 (USDC)"]) {
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
    results.replaceChildren(element("p", data.cases + " 个回放窗口"), table);
  } catch (error) {
    results.textContent = error.message;
  } finally {
    replayButton.disabled = false;
  }
});

void showScenarios();
