const $ = (id) => document.getElementById(id);
const state = { goal: "", strategy: null, run: null, strategies: [], model: "", modelName: "", committee: [], conversation: [] };
const tabs = ["overview", "create", "strategies", "policy"];
let availableModels = [];
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("active");
  setTimeout(() => $("toast").classList.remove("active"), 3500);
}
const browserOnlyDemo = true;
const demoStorageKey = "oasis-demo-v1";
const demoMemory = { strategies: [], runs: [] };
function readDemoState() {
  try {
    const data = JSON.parse(localStorage.getItem(demoStorageKey));
    if (data && Array.isArray(data.strategies) && Array.isArray(data.runs)) return data;
  } catch {}
  return demoMemory;
}
function writeDemoState(data) {
  demoMemory.strategies = data.strategies; demoMemory.runs = data.runs;
  try { localStorage.setItem(demoStorageKey, JSON.stringify(data)); } catch {}
}
function demoError(message) { throw new Error(message); }
function demoEvent(type, message, detail = "") {
  return { id: crypto.randomUUID(), type, message, detail, at: new Date().toISOString() };
}
function simulateRun(strategy) {
  const models = strategy.committee?.length ? strategy.committee : [strategy.model || "主模型"];
  const votes = models.map((model, i) => ({
    model, action: i === 1 ? "HOLD" : "BUY",
    rationale: i === 1 ? "示例判断：建议等待更多确认信号。" : "示例判断：策略条件初步满足，仍需通过风险检查。"
  }));
  const asset = strategy.asset;
  const events = [
    demoEvent("goal", "读取策略目标", "Agent 读取用户的投资目标、资产偏好和执行约束。"),
    demoEvent("market", "发现市场研究任务", "此处使用预置演示信号，不代表实时行情或链上数据。"),
    demoEvent("service", "发现数据服务报价", "Market Signal API · 演示报价 0.10 USDC；没有发起真实请求或付款。"),
    demoEvent("committee", "多模型委员会完成讨论", models.map((m, i) => m + "：" + votes[i].action).join("；")),
    demoEvent("policy", "Policy Engine 风险检查通过", "检查模拟模式、单笔上限、服务预算和用户授权；Agent 无权修改这些规则。"),
    demoEvent("decision", "形成模拟交易建议", "示例建议买入 " + asset + "，金额 80 USDC。此结果为固定演示数据，不是投资建议。"),
    demoEvent("approval", "等待用户确认", "只有用户点击确认后，才会创建本地模拟订单。")
  ];
  return {
    id: crypto.randomUUID(), strategyId: strategy.id, goal: strategy.goal, asset,
    status: "awaiting_approval", paymentMode: "demo",
    payment: { status: "not_paid_demo", network: "eip155:84532", amountAtomic: "0" },
    operatingBudget: { limit: strategy.budget || "5", spent: "0", simulatedQuote: "0.10" },
    votes, proposedOrder: { side: "BUY", asset, amountUsdc: "80.00", mode: "simulation" },
    events, createdAt: new Date().toISOString()
  };
}
async function browserDemoRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const parts = path.split("/").filter(Boolean);
  const db = readDemoState();
  if (method === "GET" && path === "/api/status") return { ok: true, mode: "simulation", realPaymentsEnabled: false };
  if (method === "GET" && path === "/api/strategies") return db.strategies;
  if (method === "POST" && path === "/api/strategies") {
    let body; try { body = JSON.parse(options.body || "{}"); } catch { demoError("输入格式不正确"); }
    const goal = body.goal?.trim();
    if (typeof goal !== "string" || goal.length < 4 || goal.length > 2000) demoError("请补充投资目标");
    const raw = String(body.budget ?? "5");
    if (!/^\d+(\.\d{1,6})?$/.test(raw)) demoError("服务预算格式不正确");
    const [whole, decimals = ""] = raw.split(".");
    const atomic = BigInt(whole) * 1000000n + BigInt(decimals.padEnd(6, "0") || "0");
    if (atomic < 100000n || atomic > 100000000n) demoError("Agent 服务预算需在 0.10–100 USDC 之间");
    const asset = /\bBTC\b|比特币/i.test(goal) ? "BTC" : /\bSOL\b|索拉纳/i.test(goal) ? "SOL" : "ETH";
    const strategy = {
      id: crypto.randomUUID(), goal, asset, budgetAtomic: atomic.toString(), budget: raw,
      model: body.model || "GPT-5.6", committee: Array.isArray(body.committee) ? body.committee : [],
      mode: "simulation", needsApproval: true, status: "draft", createdAt: new Date().toISOString()
    };
    db.strategies.push(strategy); writeDemoState(db); return strategy;
  }
  if (method === "POST" && path === "/api/runs") {
    let body; try { body = JSON.parse(options.body || "{}"); } catch { demoError("输入格式不正确"); }
    const strategy = db.strategies.find(x => x.id === body.strategyId);
    if (!strategy) demoError("找不到这条策略");
    const run = simulateRun(strategy); db.runs.push(run); writeDemoState(db); return run;
  }
  if (parts[0] === "api" && parts[1] === "runs" && parts[2]) {
    const run = db.runs.find(x => x.id === parts[2]);
    if (!run) demoError("找不到这次运行记录");
    if (method === "GET" && parts.length === 3) return run;
    if (method === "POST" && parts.length === 4 && ["approve", "reject", "monitor", "review"].includes(parts[3])) {
      const action = parts[3];
      if (action === "approve" || action === "reject") {
        if (run.status !== "awaiting_approval") demoError("这条建议已经处理过了");
        if (action === "approve") {
          run.status = "simulated";
          run.order = { id: crypto.randomUUID(), ...run.proposedOrder, status: "simulated", executedAt: new Date().toISOString(), simulated: true };
          run.events.push(demoEvent("order", "模拟订单已创建", "订单只保存在本浏览器，没有连接交易所或链上执行。"));
        } else {
          run.status = "rejected"; run.events.push(demoEvent("rejected", "用户暂不执行", "建议已记录，没有创建订单。"));
        }
      } else if (action === "monitor") {
        if (!run.order) demoError("请先确认模拟订单");
        run.status = "monitoring"; run.monitoringStartedAt = new Date().toISOString();
      } else {
        if (!run.order) demoError("请先创建模拟订单");
        run.review = { createdAt: new Date().toISOString(), summary: "订单与决策记录已保存。当前版本没有接入实时行情，因此不计算盈亏，也不伪造投资表现。", lessons: ["核对策略是否符合原始目标", "检查模型分歧与风险约束", "接入真实数据后再评估策略表现"] };
      }
      writeDemoState(db); return run;
    }
  }
  demoError("演示接口不存在");
}
async function request(path, options = {}) {
  if (browserOnlyDemo) return browserDemoRequest(path, options);
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
function showApp() { $("landing").classList.add("hidden"); $("workspace").classList.remove("hidden"); showTab("overview"); }
function showSite() { $("landing").classList.remove("hidden"); $("workspace").classList.add("hidden"); }
function showTab(tab) {
  if (!tabs.includes(tab)) return;
  for (const id of tabs) $("page-" + id).classList.toggle("hidden", id !== tab);
  document.querySelectorAll("[data-tab]").forEach(n => n.classList.toggle("selected", n.dataset.tab === tab));
  $("breadcrumb").textContent = ({ overview: "总览", create: "创建策略", strategies: "我的策略", policy: "预算与权限" })[tab];
  if (tab === "strategies") refreshStrategies();
}
function node(tag, cls, text) {
  const el = document.createElement(tag); if (cls) el.className = cls;
  if (text != null) el.textContent = String(text); return el;
}
function getSelectedCommittee() { return []; }
function selectedModel() {
  const id = $("model-primary").value;
  return availableModels.find(item => item.id === id) || null;
}
function formatModelPrice(value) {
  if (value == null) return "价格未知";
  if (value === 0) return "免费";
  return "$" + value.toFixed(value >= 1 ? 2 : 4) + " / 百万 Token";
}
function updateModelLabels() {
  const model = selectedModel();
  state.model = model?.id || "";
  state.modelName = model?.name || "";
  state.committee = [];
  $("active-model-label").textContent = model ? model.name : "未选择模型";
  $("policy-model").textContent = model ? model.name + "（OpenRouter）" : "未选择模型";
  $("model-meta").textContent = model
    ? model.provider + " · 上下文 " + (model.contextLength ? model.contextLength.toLocaleString("zh-CN") : "未知") +
      " · 输入 " + formatModelPrice(model.inputPricePerMillion) + " · 输出 " + formatModelPrice(model.outputPricePerMillion)
    : "请选择一个模型";
}
function renderModelOptions() {
  const query = $("model-search").value.trim().toLowerCase();
  const matches = availableModels.filter(model =>
    !query || (model.name + " " + model.id + " " + model.provider).toLowerCase().includes(query)
  );
  const visible = query ? matches.slice(0, 150) : matches.slice(0, 60);
  const select = $("model-primary");
  const current = state.model || select.value;
  select.replaceChildren();
  for (const model of visible) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.name + " · " + model.provider + (model.isFree ? " · 免费" : "");
    select.appendChild(option);
  }
  if (visible.some(model => model.id === current)) select.value = current;
  else {
    select.add(new Option(query ? "请选择搜索结果中的模型" : "请选择模型", ""));
    select.value = "";
  }
  select.disabled = visible.length === 0;
  $("model-status").textContent = query
    ? "找到 " + matches.length + " 个模型" + (matches.length > visible.length ? " · 当前显示前 " + visible.length + " 个" : "")
    : "OpenRouter · " + availableModels.length + " 个模型 · 显示最新 60 个，可搜索全部";
  if (select.value) updateModelLabels();
}
async function loadModels() {
  const status = $("model-status");
  const select = $("model-primary");
  status.textContent = "正在获取 OpenRouter 模型目录…";
  select.disabled = true;
  try {
    const response = await fetch("/api/ai/models", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "模型目录获取失败");
    if (!Array.isArray(payload.models) || !payload.models.length) throw new Error("OpenRouter 暂无可用模型");
    availableModels = payload.models;
    renderModelOptions();
    $("ai-runtime-status").textContent = "已连接 OpenRouter · " + availableModels.length + " 个可选模型";
    return payload;
  } catch (error) {
    status.textContent = error.message;
    select.replaceChildren(new Option("模型目录加载失败", ""));
    select.disabled = true;
    $("model-meta").textContent = "请检查 Cloudflare Worker 部署和 OpenRouter 模型目录接口";
    $("ai-runtime-status").textContent = "OpenRouter 模型目录不可用";
    throw error;
  }
}
function addChat(role, content) {
  state.conversation.push({ role, content });
  const box = $("chat-messages");
  const msg = node("div", "chat-message " + role);
  msg.appendChild(node("span", "chat-role", role === "user" ? "你" : "Oasis"));
  const paragraph = node("p", "", content);
  msg.appendChild(paragraph); box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
  return paragraph;
}
function makeDraftSummary() {
  const goal = state.goal;
  const asset = /\bBTC\b|比特币/i.test(goal) ? "BTC" : /\bSOL\b|索拉纳/i.test(goal) ? "SOL" : "ETH";
  const cadence = /每周|周定投/.test(goal) ? "每周" : /每天|每日/.test(goal) ? "每天" : /每月|月定投/.test(goal) ? "每月" : "按信号触发";
  const amount = goal.match(/(?:预算|最多花|不超过|上限)[^\d]{0,8}(\d+(?:\.\d+)?)/);
  const max = goal.match(/(?:单次|每次)[^\d]{0,8}(\d+(?:\.\d+)?)/);
  const stop = goal.match(/(?:回撤|跌幅)[^\d]{0,8}(\d+(?:\.\d+)?)/);
  const items = [
    ["投资标的", asset],
    ["执行节奏", cadence],
    ["预算约束", amount ? amount[1] + " USDT（从对话提取，待确认）" : "尚未明确，建议在策略中补充"],
    ["单次上限", max ? max[1] + " USDT" : "待确认"],
    ["风险条件", stop ? "回撤达到 " + stop[1] + "% 时暂停" : "每次运行前执行风险检查"],
    ["执行方式", "模拟交易，每笔订单由你确认"]
  ];
  const root = $("draft-summary"); root.replaceChildren();
  for (const [label, value] of items) {
    const row = node("div", "draft-row"); row.append(node("span", "", label), node("strong", "", value)); root.appendChild(row);
  }
  $("draft-panel").classList.remove("hidden");
}
let chatBusy = false;
async function checkAiStatus() {
  try {
    const res = await fetch("/api/ai/status", { cache: "no-store" });
    if (!res.ok) throw Error("API 未部署");
    const status = await res.json();
    $("ai-runtime-status").textContent = status.openRouterConfigured
      ? "OpenRouter API Key 已配置"
      : "模型目录可浏览，但管理员尚未配置 OpenRouter API Key";
    if (!status.enabled) $("ai-usage").textContent = "管理员尚未设置 OASIS_DEMO_ACCESS_CODE，真实调用暂不可用。";
    await loadModels();
    if (!status.openRouterConfigured) $("model-status").textContent += " · 等待配置 API Key";
    return status;
  } catch (error) {
    $("ai-runtime-status").textContent = "OpenRouter 尚未连接";
    $("model-status").textContent = error.message;
    return null;
  }
}
async function sendToRealModel() {
  if (chatBusy || !state.conversation.length) return;
  const code = $("ai-access-code").value.trim();
  if (!code) { $("ai-usage").textContent = "请先输入私人体验码，才能调用真实 API。"; return; }
  if (!state.model) { $("ai-usage").textContent = "请先返回总览，选择一个 OpenRouter 模型。"; return; }
  chatBusy = true;
  const button = $("chat-submit"); button.disabled = true; button.textContent = "模型思考中…";
  $("ai-usage").textContent = "正在调用 " + (state.modelName || state.model) + " · 实时流式响应";
  try {
    const messages = state.conversation.slice(-12).map(({ role, content }) => ({ role, content }));
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-oasis-access-code": code },
      body: JSON.stringify({ model: state.model, messages })
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || "模型调用失败（HTTP " + response.status + "）");
    }
    if (!response.body) throw new Error("浏览器未收到模型流式响应");
    const assistantText = addChat("assistant", "");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", fullText = "", usage = null, returnedModel = state.model;
    const consume = (line) => {
      if (!line.startsWith("data:")) return;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") return;
      let chunk;
      try { chunk = JSON.parse(raw); } catch { return; }
      if (chunk.error?.message) throw new Error(chunk.error.message);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        fullText += delta;
        assistantText.textContent = fullText;
        $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
      }
      if (chunk.model) returnedModel = chunk.model;
      if (chunk.usage) usage = chunk.usage;
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer.trim());
    if (!fullText.trim()) throw new Error("模型没有返回文本，请更换模型或重试");
    state.conversation[state.conversation.length - 1].content = fullText;
    const parts = ["真实模型", returnedModel];
    if (usage?.prompt_tokens != null) parts.push("输入 " + usage.prompt_tokens + " tokens");
    if (usage?.completion_tokens != null) parts.push("输出 " + usage.completion_tokens + " tokens");
    $("ai-usage").textContent = parts.join(" · ");
  } catch (error) {
    $("ai-usage").textContent = "调用失败：" + error.message + "。没有生成模拟回答，可以重试。";
    toast(error.message);
  } finally { chatBusy = false; button.disabled = false; button.textContent = "发送给真实模型"; }
}
function beginConversation() {
  state.goal = $("goal").value.trim();
  if (!state.goal) return;
  updateModelLabels();
  if (!state.model) { toast("请先在总览中选择一个 OpenRouter 模型"); showTab("overview"); return; }
  state.conversation = [];
  $("chat-messages").replaceChildren();
  addChat("user", state.goal);
  sendToRealModel();
  makeDraftSummary();
  $("draft-panel").classList.remove("hidden");
  $("chat-input").value = "";
  showTab("create");
}
async function refreshStrategies() {
  const items = await request("/api/strategies"); state.strategies = items;
  const root = $("strategy-list"); root.replaceChildren();
  if (!items.length) root.appendChild(node("p", "note", "还没有策略。先在总览与 Oasis 讨论一个投资想法。"));
  for (const item of items) {
    const article = node("article", "strategy-card");
    const info = node("div"); info.append(node("strong", "", item.asset + " · " + item.goal), node("p", "note", "主模型 " + (item.model || "未记录") + " · " + (item.committee?.length || 0) + " 个协作模型 · 模拟模式"));
    const btn = node("button", "primary", "运行策略");
    btn.addEventListener("click", async () => {
      try { state.run = await request("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: item.id }) }); renderRun(); }
      catch (error) { toast(error.message); }
    });
    article.append(info, btn); root.appendChild(article);
  }
  if (state.run) renderRunContent();
}
const flowInfo = {
  goal: ["理解用户目标", "读取你输入的目标和约束，形成可执行任务。"],
  market: ["发现研究任务", "判断需要哪些市场信息。当前为预置示例，不是真实行情。"],
  service: ["发现数据服务", "找到数据服务并展示报价。当前不会向服务商发起请求或付款。"],
  committee: ["多模型讨论", "展示你选择的模型及其示例观点。当前不是实际模型推理。"],
  policy: ["Policy Engine 检查", "检查预算、白名单、单次上限和授权边界。Agent 不能自行修改权限。"],
  decision: ["形成交易建议", "汇总研究结果，生成待确认的模拟订单。"],
  approval: ["等待用户授权", "用户可以确认或拒绝。未确认前不会创建订单。"],
  order: ["模拟订单已创建", "订单保存在当前浏览器，不会发送到交易所或区块链。"],
  rejected: ["建议已拒绝", "已记录用户决定，没有创建订单。"]
};
function renderRunContent() {
  const run = state.run; if (!run) return;
  $("run-panel").classList.remove("hidden");
  const flow = $("flowchart"); flow.replaceChildren();
  const events = run.events || [];
  events.forEach((e, i) => {
    const meta = flowInfo[e.type] || [e.message, e.detail || ""];
    const button = node("button", "flow-node" + (i === 0 ? " active" : ""));
    button.append(node("span", "flow-number", String(i + 1).padStart(2, "0")), node("span", "flow-title", meta[0]), node("span", "flow-state", e.type === "order" ? "已完成" : e.type === "approval" && run.status === "awaiting_approval" ? "待确认" : "完成"));
    button.addEventListener("click", () => {
      flow.querySelectorAll(".flow-node").forEach(n => n.classList.remove("active")); button.classList.add("active");
      $("flow-detail").replaceChildren(node("strong", "", meta[0]), node("p", "", e.detail || meta[1]), node("small", "", new Date(e.at).toLocaleString("zh-CN")));
    });
    flow.appendChild(button);
    if (i < events.length - 1) flow.appendChild(node("div", "flow-connector", "↓"));
  });
  if (events.length) flow.querySelector(".flow-node")?.click();
  const decision = $("decision"); decision.replaceChildren();
  decision.append(node("h3", "", "模拟订单建议 · " + run.asset), node("p", "note", "示例委员会：" + (run.votes || []).map(v => v.model + " " + v.action).join(" / ")));
  const votes = node("div", "vote-grid");
  (run.votes || []).forEach(v => { const card = node("div", "vote-card"); card.append(node("strong", "", v.model), node("span", v.action === "BUY" ? "vote-buy" : "vote-hold", v.action === "BUY" ? "倾向买入" : "建议观望"), node("p", "", v.rationale)); votes.appendChild(card); });
  decision.appendChild(votes);
  decision.append(node("div", "order-proposal", "建议模拟买入 " + run.asset + " · " + run.proposedOrder.amountUsdc + " USDC"));
  decision.append(node("p", "note", "真实数据采购费用：0 USDC · 真实交易金额：0 USDC。当前所有结论均为固定演示内容。"));
  if (run.status === "awaiting_approval") {
    const actions = node("div", "action-row");
    for (const [action, label] of [["approve", "确认模拟订单"], ["reject", "拒绝建议"]]) {
      const btn = node("button", action === "approve" ? "primary" : "ghost", label);
      btn.addEventListener("click", async () => { try { state.run = await request("/api/runs/" + run.id + "/" + action, { method: "POST", body: "{}" }); renderRunContent(); } catch (e) { toast(e.message); } });
      actions.appendChild(btn);
    }
    decision.appendChild(actions);
  } else if (run.status === "simulated" || run.status === "monitoring") {
    decision.append(node("strong", "", run.status === "monitoring" ? "模拟订单跟踪中" : "模拟订单已创建"));
  } else decision.append(node("strong", "", "你已拒绝这条建议"));
  renderOrderFollowup(run);
}
function renderOrderFollowup(run) {
  const root = $("order-followup"); root.replaceChildren(); root.classList.add("hidden");
  if (!run.order) return;
  root.classList.remove("hidden");
  root.append(node("h3", "", "订单后续"), node("p", "note", "订单编号：" + run.order.id.slice(0, 8) + " · 创建时间：" + new Date(run.order.executedAt).toLocaleString("zh-CN")));
  const status = node("div", "order-status");
  status.append(node("span", "", "订单状态"), node("strong", "", run.status === "monitoring" ? "跟踪中（模拟）" : "已创建（模拟）"));
  root.appendChild(status);
  const actions = node("div", "action-row");
  if (run.status !== "monitoring") {
    const monitor = node("button", "primary", "开始跟踪");
    monitor.addEventListener("click", async () => { state.run = await request("/api/runs/" + run.id + "/monitor", { method: "POST", body: "{}" }); renderRunContent(); });
    actions.appendChild(monitor);
  }
  const review = node("button", "ghost", run.review ? "刷新复盘" : "生成复盘");
  review.addEventListener("click", async () => { state.run = await request("/api/runs/" + run.id + "/review", { method: "POST", body: "{}" }); renderRunContent(); });
  actions.appendChild(review);
  const again = node("button", "ghost", "再次运行策略");
  again.addEventListener("click", async () => { state.run = await request("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: run.strategyId }) }); renderRunContent(); });
  actions.appendChild(again); root.appendChild(actions);
  if (run.review) {
    root.append(node("h4", "", "模拟复盘"), node("p", "", run.review.summary));
    const ul = node("ul", "review-list"); run.review.lessons.forEach(x => ul.appendChild(node("li", "", x))); root.appendChild(ul);
  }
}
function renderRun() { showTab("strategies"); $("run-panel").scrollIntoView({ behavior: "smooth", block: "start" }); }
for (const id of ["enter", "enter2"]) $(id).addEventListener("click", showApp);
$("back-site").addEventListener("click", showSite);
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => showTab(button.dataset.tab)));
document.querySelectorAll("[data-example]").forEach(button => button.addEventListener("click", () => { $("goal").value = button.dataset.example; $("goal").focus(); }));
$("goal-form").addEventListener("submit", event => { event.preventDefault(); beginConversation(); });
$("model-primary").addEventListener("change", updateModelLabels);
$("model-search").addEventListener("input", renderModelOptions);
$("change-model").addEventListener("click", () => { showTab("overview"); $("model-primary").focus(); });
$("chat-form").addEventListener("submit", event => {
  event.preventDefault(); const value = $("chat-input").value.trim(); if (!value || chatBusy) return;
  if (state.conversation.at(-1)?.role === "user") {
    sendToRealModel();
    return;
  }
  addChat("user", value); state.goal += "；补充要求：" + value; $("chat-input").value = "";
  makeDraftSummary();
  sendToRealModel();
});
$("create-strategy").addEventListener("click", async () => {
  try {
    updateModelLabels();
    const result = await request("/api/strategies", { method: "POST", body: JSON.stringify({ goal: state.goal, budget: $("budget").value, model: state.modelName, modelId: state.model, committee: state.committee }) });
    state.strategy = result; toast("策略已保存"); showTab("strategies");
  } catch (error) { toast(error.message); }
});

checkAiStatus();

$("ai-retry").addEventListener("click", () => { if (state.conversation.at(-1)?.role === "user") sendToRealModel(); else toast("请输入新的消息后发送"); });
