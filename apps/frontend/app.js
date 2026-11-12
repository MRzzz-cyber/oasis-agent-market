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
function latestMatch(text, pattern) {
  return [...text.matchAll(pattern)].at(-1);
}
function extractDraft(goal) {
  const asset = latestMatch(goal, /\b(BTC|ETH|SOL)\b|比特币|以太坊|索拉纳/gi);
  const max = latestMatch(goal, /(?:单次|每次)[^\d；。]{0,12}(\d+(?:\.\d+)?)/g);
  const capital = latestMatch(goal, /(?:月度预算|投资本金|投资预算|总投入)[^\d；。]{0,8}(\d+(?:\.\d+)?)/g);
  const stop = latestMatch(goal, /(?:回撤|跌幅)[^\d；。]{0,8}(\d+(?:\.\d+)?)\s*%/g);
  const cadence = latestMatch(goal, /每周|每天|每日|每月/g);
  const currency = latestMatch(goal, /USDT|USDC/gi);
  return {
    asset: asset ? ({ 比特币: "BTC", 以太坊: "ETH", 索拉纳: "SOL" }[asset[0]] || asset[0].toUpperCase()) : "",
    maxOrder: max?.[1] || "", capital: capital?.[1] || "", stopPercent: stop?.[1] || "",
    cadence: cadence?.[0] === "每日" ? "每天" : cadence?.[0] || "按信号触发",
    quoteAsset: currency?.[0].toUpperCase() || "USDT"
  };
}
function validateDraft(value) {
  if (!value || !["BTC", "ETH", "SOL"].includes(value.asset)) demoError("请确认投资标的");
  if (!["USDT", "USDC"].includes(value.quoteAsset)) demoError("请选择投资金额币种");
  const amount = (raw, label) => {
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(String(raw)) || Number(raw) <= 0) demoError(label + "需为大于 0 的金额，最多 6 位小数");
    return String(raw);
  };
  const maxOrder = amount(value.maxOrder, "单次上限");
  const capital = value.capital ? amount(value.capital, "投资预算") : "";
  if (capital && Number(maxOrder) > Number(capital)) demoError("单次上限不能超过投资预算");
  if (!["每周", "每天", "每月", "按信号触发"].includes(value.cadence)) demoError("请选择执行节奏");
  const stopPercent = String(value.stopPercent || "");
  if (stopPercent && (!/^\d+(?:\.\d{1,2})?$/.test(stopPercent) || Number(stopPercent) <= 0 || Number(stopPercent) > 100)) demoError("暂停回撤需在 0–100% 之间，且大于 0");
  return { asset: value.asset, quoteAsset: value.quoteAsset, maxOrder, capital, cadence: value.cadence, stopPercent };
}
function simulateRun(strategy, scenario = "normal") {
  const terms = validateDraft(strategy.terms);
  const drawdown = scenario === "stress" ? 8 : 1;
  const blocked = Boolean(terms.stopPercent) && drawdown >= Number(terms.stopPercent);
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
    demoEvent("committee", "演示模型观点（未调用）", models.map((m, i) => m + "：" + votes[i].action).join("；")),
    demoEvent("policy", "模拟参数检查完成", "已核对确认的单次上限 " + terms.maxOrder + " " + terms.quoteAsset + "；服务预算独立。回撤按所选样本校验，累计预算未校验。"),
    demoEvent("decision", "形成模拟交易建议", "示例建议买入 " + asset + "，金额 " + terms.maxOrder + " " + terms.quoteAsset + "，不超过确认的单次上限。使用预置示例信号，不是投资建议。"),
    demoEvent("approval", "等待用户确认", "只有用户点击确认后，才会创建本地模拟订单。")
  ];
  return {
    id: crypto.randomUUID(), strategyId: strategy.id, goal: strategy.goal, asset,
    scenario, drawdown, status: blocked ? "blocked" : "awaiting_approval", paymentMode: "demo",
    payment: { status: "not_paid_demo", network: "eip155:84532", amountAtomic: "0" },
    operatingBudget: { limit: strategy.budget || "5", spent: "0", simulatedQuote: "0.10" },
    terms, votes, proposedOrder: blocked ? null : { side: "BUY", asset, amount: terms.maxOrder, quoteAsset: terms.quoteAsset, mode: "simulation" },
    events: blocked ? events.slice(0, 4).concat(demoEvent("policy", "触发暂停规则", "示例回撤达到已确认阈值，未生成订单。")) : events, createdAt: new Date().toISOString()
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
    const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
    if (typeof goal !== "string" || goal.length < 4 || goal.length > 2000) demoError("请补充投资目标");
    const raw = String(body.budget ?? "5");
    if (!/^\d+(\.\d{1,6})?$/.test(raw)) demoError("服务预算格式不正确");
    const [whole, decimals = ""] = raw.split(".");
    const atomic = BigInt(whole) * 1000000n + BigInt(decimals.padEnd(6, "0") || "0");
    if (atomic < 100000n || atomic > 100000000n) demoError("Agent 服务预算需在 0.10–100 USDC 之间");
    const terms = validateDraft(body.terms);
    const asset = terms.asset;
    const strategy = {
      id: crypto.randomUUID(), goal, asset, terms, conversation: Array.isArray(body.conversation) ? body.conversation : [], budgetAtomic: atomic.toString(), budget: raw,
      model: body.model || "OpenRouter model", modelId: body.modelId || null,
      committee: Array.isArray(body.committee) ? body.committee : [],
      mode: "simulation", needsApproval: true, status: "draft", createdAt: new Date().toISOString()
    };
    db.strategies.push(strategy); writeDemoState(db); return strategy;
  }
  if (method === "GET" && path === "/api/runs") return db.runs;
  if (method === "POST" && path === "/api/runs") {
    let body; try { body = JSON.parse(options.body || "{}"); } catch { demoError("输入格式不正确"); }
    const strategy = db.strategies.find(x => x.id === body.strategyId);
    if (!strategy) demoError("找不到这条策略");
    const run = simulateRun(strategy, body.scenario === "stress" ? "stress" : "normal"); db.runs.push(run); writeDemoState(db); return run;
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
  $("model-primary").title = model
    ? model.provider + " · 上下文 " + (model.contextLength ? model.contextLength.toLocaleString("zh-CN") : "未知") +
      " · 输入 " + formatModelPrice(model.inputPricePerMillion) + " · 输出 " + formatModelPrice(model.outputPricePerMillion)
    : "请选择一个模型";
}
function renderModelOptions() {
  const select = $("model-primary");
  let saved;
  try { saved = localStorage.getItem("oasis-advisor-model"); } catch {}
  const preferred = [saved, "openai/gpt-5.6-sol", "openrouter/free"]
    .map(id => availableModels.find(model => model.id === id)).find(Boolean) || availableModels[0];
  select.replaceChildren();
  for (const model of [preferred, ...availableModels.filter(item => item !== preferred)]) {
    select.add(new Option(model.name + (model.isFree ? " · 免费" : ""), model.id));
  }
  select.value = preferred.id;
  select.disabled = false;
  $("model-status").textContent = "";
  updateModelLabels();
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
  const draft = extractDraft(state.goal);
  for (const [key, id] of Object.entries({ asset: "draft-asset", maxOrder: "draft-max", capital: "draft-capital", cadence: "draft-cadence", quoteAsset: "draft-currency", stopPercent: "draft-stop" })) $(id).value = draft[key];
  $("draft-panel").classList.remove("hidden");
}
function confirmedDraft() {
  return validateDraft({ asset: $("draft-asset").value, maxOrder: $("draft-max").value, capital: $("draft-capital").value,
    cadence: $("draft-cadence").value, quoteAsset: $("draft-currency").value, stopPercent: $("draft-stop").value });
}
function appendUserMessage(value) {
  if (state.conversation.at(-1)?.role === "user") {
    const pending = state.conversation.at(-1);
    if ((pending.content + "；补充：" + value).length > 2000) throw Error("待发送消息合计不能超过 2000 字，请先重试上一条");
    pending.content += "；补充：" + value;
    const messages = $("chat-messages").querySelectorAll(".chat-message.user p");
    messages[messages.length - 1].textContent = pending.content;
  } else addChat("user", value);
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
  for (const id of ["ai-retry", "create-strategy", "change-model", "model-primary"]) $(id).disabled = true;
  $("ai-usage").textContent = "正在调用 " + (state.modelName || state.model) + " · 实时流式响应";
  let assistantText = null;
  try {
    const messages = (state.conversation.length > 12 ? [state.conversation[0], ...state.conversation.slice(-11)] : state.conversation).map(({ role, content }) => ({ role, content }));
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
    assistantText = addChat("assistant", "");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", fullText = "", usage = null, returnedModel = state.model, streamComplete = false;
    const consume = (line) => {
      if (!line.startsWith("data:")) return;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") { streamComplete = true; return; }
      if (!raw) return;
      let chunk;
      try { chunk = JSON.parse(raw); } catch { return; }
      if (chunk.error?.message) throw new Error(chunk.error.message);
      if (chunk.choices?.some(choice => choice.finish_reason)) streamComplete = true;
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
    if (!streamComplete) throw new Error("模型响应提前中断，请重试");
    if (!fullText.trim()) throw new Error("模型没有返回文本，请更换模型或重试");
    state.conversation[state.conversation.length - 1].content = fullText;
    const parts = ["真实模型", returnedModel];
    if (usage?.prompt_tokens != null) parts.push("输入 " + usage.prompt_tokens + " tokens");
    if (usage?.completion_tokens != null) parts.push("输出 " + usage.completion_tokens + " tokens");
    $("ai-usage").textContent = parts.join(" · ");
  } catch (error) {
    if (assistantText && !assistantText.textContent.trim()) {
      assistantText.closest(".chat-message")?.remove();
      if (state.conversation.at(-1)?.role === "assistant") state.conversation.pop();
    } else if (assistantText) {
      assistantText.textContent += "\n（响应中断，点击连接并重试）";
      if (state.conversation.at(-1)?.role === "assistant") state.conversation.pop();
    }
    $("ai-usage").textContent = "调用失败：" + error.message + "。没有生成模拟回答，可以重试。";
    toast(error.message);
  } finally {
    chatBusy = false; button.disabled = false; button.textContent = "发送给真实模型";
    for (const id of ["ai-retry", "create-strategy", "change-model"]) $(id).disabled = false;
    $("model-primary").disabled = !availableModels.length;
  }
}
function beginConversation() {
  if (chatBusy) { toast("请等待当前模型回复完成"); return; }
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
  const [items, runs] = await Promise.all([request("/api/strategies"), request("/api/runs")]); state.strategies = items;
  const root = $("strategy-list"); root.replaceChildren();
  if (!items.length) root.appendChild(node("p", "note", "还没有策略。先在总览与 Oasis 讨论一个投资想法。"));
  for (const item of items) {
    const article = node("article", "strategy-card");
    const info = node("div"); info.append(node("strong", "", item.asset + " · " + item.goal), node("p", "note", "主模型 " + (item.model || "未记录") + " · " + (item.committee?.length || 0) + " 个协作模型 · 模拟模式"));
    const btn = node("button", "primary", item.terms ? "运行策略" : "补全旧策略");
    btn.addEventListener("click", async () => {
      if (!item.terms) {
        if (chatBusy) { toast("请等待模型回复完成"); return; }
        state.goal = item.goal; state.conversation = [];
        $("goal").value = item.goal; $("chat-messages").replaceChildren();
        for (const message of item.conversation || [{ role: "user", content: item.goal }]) addChat(message.role, message.content);
        makeDraftSummary(); showTab("create");
        toast("请补全并确认单次上限；保存后会创建新策略"); return;
      }
      try { state.run = await request("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: item.id }) }); renderRun(); }
      catch (error) { toast(error.message); }
    });
    const history = runs.filter(run => run.strategyId === item.id).reverse();
    const actions = node("div", "action-row"); actions.appendChild(btn);
    if (history.length) {
      const select = node("select", "run-history"); select.setAttribute("aria-label", "选择历史运行");
      for (const run of history) {
        const status = ({ blocked: "风控暂停", awaiting_approval: "待确认", simulated: "已创建订单", monitoring: "跟踪中", rejected: "已拒绝" })[run.status] || run.status;
        const option = node("option", "", new Date(run.createdAt).toLocaleString("zh-CN") + " · " + status);
        option.value = run.id; select.appendChild(option);
      }
      const resume = node("button", "ghost", "查看运行记录（" + history.length + "）");
      resume.addEventListener("click", () => { state.run = history.find(run => run.id === select.value); renderRunContent(); $("run-panel").scrollIntoView({ behavior: "smooth" }); });
      actions.append(select, resume);
    }
    article.append(info, actions); root.appendChild(article);
  }
  if (state.run) renderRunContent();
}
function renderRunContent() {
  const run = state.run; if (!run) return;
  $("run-panel").classList.remove("hidden");
  const flow = $("flowchart"); flow.replaceChildren();
  const terms = run.terms || {};
  const quote = terms.quoteAsset || run.proposedOrder?.quoteAsset || "USDC";
  const rows = [
    ["策略授权", run.asset + " · " + (terms.cadence || "历史策略"), "单次上限 " + (terms.maxOrder || run.proposedOrder?.amountUsdc || "未记录") + " " + quote],
    ["行情样本", run.drawdown == null ? "历史演示信号" : "示例回撤 " + run.drawdown + "%", "预置场景 · 无实时行情"],
    ["数据报价", (run.operatingBudget?.simulatedQuote || "0.10") + " USDC", "服务预算 " + (run.operatingBudget?.limit || "未记录") + " USDC · 实付 0"],
    ["模拟评审", (run.votes || []).map(v => v.model + " · " + v.action).join(" / "), "预置投票 · 未调用评审模型"],
    ["暂停规则", terms.stopPercent ? "回撤达到 " + terms.stopPercent + "% 时暂停" : "未设置回撤阈值", run.status === "blocked" ? "已触发 · 停止生成订单" : run.drawdown == null ? "历史记录未校验回撤" : "当前样本未触发暂停"]
  ];
  for (const [label, result, detail] of rows) {
    const row = node("div", "ledger-step");
    row.append(node("span", "ledger-label", label), node("strong", "", result), node("small", "", detail));
    flow.appendChild(row);
  }
  if (terms.asset) {
    const next = run.scenario === "stress" ? "normal" : "stress";
    const replay = node("button", "ghost", next === "stress" ? "用 8% 回撤样本重新运行" : "用 1% 回撤样本重新运行");
    replay.onclick = async () => {
      replay.disabled = true;
      try {
        state.run = await request("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: run.strategyId, scenario: next }) });
        await refreshStrategies();
      } catch (error) { replay.disabled = false; toast(error.message); }
    };
    flow.appendChild(replay);
  }
  const decision = $("decision"); decision.replaceChildren();
  if (run.status === "blocked") {
    decision.append(node("h3", "", "已暂停 · 本次没有模拟订单"), node("p", "note", "样本回撤 " + run.drawdown + "% 已达到你设置的 " + terms.stopPercent + "% 暂停阈值。"));
    renderOrderFollowup(run); return;
  }
  decision.append(node("h3", "", "模拟订单 · " + run.asset), node("div", "order-proposal", "建议模拟买入 " + run.asset + " · " + (run.proposedOrder.amount || run.proposedOrder.amountUsdc) + " " + quote));
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
$("model-primary").addEventListener("change", () => {
  updateModelLabels();
  try { localStorage.setItem("oasis-advisor-model", state.model); } catch {}
});

$("change-model").addEventListener("click", () => { showTab("overview"); $("model-primary").focus(); });
$("chat-form").addEventListener("submit", event => {
  event.preventDefault(); const value = $("chat-input").value.trim(); if (!value || chatBusy) return;
  try { appendUserMessage(value); } catch (error) { toast(error.message); return; }
  state.goal = (state.goal + "；补充要求：" + value).slice(-2000); $("chat-input").value = "";
  makeDraftSummary();
  sendToRealModel();
});
$("create-strategy").addEventListener("click", async () => {
  try {
    if (chatBusy) return;
    updateModelLabels();
    const terms = confirmedDraft();
    const result = await request("/api/strategies", { method: "POST", body: JSON.stringify({ goal: state.goal, budget: $("budget").value, model: state.modelName, modelId: state.model, committee: state.committee, terms, conversation: state.conversation }) });
    state.strategy = result; toast("策略已保存"); showTab("strategies");
  } catch (error) { toast(error.message); }
});

checkAiStatus();

$("ai-retry").addEventListener("click", () => { if (state.conversation.at(-1)?.role === "user") sendToRealModel(); else toast("请输入新的消息后发送"); });
