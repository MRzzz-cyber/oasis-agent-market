const $ = (id) => document.getElementById(id);
const state = { goal: "", strategy: null, run: null, strategies: [] };
const tabs = ["overview", "create", "strategies", "policy"];
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("active");
  setTimeout(() => $("toast").classList.remove("active"), 4500);
}
async function request(path, options = {}) {
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
