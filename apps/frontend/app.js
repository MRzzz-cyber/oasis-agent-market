const $ = (id) => document.getElementById(id);
const state = { goal: "", strategy: null, run: null, strategies: [] };
const tabs = ["overview", "create", "strategies", "policy"];
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("active");
  setTimeout(() => $("toast").classList.remove("active"), 4500);
}

/**
 * Public Cloudflare demo: state stays in this browser, never in a shared
 * Worker global. No wallet, network payments or live trading are possible.
 * The localhost development server continues to use the existing Node API.
 */
const browserOnlyDemo = !["localhost", "127.0.0.1", "::1"].includes(location.hostname);
const demoStorageKey = "oasis-demo-v1";
const demoMemory = { strategies: [], runs: [] };
function readDemoState() {
  try {
    const data = JSON.parse(localStorage.getItem(demoStorageKey));
    if (data && Array.isArray(data.strategies) && Array.isArray(data.runs)) return data;
  } catch { /* storage unavailable: use memory */ }
  return demoMemory;
}
function writeDemoState(data) {
  demoMemory.strategies = data.strategies;
  demoMemory.runs = data.runs;
  try { localStorage.setItem(demoStorageKey, JSON.stringify(data)); } catch { /* private mode */ }
}
function demoError(message) { throw new Error(message); }
function demoEvent(type, message, extra = {}) {
  return { id: crypto.randomUUID(), type, message, at: new Date().toISOString(), ...extra };
}
function simulateRun(strategy) {
  const asset = strategy.asset;
  return {
    id: crypto.randomUUID(), strategyId: strategy.id, goal: strategy.goal, asset,
    status: "awaiting_approval", paymentMode: "demo",
    payment: { status: "not_paid_demo", network: "eip155:84532", amountAtomic: "100000" },
    operatingBudget: { limit: (Number(strategy.budgetAtomic) / 1e6).toString(), spent: "0", simulatedQuote: "0.10" },
    votes: [
      { model: "示例模型 A", action: "BUY", rationale: "趋势信号支持继续观察" },
      { model: "示例模型 B", action: "BUY", rationale: "示例资金流向与趋势一致" },
      { model: "示例模型 C", action: "HOLD", rationale: "短期波动风险" }
    ],
    proposedOrder: { side: "BUY", asset, amountUsdc: "80.00", mode: "simulation" },
    events: [
      demoEvent("strategy", "策略已创建"),
      demoEvent("signal", "发现研究任务（演示数据）"),
      demoEvent("service", "发现 Market Signal API，报价 0.10 USDC"),
      demoEvent("policy", "模拟预算检查通过", { allowed: true }),
      demoEvent("demo", "仅展示数据采购流程；没有链上付款", { paid: false }),
      demoEvent("committee", "示例委员会：2 买入 / 1 观望", { simulated: true }),
      demoEvent("risk", "仅允许模拟交易"),
      demoEvent("proposal", "生成模拟交易建议，等待用户确认")
    ], createdAt: new Date().toISOString()
  };
}
async function browserDemoRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const parts = path.split("/").filter(Boolean);
  const state = readDemoState();
  if (method === "GET" && path === "/api/status")
    return { ok: true, mode: "simulation", realPaymentsEnabled: false, network: "Base Sepolia" };
  if (method === "GET" && path === "/api/strategies")
    return state.strategies;
  if (method === "POST" && path === "/api/strategies") {
    let body; try { body = JSON.parse(options.body || "{}"); } catch { demoError("无效的输入"); }
    const goal = body.goal?.trim();
    if (typeof goal !== "string" || goal.length < 4 || goal.length > 2000) demoError("请输入 4–2000 字的投资目标");
    const raw = String(body.budget ?? "5");
    if (!/^\\d+(\\.\\d{1,6})?$/.test(raw)) demoError("预算格式不正确");
    const [whole, decimals = ""] = raw.split(".");
    const atomic = BigInt(whole) * 1000000n + BigInt(decimals.padEnd(6, "0") || "0");
    if (atomic < 100000n || atomic > 100000000n) demoError("研究预算必须在 0.10–100 USDC");
    const asset = /\\bBTC\\b|比特币/i.test(goal) ? "BTC" : /\\bSOL\\b|索拉纳/i.test(goal) ? "SOL" : "ETH";
    const strategy = {
      id: crypto.randomUUID(), goal, asset, budgetAtomic: atomic.toString(),
      maxPurchaseAtomic: "100000", mode: "simulation", needsApproval: true,
      status: "draft", createdAt: new Date().toISOString()
    };
    state.strategies.push(strategy);
    writeDemoState(state);
    return strategy;
  }
  if (method === "POST" && path === "/api/runs") {
    let body; try { body = JSON.parse(options.body || "{}"); } catch { demoError("无效的输入"); }
    const strategy = state.strategies.find(x => x.id === body.strategyId);
    if (!strategy) demoError("策略不存在");
    const run = simulateRun(strategy);
    state.runs.push(run);
    writeDemoState(state);
    return run;
  }
  if (parts[0] === "api" && parts[1] === "runs" && parts[2]) {
    const run = state.runs.find(x => x.id === parts[2]);
    if (!run) demoError("运行不存在");
    if (method === "GET" && parts.length === 3) return run;
    if (method === "POST" && parts.length === 4 && ["approve", "reject"].includes(parts[3])) {
      if (run.status !== "awaiting_approval") demoError("该建议已处理");
      if (parts[3] === "approve") {
        run.status = "simulated";
        run.order = {
          id: crypto.randomUUID(), ...run.proposedOrder,
          status: "simulated", executedAt: new Date().toISOString(), simulated: true
        };
        run.events.push(demoEvent("execution", "用户确认：仅创建模拟订单，没有真实交易"));
      } else {
        run.status = "rejected";
        run.events.push(demoEvent("execution", "用户拒绝模拟交易建议"));
      }
      writeDemoState(state);
      return run;
    }
  }
  demoError("演示接口不存在");
}

async function request(path, options = {}) {
  if (browserOnlyDemo) return browserDemoRequest(path, options);
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
function showApp() {
  $("landing").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  showTab("overview");
}
function showSite() {
  $("landing").classList.remove("hidden");
  $("workspace").classList.add("hidden");
}
function showTab(tab) {
  if (!tabs.includes(tab)) return;
  for (const id of tabs) $("page-" + id).classList.toggle("hidden", id !== tab);
  for (const node of document.querySelectorAll("[data-tab]")) {
    node.classList.toggle("selected", node.dataset.tab === tab);
  }
  $("breadcrumb").textContent = ({ overview: "总览", create: "创建策略", strategies: "我的策略", policy: "预算与权限" })[tab];
  if (tab === "strategies") refreshStrategies();
}
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}
async function refreshStrategies() {
  const items = await request("/api/strategies");
  state.strategies = items;
  const root = $("strategy-list");
  root.replaceChildren();
  if (!items.length) root.appendChild(node("p", "note", "还没有策略。在总览中输入投资目标即可开始。"));
  for (const item of items) {
    const article = node("article");
    const info = node("div");
    info.appendChild(node("strong", "", item.asset + " · " + item.goal));
    info.appendChild(node("p", "note", "研究预算 " + (Number(item.budgetAtomic) / 1e6).toFixed(2) + " USDC · 模拟交易"));
    const btn = node("button", "", "运行策略");
    btn.addEventListener("click", async () => {
      try {
        state.run = await request("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: item.id }) });
        renderRun();
      } catch (error) { toast(error.message); }
    });
    article.append(info, btn); root.appendChild(article);
  }
}
function renderRun() {
  const run = state.run;
  if (!run) return;
  $("run-panel").classList.remove("hidden");
  const events = $("events");
  events.replaceChildren();
  for (const e of run.events) {
    const item = node("div", "event");
    item.appendChild(node("strong", "", e.message));
    item.appendChild(node("small", "", new Date(e.at).toLocaleTimeString("zh-CN") + " · " + e.type));
    events.appendChild(item);
  }
  const decision = $("decision");
  decision.replaceChildren();
  decision.appendChild(node("h3", "", "模拟买入 " + run.asset + " · " + run.proposedOrder.amountUsdc + " USDC"));
  decision.appendChild(node("p", "note", "示例模型：2 买入 / 1 观望。没有实时行情、没有真实模型推理或真实付款。"));
  decision.appendChild(node("p", "note", "Agent 费用（真实）：0 USDC · 服务模拟报价：0.10 USDC"));
  if (run.status === "awaiting_approval") {
    for (const [action, label] of [["approve", "确认模拟交易"], ["reject", "暂不执行"]]) {
      const button = node("button", action === "approve" ? "primary" : "ghost", label);
      button.addEventListener("click", async () => {
        try {
          state.run = await request("/api/runs/" + run.id + "/" + action, { method: "POST", body: "{}" });
          renderRun();
        } catch (error) { toast(error.message); }
      });
      decision.appendChild(button);
    }
  } else {
    decision.appendChild(node("strong", "", run.status === "simulated" ? "模拟订单已创建" : "建议已拒绝"));
  }
  showTab("strategies");
  $("run-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
for (const id of ["enter", "enter2"]) $(id).addEventListener("click", showApp);
$("back-site").addEventListener("click", showSite);
for (const button of document.querySelectorAll("[data-tab]")) {
  button.addEventListener("click", () => showTab(button.dataset.tab));
}
for (const button of document.querySelectorAll("[data-example]")) {
  button.addEventListener("click", () => {
    $("goal").value = button.dataset.example;
    $("goal").focus();
  });
}
$("goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.goal = $("goal").value.trim();
  $("strategy-goal").textContent = state.goal;
  showTab("create");
});
$("create-strategy").addEventListener("click", async () => {
  try {
    const goal = state.goal || $("strategy-goal").textContent;
    const result = await request("/api/strategies", {
      method: "POST", body: JSON.stringify({ goal, budget: $("budget").value })
    });
    state.strategy = result;
    $("strategy-result").textContent = "策略创建成功！请前往「我的策略」开始模拟运行。";
    toast("策略已创建");
    showTab("strategies");
  } catch (error) { toast(error.message); }
});
