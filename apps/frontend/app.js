const els = {
  intentInput: document.querySelector("#intentInput"),
  pages: [...document.querySelectorAll("[data-page]")],
  pageTabs: [...document.querySelectorAll("[data-page-target]")],
  homeStartButton: document.querySelector("#homeStartButton"),
  homePolicyButton: document.querySelector("#homePolicyButton"),
  providerInput: document.querySelector("#providerInput"),
  modelInput: document.querySelector("#modelInput"),
  analyzeButton: document.querySelector("#analyzeButton"),
  chatMessages: document.querySelector("#chatMessages"),
  runButton: document.querySelector("#runButton"),
  workspaceStatus: document.querySelector("#workspaceStatus"),
  policyStatus: document.querySelector("#policyStatus"),
  assetInput: document.querySelector("#assetInput"),
  timeframeInput: document.querySelector("#timeframeInput"),
  budgetInput: document.querySelector("#budgetInput"),
  perCallInput: document.querySelector("#perCallInput"),
  riskInput: document.querySelector("#riskInput"),
  executionInput: document.querySelector("#executionInput"),
  autoPayInput: document.querySelector("#autoPayInput"),
  allowMarketInput: document.querySelector("#allowMarketInput"),
  allowRiskInput: document.querySelector("#allowRiskInput"),
  authorizeBudgetButton: document.querySelector("#authorizeBudgetButton"),
  escrowStatus: document.querySelector("#escrowStatus"),
  escrowSummary: document.querySelector("#escrowSummary"),
  checkPaymentButton: document.querySelector("#checkPaymentButton"),
  paymentStatusBadge: document.querySelector("#paymentStatusBadge"),
  paymentStatusSummary: document.querySelector("#paymentStatusSummary"),
  paymentStatusGrid: document.querySelector("#paymentStatusGrid"),
  payerBalanceValue: document.querySelector("#payerBalanceValue"),
  paymentRailValue: document.querySelector("#paymentRailValue"),
  auditReadinessValue: document.querySelector("#auditReadinessValue"),
  paymentReadinessHint: document.querySelector("#paymentReadinessHint"),
  planAuthorizationStatus: document.querySelector("#planAuthorizationStatus"),
  planAuthorizationSummary: document.querySelector("#planAuthorizationSummary"),
  strategyStatus: document.querySelector("#strategyStatus"),
  strategyName: document.querySelector("#strategyName"),
  strategyThesis: document.querySelector("#strategyThesis"),
  entryList: document.querySelector("#entryList"),
  riskList: document.querySelector("#riskList"),
  committeeStatus: document.querySelector("#committeeStatus"),
  transcriptStatus: document.querySelector("#transcriptStatus"),
  committeeTranscript: document.querySelector("#committeeTranscript"),
  strategyLane: document.querySelector("#strategyLane"),
  marketLane: document.querySelector("#marketLane"),
  riskLane: document.querySelector("#riskLane"),
  executionLane: document.querySelector("#executionLane"),
  paymentStatus: document.querySelector("#paymentStatus"),
  paymentList: document.querySelector("#paymentList"),
  x402Flow: document.querySelector("#x402Flow"),
  budgetFill: document.querySelector("#budgetFill"),
  budgetText: document.querySelector("#budgetText"),
  timeline: document.querySelector("#timeline"),
  loopStatus: document.querySelector("#loopStatus"),
  decisionBadge: document.querySelector("#decisionBadge"),
  decisionTitle: document.querySelector("#decisionTitle"),
  decisionReason: document.querySelector("#decisionReason"),
  signalScore: document.querySelector("#signalScore"),
  signalSummary: document.querySelector("#signalSummary"),
  llmProvider: document.querySelector("#llmProvider"),
  marketSource: document.querySelector("#marketSource"),
  executionStatus: document.querySelector("#executionStatus"),
  executionSummary: document.querySelector("#executionSummary"),
  auditHash: document.querySelector("#auditHash"),
  preferencesStatus: document.querySelector("#preferencesStatus"),
  preferenceLanguageInput: document.querySelector("#preferenceLanguageInput"),
  preferenceUnitInput: document.querySelector("#preferenceUnitInput"),
  preferenceDensityInput: document.querySelector("#preferenceDensityInput"),
  preferenceStartPageInput: document.querySelector("#preferenceStartPageInput"),
  preferenceMotionInput: document.querySelector("#preferenceMotionInput"),
  preferenceRememberInput: document.querySelector("#preferenceRememberInput"),
  savePreferencesButton: document.querySelector("#savePreferencesButton"),
  preferencesSummary: document.querySelector("#preferencesSummary")
};

const state = {
  intent: null,
  policy: null,
  strategyDraft: null,
  plan: null,
  latestUserMessage: "",
  sessionEscrow: {
    status: "not_authorized",
    sessionId: null,
    payerAccountId: "local-session",
    authorizedBudgetAtomic: 0,
    availableBalanceAtomic: 0,
    spentAtomic: 0,
    fundingReference: null,
    authorizedAt: null
  },
  running: false,
  activePage: "home"
};

const PAGES = [
  { id: "home", label: "Home" },
  { id: "settings", label: "Policy" },
  { id: "payment", label: "Payment" },
  { id: "setup", label: "Intent" },
  { id: "plan", label: "Agent Plan" },
  { id: "run", label: "Run" },
  { id: "decision", label: "Decision" },
  { id: "preferences", label: "Settings" }
];

const PREFERENCE_STORAGE_KEY = "oasis.preferences";
const DEFAULT_PREFERENCES = {
  language: "zh-CN",
  unit: "usdc",
  density: "comfortable",
  startPage: "home",
  motion: true,
  rememberStartPage: true
};

const UI_COPY = {
  "zh-CN": {
    nav: {
      home: "首页",
      settings: "策略设置",
      payment: "支付能力",
      setup: "交易意图",
      plan: "Agent 计划",
      run: "运行线",
      decision: "决策结果",
      preferences: "偏好设置"
    },
    homeTitle: "用对话，训练你的 AI 交易策略。",
    homeBody: "告诉 Oasis 你想怎么交易。它会追问、生成规则、判断是否需要 Market/Risk Agent，再把每一次报价、预算检查、模拟执行和审计记录展示给你。",
    homeStart: "训练我的 AI ->",
    homePolicy: "先设置预算边界",
    chatUserLabel: "你",
    chatUserText: "下次 ETH 突破时果断一点，但不要增加风险。",
    chatAiText: "你想缩短确认时间，还是提高仓位？我会先检查预算和风险边界。",
    adjustmentLabel: "AI 理解的调整",
    adjustmentTitle: "确认周期 15m -> 10m",
    adjustmentBody: "仓位 20 U · 止损 -3% 保持不变 · 仅模拟执行",
    labels: {
      assetInput: "资产",
      timeframeInput: "周期",
      budgetInput: "每次策略分析预算 USDC",
      perCallInput: "单次付费 Agent 上限 USDC",
      riskInput: "风险偏好",
      executionInput: "执行模式",
      preferenceLanguageInput: "界面语言",
      preferenceUnitInput: "金额显示",
      preferenceDensityInput: "界面密度",
      preferenceStartPageInput: "默认启动页",
      providerInput: "模型服务商",
      modelInput: "模型名"
    },
    paymentReadinessTitle: "支付能力",
    paymentReadinessBody: "检查 Base Sepolia USDC 模拟采购和本地审计状态。",
    payerBalanceTitle: "用户测试币余额",
    payerBalanceBody: "用于 Agent 在预算边界内支付 Market/Risk 服务。",
    paymentRailTitle: "支付通道",
    paymentRailBody: "Base Sepolia / USDC，策略购买为模拟模式。",
    auditReadinessTitle: "审计记录",
    auditReadinessBody: "决策摘要记录在本地会话。",
    paymentReadinessHint: "这不是用户设置项，只展示当前支付运行环境。",
    paymentStatusUnchecked: "未检查",
    paymentStatusChecking: "检查中",
    paymentStatusReady: "可运行",
    paymentStatusNeedsSetup: "需配置",
    paymentStatusHelp: "检查 Base Sepolia USDC 模拟采购和本地审计状态。",
    paymentStatusOk: (mode, network) => `${mode} / ${network} 已检查。`,
    paymentStatusMissing: (items) => `缺少配置：${items}`,
    checkPayment: "刷新支付状态",
    accountBalance: (role, account, balance) => `${role} ${account}：${balance} USDC`,
    accountBalanceUnknown: (role, account) => `${role} ${account}：未查询余额`,
    payerBalance: (balance) => `${balance} USDC`,
    payerBalanceUnknown: "未查询",
    paymentRailReady: "模拟支付可用",
    paymentRailPending: "待检查",
    auditReady: "本地审计可用",
    auditPending: "未配置",
    switches: {
      autoPay: "在预算边界内自动扣费",
      allowMarket: "允许 Market Agent 付费调用",
      allowRisk: "允许 Risk Agent 付费调用",
      motion: "启用轻微界面动效",
      remember: "下次打开时使用我的启动页"
    },
    authorizeBudget: "授权预算边界",
    reauthorizeBudget: "重新授权预算边界",
    budgetBoundaryPending: "未授权",
    budgetBoundaryAuthorized: "已授权",
    budgetBoundaryHelp: "授权本次策略预算后，Agent 可在预算边界内自动购买 Market/Risk 服务。",
    planAuthorizationPending: "等待预算授权",
    planAuthorizationPendingBody: "请先在 Policy 页授权预算边界。",
    planAuthorizationReady: "预算边界已授权",
    planAuthorizationReadyBody: (budget, perCall) => `Agent 可在 ${budget} USDC 总预算、${perCall} USDC 单次上限内自动购买付费服务。`,
    preferencesTitle: "个性化设置",
    preferencesBody: "这些偏好只保存在当前浏览器，不会改变你的交易 policy、钱包授权或 Agent 决策流程。",
    savePreferences: "保存设置",
    preferencesSaved: "已保存",
    preferencesDefault: "当前使用默认偏好。",
    preferenceOptions: {
      zh: "简体中文",
      usd: "USD 估算",
      comfortable: "舒适",
      compact: "紧凑"
    },
    intentTitle: "让 Strategy Agent 生成策略",
    intentPlaceholder: "我想做 ETH 4h 突破策略，预算边界内可自动调用必要的 Market Agent 和 Risk Agent，只做模拟交易，风险保守。",
    analyzeButton: "Strategy Agent 生成草案",
    waitingInput: "等待输入",
    emptyStrategy: "尚未生成策略",
    strategyThesis: "输入自然语言目标后，Strategy Agent 会生成策略草案、证据需求和风控边界。",
    laneWaitingGoal: "等待用户目标",
    notPlanned: "未规划",
    waitingDecision: "等待最终决策",
    noPaymentPlan: "尚未产生付费计划",
    runFullLoop: "运行完整决策循环",
    decisionWaiting: "等待运行",
    decisionReasonWaiting: "授权预算边界后运行 Agent。",
    signalWaiting: "尚未返回证据。",
    executionWaiting: "等待 Execution Agent 模拟执行。"
    ,
    runningTitle: "运行中",
    runningReason: "Strategy Agent 正在授权预算边界内执行策略。",
    policyBudgetText: (budget, perCall) => `每次策略预算 ${budget} USDC，单次付费 Agent 上限 ${perCall} USDC`,
    noPaidCall: "Strategy Agent 认为当前不需要调用付费平台 Agent。",
    finalDecisionBuy: "模拟买入",
    finalDecisionHold: "保持观察",
    finalDecisionNoTrade: "不交易",
    evidenceSynthesized: "证据已合成",
    budgetSpent: (spent, remaining) => `已使用 ${spent} USDC，剩余 ${remaining} USDC`,
    authorizedSession: (sessionId, usdc) => `预算边界 ${sessionId} 已设置为 ${usdc} USDC。`,
    escrowAuthorizing: "正在设置本次预算边界...",
    invalidBudget: "预算边界必须大于 0。",
    analyzingIntent: "Strategy Agent 正在解析用户目标",
    intentParsed: "Strategy Agent 已解析目标",
    initialConfidence: (value) => `初始置信度 ${value}`,
    confidence: (value) => `置信度 ${value}`,
    paymentCompleted: (tx) => `支付完成，交易 ${tx}`,
    marketSignalDelivered: "市场信号已返回",
    committeeWaiting: "等待运行结果。",
    approvePayment: (agent, amount) => `${agent} 报价在预算边界内，自动扣费 ${amount} USDC`,
    rejectPayment: (agent, reasons) => `${agent} 报价超出预算边界：${reasons}`,
    maxFee: (agent, amount) => `${agent}，最高费用 ${amount} USDC`,
    quote: (agent, price, network, asset) => `${agent} 报价 ${price}，${network} / ${asset}`,
    policyPassed: (remaining) => `policy 预算边界通过，剩余 ${remaining}`,
    paymentSigned: (payer, spender, facilitator) => `payer ${payer} / spender ${spender ?? "n/a"} 已授权模拟采购，经由 ${facilitator}`,
    signalReturned: "信号返回",
    flowQuotePending: "等待付费 Agent 返回报价",
    flowPolicyAllowed: (remaining) => `允许自动支付，余额剩余 ${remaining}`,
    flowPolicyRejected: (reasons) => `拒绝自动支付：${reasons}`,
    flowPolicyPending: "预算、单次上限和 Agent 权限待检查",
    flowSignedPending: "等待生成授权扣费 payload",
    flowSettlePending: "等待模拟结算",
    flowDeliveredPending: "等待付费 Agent 返回证据",
    runFailed: "运行失败",
    auditNotRecorded: "尚未记录",
    auditFailed: (error) => `决策已完成，本地审计写入失败：${error}`,
    agentCallQuote: (agent, amount, tier) => `${agent}，${tier ?? "standard"} 推理报价 ${amount} USDC`,
    simulationBlocked: "模拟执行被阻止。",
    simulatedPnl: (side, quantity, asset, price, pnl) => `${side} ${quantity} ${asset} @ ${price}，模拟 PnL ${pnl} USD。`
  },
  "en-US": {
    nav: {
      home: "Home",
      settings: "Policy",
      payment: "Payment",
      setup: "Intent",
      plan: "Agent Plan",
      run: "Run",
      decision: "Decision",
      preferences: "Settings"
    },
    homeTitle: "Train your AI trading strategy through conversation.",
    homeBody: "Tell Oasis how you want to trade. It asks clarifying questions, creates rules, decides whether Market/Risk Agents are needed, then shows every quote, budget check, simulated execution, and audit record.",
    homeStart: "Train my AI ->",
    homePolicy: "Set budget first",
    chatUserLabel: "You",
    chatUserText: "Be more decisive on the next ETH breakout, but do not add risk.",
    chatAiText: "Do you want a shorter confirmation window, or a larger position? I will check budget and risk limits first.",
    adjustmentLabel: "AI-interpreted adjustment",
    adjustmentTitle: "Confirmation 15m -> 10m",
    adjustmentBody: "Position 20 U · stop -3% unchanged · simulation only",
    labels: {
      assetInput: "Asset",
      timeframeInput: "Timeframe",
      budgetInput: "Budget per strategy run USDC",
      perCallInput: "Max paid Agent call USDC",
      riskInput: "Risk preference",
      executionInput: "Execution mode",
      preferenceLanguageInput: "Interface language",
      preferenceUnitInput: "Amount display",
      preferenceDensityInput: "Interface density",
      preferenceStartPageInput: "Default start page",
      providerInput: "Model provider",
      modelInput: "Model name"
    },
    paymentReadinessTitle: "Payment readiness",
    paymentReadinessBody: "Check Base Sepolia USDC simulation and local audit readiness.",
    payerBalanceTitle: "User testnet balance",
    payerBalanceBody: "Used by the Agent to pay Market/Risk services inside the budget boundary.",
    paymentRailTitle: "Payment rail",
    paymentRailBody: "Base Sepolia / USDC in simulation mode.",
    auditReadinessTitle: "Audit records",
    auditReadinessBody: "Decision summaries are recorded in the local session.",
    paymentReadinessHint: "This is read-only runtime status, not a user setting.",
    paymentStatusUnchecked: "Unchecked",
    paymentStatusChecking: "Checking",
    paymentStatusReady: "Ready",
    paymentStatusNeedsSetup: "Needs setup",
    paymentStatusHelp: "Check Base Sepolia USDC simulation and local audit readiness.",
    paymentStatusOk: (mode, network) => `${mode} / ${network} checked.`,
    paymentStatusMissing: (items) => `Missing config: ${items}`,
    checkPayment: "Refresh payment status",
    accountBalance: (role, account, balance) => `${role} ${account}: ${balance} USDC`,
    accountBalanceUnknown: (role, account) => `${role} ${account}: balance not checked`,
    payerBalance: (balance) => `${balance} USDC`,
    payerBalanceUnknown: "Not checked",
    paymentRailReady: "Simulation ready",
    paymentRailPending: "Pending check",
    auditReady: "Local audit available",
    auditPending: "Not configured",
    switches: {
      autoPay: "Auto-charge inside the budget boundary",
      allowMarket: "Allow Market Agent paid calls",
      allowRisk: "Allow Risk Agent paid calls",
      motion: "Enable subtle interface motion",
      remember: "Use my start page next time"
    },
    authorizeBudget: "Authorize Budget Boundary",
    reauthorizeBudget: "Reauthorize Budget Boundary",
    budgetBoundaryPending: "Unauthorized",
    budgetBoundaryAuthorized: "Authorized",
    budgetBoundaryHelp: "Authorize this strategy budget so the Agent can buy Market/Risk services inside the boundary.",
    planAuthorizationPending: "Waiting for budget authorization",
    planAuthorizationPendingBody: "Authorize the budget boundary on the Policy page first.",
    planAuthorizationReady: "Budget boundary authorized",
    planAuthorizationReadyBody: (budget, perCall) => `Agent can automatically buy paid services within ${budget} USDC total budget and ${perCall} USDC per-call limit.`,
    preferencesTitle: "Personal settings",
    preferencesBody: "These preferences stay in this browser. They do not change your trading policy, budget authorization, or Agent decision flow.",
    savePreferences: "Save settings",
    preferencesSaved: "SAVED",
    preferencesDefault: "Using default preferences.",
    preferenceOptions: {
      zh: "Simplified Chinese",
      usd: "USD estimate",
      comfortable: "Comfortable",
      compact: "Compact"
    },
    intentTitle: "Ask Strategy Agent to draft a strategy",
    intentPlaceholder: "I want an ETH 4h breakout strategy. Auto-call the required Market Agent and Risk Agent only inside my budget boundary, simulation only, conservative risk.",
    analyzeButton: "Draft strategy with Strategy Agent",
    waitingInput: "Waiting for input",
    emptyStrategy: "No strategy yet",
    strategyThesis: "After you enter a natural-language goal, Strategy Agent drafts the strategy, evidence needs, and risk boundaries.",
    laneWaitingGoal: "Waiting for user goal",
    notPlanned: "Not planned",
    waitingDecision: "Waiting for final decision",
    noPaymentPlan: "No paid plan yet",
    runFullLoop: "Run full decision loop",
    decisionWaiting: "Waiting to run",
    decisionReasonWaiting: "Authorize the budget boundary before running the Agent.",
    signalWaiting: "No evidence returned yet.",
    executionWaiting: "Waiting for Execution Agent simulation."
    ,
    runningTitle: "Running",
    runningReason: "Strategy Agent is executing inside the authorized budget boundary.",
    policyBudgetText: (budget, perCall) => `Strategy budget ${budget} USDC, max paid Agent call ${perCall} USDC`,
    noPaidCall: "Strategy Agent does not need any paid platform Agent call for this plan.",
    finalDecisionBuy: "Simulated buy",
    finalDecisionHold: "Hold",
    finalDecisionNoTrade: "No trade",
    evidenceSynthesized: "Evidence synthesized",
    budgetSpent: (spent, remaining) => `Used ${spent} USDC, remaining ${remaining} USDC`,
    authorizedSession: (sessionId, usdc) => `Budget boundary ${sessionId} set to ${usdc} USDC.`,
    escrowAuthorizing: "Setting this budget boundary...",
    invalidBudget: "Budget boundary must be greater than 0.",
    analyzingIntent: "Strategy Agent is parsing the user goal",
    intentParsed: "Strategy Agent parsed the goal",
    initialConfidence: (value) => `initial confidence ${value}`,
    confidence: (value) => `confidence ${value}`,
    paymentCompleted: (tx) => `Payment settled, tx ${tx}`,
    marketSignalDelivered: "Market signal returned",
    committeeWaiting: "Waiting for run result.",
    approvePayment: (agent, amount) => `${agent} quote fits the budget boundary; charged ${amount} USDC`,
    rejectPayment: (agent, reasons) => `${agent} quote exceeds the budget boundary: ${reasons}`,
    maxFee: (agent, amount) => `${agent}, max fee ${amount} USDC`,
    quote: (agent, price, network, asset) => `${agent} quoted ${price} on ${network} / ${asset}`,
    policyPassed: (remaining) => `policy budget boundary passed, remaining ${remaining}`,
    paymentSigned: (payer, spender, facilitator) => `payer ${payer} / spender ${spender ?? "n/a"} authorized a simulated purchase via ${facilitator}`,
    signalReturned: "Signal returned",
    flowQuotePending: "Waiting for paid Agent quote",
    flowPolicyAllowed: (remaining) => `Auto-pay allowed, remaining balance ${remaining}`,
    flowPolicyRejected: (reasons) => `Auto-pay rejected: ${reasons}`,
    flowPolicyPending: "Budget, per-call limit, and Agent permission are pending checks",
    flowSignedPending: "Waiting to generate payment authorization payload",
    flowSettlePending: "Waiting for simulated settlement",
    flowDeliveredPending: "Waiting for paid Agent evidence",
    runFailed: "Run failed",
    auditNotRecorded: "Not recorded",
    auditFailed: (error) => `Decision completed, but local audit failed: ${error}`,
    agentCallQuote: (agent, amount, tier) => `${agent}, ${tier ?? "standard"} reasoning quote ${amount} USDC`,
    simulationBlocked: "Simulation was blocked.",
    simulatedPnl: (side, quantity, asset, price, pnl) => `${side} ${quantity} ${asset} @ ${price}, simulated PnL ${pnl} USD.`
  }
};

const DEFAULT_MODELS = {
  openai: "gpt-5",
  deepseek: "deepseek-chat",
  claude: "claude-sonnet-4-5",
  glm: "glm-4.5",
  rule: "rule_based_fallback"
};

els.analyzeButton.addEventListener("click", analyzeIntent);
els.runButton.addEventListener("click", runStrategy);
els.authorizeBudgetButton.addEventListener("click", authorizeBudgetBoundary);
els.checkPaymentButton.addEventListener("click", checkPaymentStatus);
els.homeStartButton.addEventListener("click", () => showPage("setup"));
els.homePolicyButton.addEventListener("click", () => showPage("settings"));
els.savePreferencesButton.addEventListener("click", savePreferences);
for (const tab of els.pageTabs) {
  tab.addEventListener("click", () => showPage(tab.dataset.pageTarget));
}
els.providerInput.addEventListener("change", () => {
  els.modelInput.value = DEFAULT_MODELS[els.providerInput.value] ?? "";
});
els.intentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    analyzeIntent();
  }
});

for (const input of [
  els.assetInput,
  els.timeframeInput,
  els.budgetInput,
  els.perCallInput,
  els.riskInput,
  els.executionInput,
  els.autoPayInput,
  els.allowMarketInput,
  els.allowRiskInput
]) {
  input.addEventListener("input", () => {
    resetBudgetAuthorization();
    state.policy = buildPolicyFromControls();
    renderPolicy(state.policy);
    renderBudgetAuthorization();
    updateRunAvailability();
  });
}

state.policy = buildPolicyFromControls();
renderPolicy(state.policy);
renderBudgetAuthorization();
const preferences = loadPreferences();
applyPreferencesToControls(preferences);
applyPreferences(preferences);
showPage(preferences.rememberStartPage ? preferences.startPage : "home");

async function authorizeBudgetBoundary() {
  const budgetUsdc = Number(els.budgetInput.value);
  if (!Number.isFinite(budgetUsdc) || budgetUsdc <= 0) {
    els.escrowStatus.textContent = currentCopy().budgetBoundaryPending;
    els.escrowSummary.textContent = currentCopy().invalidBudget;
    return;
  }

  els.escrowStatus.textContent = currentCopy().escrowAuthorizing;
  els.authorizeBudgetButton.disabled = true;

  try {
    state.sessionEscrow = await postJson("/billing/session/authorize", {
      sessionBudgetAtomic: usdcToAtomic(budgetUsdc)
    });
    state.policy = buildPolicyFromControls();
    renderPolicy(state.policy);
    renderBudgetAuthorization();
    updateRunAvailability();
  } catch (error) {
    showError(error);
  } finally {
    els.authorizeBudgetButton.disabled = false;
  }
}

async function analyzeIntent() {
  const userMessage = els.intentInput.value.trim();
  if (!userMessage || els.analyzeButton.disabled) return;

  setBusy(true, currentCopy().analyzingIntent);
  resetRunOutput();
  appendChatMessage({ role: "user", body: userMessage });
  state.latestUserMessage = userMessage;
  els.intentInput.value = "";
  const assistantMessage = appendChatMessage({
    role: "assistant",
    body: currentCopy().analyzingIntent,
    isTyping: true
  });

  try {
    const intent = await postJson("/strategy/intent", {
      message: userMessage,
      modelConfig: getModelConfig(),
      locale: getLocale()
    });
    state.intent = intent;

    if (intent.status === "needs_clarification" && intent.missingFields.length > 0) {
      els.workspaceStatus.textContent = intent.questions.join(" ");
    } else {
      els.workspaceStatus.textContent = currentCopy().intentParsed;
    }

    const policyResponse = await postJson("/strategy/policy/draft", { intent, locale: getLocale() });
    state.policy = policyResponse.policyDraft;
    applyPolicyToControls(state.policy);
    renderPolicy(state.policy);

    const strategyResponse = await postJson("/strategy/draft", {
      intent,
      policy: state.policy,
      modelConfig: getModelConfig(),
      locale: getLocale()
    });
    state.strategyDraft = strategyResponse.strategyDraft;
    renderStrategyDraft(state.strategyDraft);

    state.plan = await postJson("/strategy/plan", {
      intent,
      policy: state.policy,
      modelConfig: getModelConfig(),
      locale: getLocale()
    });
    renderPlan(state.plan);

    state.policy = buildPolicyFromControls();
    renderBudgetAuthorization();
    updateRunAvailability();
    await typeAssistantMessage(assistantMessage, formatStrategyChatResponse({
      strategyDraft: state.strategyDraft,
      plan: state.plan
    }));
  } catch (error) {
    assistantMessage.classList.remove("is-typing");
    assistantMessage.querySelector("p").textContent = error.message;
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function runStrategy() {
  const policy = buildPolicyFromControls();
  if (state.running || !state.policy || !hasBudgetAuthorization(policy)) return;

  state.running = true;
  els.runButton.disabled = true;
  els.loopStatus.textContent = "RUNNING";
  els.timeline.innerHTML = "";
  els.committeeTranscript.innerHTML = "";
  els.transcriptStatus.textContent = "RUNNING";
  els.decisionBadge.textContent = "RUNNING";
  els.decisionTitle.textContent = currentCopy().runningTitle;
  els.decisionReason.textContent = currentCopy().runningReason;
  showPage("run");

  try {
    const result = await postJson("/strategy/run", {
      message: state.latestUserMessage || state.intent?.message || els.intentInput.value,
      intent: state.intent,
      policy,
      strategyDraft: state.strategyDraft,
      requireLlm: false,
      modelConfig: getModelConfig(),
      locale: getLocale()
    });

    await renderRuntime(result);
    showPage("decision");
  } catch (error) {
    showError(error);
  } finally {
    state.running = false;
    updateRunAvailability();
  }
}

function showPage(pageId) {
  const nextPage = PAGES.some((page) => page.id === pageId) ? pageId : "home";
  state.activePage = nextPage;

  for (const page of els.pages) {
    page.classList.toggle("is-active", page.dataset.page === nextPage);
  }

  for (const tab of els.pageTabs) {
    tab.classList.toggle("is-active", tab.dataset.pageTarget === nextPage);
  }
}

function loadPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCE_STORAGE_KEY) ?? "{}");
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function readPreferencesFromControls() {
  return {
    language: els.preferenceLanguageInput.value,
    unit: els.preferenceUnitInput.value,
    density: els.preferenceDensityInput.value,
    startPage: els.preferenceStartPageInput.value,
    motion: els.preferenceMotionInput.checked,
    rememberStartPage: els.preferenceRememberInput.checked
  };
}

function applyPreferencesToControls(preferences) {
  els.preferenceLanguageInput.value = preferences.language;
  els.preferenceUnitInput.value = preferences.unit;
  els.preferenceDensityInput.value = preferences.density;
  els.preferenceStartPageInput.value = preferences.startPage;
  els.preferenceMotionInput.checked = preferences.motion;
  els.preferenceRememberInput.checked = preferences.rememberStartPage;
}

function applyPreferences(preferences) {
  document.documentElement.lang = preferences.language;
  document.body.classList.toggle("is-compact", preferences.density === "compact");
  document.body.classList.toggle("reduce-motion", preferences.motion === false);
  renderLocalizedCopy(preferences.language);
  els.preferencesStatus.textContent = getCopy(preferences.language).preferencesSaved;
  els.preferencesSummary.textContent = describePreferences(preferences);
}

function savePreferences() {
  const preferences = readPreferencesFromControls();
  localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(preferences));
  applyPreferences(preferences);
}

function describePreferences(preferences) {
  const isEnglish = preferences.language === "en-US";
  const language = isEnglish ? "English" : "简体中文";
  const density = preferences.density === "compact" ? (isEnglish ? "compact" : "紧凑") : (isEnglish ? "comfortable" : "舒适");
  const unit = preferences.unit === "atomic" ? "Atomic" : preferences.unit === "usd" ? "USD 估算" : "USDC";
  const start = PAGES.find((page) => page.id === preferences.startPage)?.label ?? "Home";
  if (isEnglish) {
    return `Language ${language}, amount ${unit}, density ${density}, default start page ${start}.`;
  }
  return `语言 ${language}，金额 ${unit}，界面 ${density}，默认启动页 ${start}。`;
}

function getCopy(language) {
  return UI_COPY[language] ?? UI_COPY["zh-CN"];
}

function currentCopy() {
  return getCopy(els.preferenceLanguageInput?.value ?? DEFAULT_PREFERENCES.language);
}

function getLocale() {
  return els.preferenceLanguageInput?.value ?? DEFAULT_PREFERENCES.language;
}

function renderLocalizedCopy(language) {
  const copy = getCopy(language);
  for (const tab of els.pageTabs) {
    tab.textContent = copy.nav[tab.dataset.pageTarget] ?? tab.textContent;
  }

  els.homeStartButton.textContent = copy.homeStart;
  els.homePolicyButton.textContent = copy.homePolicy;
  document.querySelector("#homeTitle").textContent = copy.homeTitle;
  document.querySelector(".home-copy p").textContent = copy.homeBody;
  document.querySelector(".chat-card:first-of-type strong").textContent = copy.chatUserLabel;
  document.querySelector(".chat-card:first-of-type p").textContent = copy.chatUserText;
  document.querySelector(".chat-card:nth-of-type(2) p").textContent = copy.chatAiText;
  document.querySelector(".agent-adjustment span").textContent = copy.adjustmentLabel;
  document.querySelector(".agent-adjustment strong").textContent = copy.adjustmentTitle;
  document.querySelector(".agent-adjustment p").textContent = copy.adjustmentBody;
  for (const [inputId, text] of Object.entries(copy.labels)) {
    setLabelText(document.querySelector(`#${inputId}`), text);
  }

  document.querySelector(".payment-readiness-head h1").textContent = copy.paymentReadinessTitle;
  document.querySelector(".payment-readiness-head p").textContent = copy.paymentReadinessBody;
  const readinessCards = document.querySelectorAll(".payment-readiness-card");
  readinessCards[0].querySelector("span").textContent = copy.payerBalanceTitle;
  readinessCards[0].querySelector("p").textContent = copy.payerBalanceBody;
  readinessCards[1].querySelector("span").textContent = copy.paymentRailTitle;
  readinessCards[1].querySelector("p").textContent = copy.paymentRailBody;
  readinessCards[2].querySelector("span").textContent = copy.auditReadinessTitle;
  readinessCards[2].querySelector("p").textContent = copy.auditReadinessBody;
  els.paymentReadinessHint.textContent = copy.paymentReadinessHint;
  els.checkPaymentButton.textContent = copy.checkPayment;
  if (!els.paymentStatusGrid.children.length) {
    els.paymentStatusBadge.textContent = copy.paymentStatusUnchecked;
    els.paymentStatusSummary.textContent = copy.paymentStatusHelp;
  }
  setCheckRowText(els.autoPayInput, copy.switches.autoPay);
  setCheckRowText(els.allowMarketInput, copy.switches.allowMarket);
  setCheckRowText(els.allowRiskInput, copy.switches.allowRisk);
  setCheckRowText(els.preferenceMotionInput, copy.switches.motion);
  setCheckRowText(els.preferenceRememberInput, copy.switches.remember);
  renderBudgetAuthorization();

  document.querySelector("#preferencesTitle").textContent = copy.preferencesTitle;
  document.querySelector(".preferences-head p").textContent = copy.preferencesBody;
  document.querySelector("#preferenceLanguageInput option[value='zh-CN']").textContent = copy.preferenceOptions.zh;
  document.querySelector("#preferenceUnitInput option[value='usd']").textContent = copy.preferenceOptions.usd;
  document.querySelector("#preferenceDensityInput option[value='comfortable']").textContent = copy.preferenceOptions.comfortable;
  document.querySelector("#preferenceDensityInput option[value='compact']").textContent = copy.preferenceOptions.compact;
  els.savePreferencesButton.textContent = copy.savePreferences;

  document.querySelector(".chat-title").textContent = copy.intentTitle;
  els.intentInput.placeholder = copy.intentPlaceholder;
  els.analyzeButton.textContent = copy.analyzeButton;
  if (els.workspaceStatus.textContent === "等待输入" || els.workspaceStatus.textContent === "Waiting for input") {
    els.workspaceStatus.textContent = copy.waitingInput;
  }
  if (!state.strategyDraft) {
    els.strategyName.textContent = copy.emptyStrategy;
    els.strategyThesis.textContent = copy.strategyThesis;
  }
  if (!state.plan) {
    els.strategyLane.textContent = copy.laneWaitingGoal;
    els.marketLane.textContent = copy.notPlanned;
    els.riskLane.textContent = copy.notPlanned;
    els.executionLane.textContent = copy.waitingDecision;
    els.budgetText.textContent = copy.noPaymentPlan;
  }
  els.runButton.textContent = copy.runFullLoop;
  if (!state.running && els.decisionBadge.textContent === "PENDING") {
    els.decisionTitle.textContent = copy.decisionWaiting;
    els.decisionReason.textContent = copy.decisionReasonWaiting;
    els.signalSummary.textContent = copy.signalWaiting;
    els.executionSummary.textContent = copy.executionWaiting;
  }
}

function setLabelText(input, text) {
  const label = input?.closest("label");
  if (!label) return;
  for (const node of label.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      node.textContent = `\n              ${text}\n              `;
      return;
    }
  }
  label.prepend(document.createTextNode(`${text}\n`));
}

function setCheckRowText(input, text) {
  const span = input?.closest(".check-row")?.querySelector("span");
  if (span) span.textContent = text;
}

function renderPolicy(policy) {
  els.policyStatus.textContent = "DRAFT";
  els.budgetText.textContent = currentCopy().policyBudgetText(
    atomicToUsdc(policy.sessionBudgetAtomic ?? policy.dailyBudgetAtomic),
    atomicToUsdc(policy.maxPaidAgentCallAtomic ?? policy.maxPaymentPerCallAtomic)
  );
  els.budgetFill.style.transform = "scaleX(0)";
}

function resetBudgetAuthorization() {
  state.sessionEscrow = {
    ...state.sessionEscrow,
    status: "not_authorized",
    sessionId: null,
    authorizedBudgetAtomic: 0,
    availableBalanceAtomic: 0,
    spentAtomic: 0,
    fundingReference: null,
    authorizedAt: null
  };
}

function hasBudgetAuthorization(policy = buildPolicyFromControls()) {
  return policy.autoPayEnabled === true
    && policy.sessionEscrow?.status === "authorized"
    && Number(policy.sessionEscrow?.availableBalanceAtomic ?? 0) > 0;
}

function renderBudgetAuthorization() {
  const copy = currentCopy();
  const policy = buildPolicyFromControls();
  const authorized = hasBudgetAuthorization(policy);
  const budgetUsdc = atomicToUsdc(policy.sessionBudgetAtomic ?? policy.dailyBudgetAtomic);
  const perCallUsdc = atomicToUsdc(policy.maxPaidAgentCallAtomic ?? policy.maxPaymentPerCallAtomic);

  els.escrowStatus.textContent = authorized ? copy.budgetBoundaryAuthorized : copy.budgetBoundaryPending;
  els.escrowSummary.textContent = authorized
    ? copy.authorizedSession(policy.sessionEscrow.sessionId, budgetUsdc)
    : copy.budgetBoundaryHelp;
  els.authorizeBudgetButton.textContent = authorized ? copy.reauthorizeBudget : copy.authorizeBudget;
  els.planAuthorizationStatus.textContent = authorized ? copy.planAuthorizationReady : copy.planAuthorizationPending;
  els.planAuthorizationSummary.textContent = authorized
    ? copy.planAuthorizationReadyBody(budgetUsdc, perCallUsdc)
    : copy.planAuthorizationPendingBody;
}

async function checkPaymentStatus() {
  const copy = currentCopy();
  els.paymentStatusBadge.textContent = copy.paymentStatusChecking;
  els.paymentStatusSummary.textContent = copy.paymentStatusHelp;
  els.paymentStatusGrid.innerHTML = "";
  els.payerBalanceValue.textContent = copy.payerBalanceUnknown;
  els.paymentRailValue.textContent = copy.paymentRailPending;
  els.auditReadinessValue.textContent = copy.auditPending;

  try {
    const status = await getJson("/payments/status");
    renderPaymentStatus(status);
  } catch (error) {
    els.paymentStatusBadge.textContent = copy.paymentStatusNeedsSetup;
    els.paymentStatusSummary.textContent = error.message;
    showError(error);
  }
}

function renderPaymentStatus(status) {
  const copy = currentCopy();
  els.paymentStatusBadge.textContent = status.ready ? copy.paymentStatusReady : copy.paymentStatusNeedsSetup;
  els.paymentStatusSummary.textContent = copy.paymentStatusOk(status.mode, status.network);
  els.paymentStatusGrid.replaceChildren();
  els.payerBalanceValue.textContent = copy.payerBalanceUnknown;
  els.paymentRailValue.textContent = copy.paymentRailReady;
  els.auditReadinessValue.textContent = copy.auditReady;
}

function formatAccountRole(role) {
  if (role === "payer") return "用户余额账户";
  if (role === "spender") return "授权扣费账户";
  if (role === "merchant") return "服务收款账户";
  return role;
}

function renderStrategyDraft(draft) {
  els.strategyStatus.textContent = "READY";
  els.strategyName.textContent = draft.name;
  els.strategyThesis.textContent = draft.thesis;
  renderList(els.entryList, draft.entryConditions);
  renderList(els.riskList, draft.riskControls);
}

function appendChatMessage({ role, body, isTyping = false }) {
  const item = document.createElement("article");
  item.className = `chat-message is-${role}${isTyping ? " is-typing" : ""}`;
  item.innerHTML = `
    <span>${role === "user" ? currentCopy().chatUserLabel : "Strategy Agent"}</span>
    <p></p>
  `;
  item.querySelector("p").textContent = body;
  els.chatMessages.append(item);
  scrollChatToBottom();
  return item;
}

async function typeAssistantMessage(item, text) {
  const target = item.querySelector("p");
  item.classList.add("is-typing");
  target.textContent = "";
  const prefersReducedMotion = document.body.classList.contains("reduce-motion")
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    target.textContent = text;
    item.classList.remove("is-typing");
    scrollChatToBottom();
    return;
  }

  for (const character of text) {
    target.textContent += character;
    scrollChatToBottom();
    await wait(character === "\n" ? 28 : 12);
  }
  item.classList.remove("is-typing");
}

function formatStrategyChatResponse({ strategyDraft, plan }) {
  const calls = plan.agentPlan.plannedToolCalls;
  const evidencePlan = calls.length > 0
    ? calls.map((call) => `- ${call.agent ?? call.service}: ${atomicToUsdc(call.quotedPriceAtomic)} USDC`).join("\n")
    : `- ${currentCopy().noPaidCall}`;
  const entries = strategyDraft.entryConditions.map((item) => `- ${item}`).join("\n");
  const risks = strategyDraft.riskControls.map((item) => `- ${item}`).join("\n");

  return [
    `${strategyDraft.name}`,
    "",
    strategyDraft.thesis,
    "",
    "Entry",
    entries,
    "",
    "Risk",
    risks,
    "",
    "Paid Agent plan",
    evidencePlan
  ].join("\n");
}

function scrollChatToBottom() {
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function renderPlan(plan) {
  const calls = plan.agentPlan.plannedToolCalls;
  els.committeeStatus.textContent = calls.length > 0 ? "PLANNED" : "NO PAID CALL";
  els.strategyLane.textContent = `${plan.hypothesis.direction} ${plan.hypothesis.setup}, ${currentCopy().initialConfidence(plan.hypothesis.initialConfidence)}`;
  els.marketLane.textContent = describeAgentCall(calls.find((call) => call.service === "market-signal"));
  els.riskLane.textContent = describeAgentCall(calls.find((call) => call.service === "risk-challenge"));
  els.executionLane.textContent = currentCopy().waitingDecision;

  els.paymentStatus.textContent = calls.length > 0 ? "QUOTED" : "READY";
  els.paymentList.innerHTML = "";

  for (const call of calls) {
    const item = document.createElement("article");
    item.className = "payment-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(call.agent ?? call.service)}</strong>
        <p>${escapeHtml(call.reason)}</p>
      </div>
      <span>${atomicToUsdc(call.quotedPriceAtomic)} USDC</span>
    `;
    els.paymentList.append(item);
  }

  if (calls.length === 0) {
    els.paymentList.innerHTML = `<p class="empty-note">${escapeHtml(currentCopy().noPaidCall)}</p>`;
  }

  renderPaymentFlow("planned", {
    serviceCount: calls.length,
    totalQuotedAtomic: calls.reduce((sum, call) => sum + Number(call.quotedPriceAtomic ?? 0), 0)
  });
}

async function renderRuntime(result) {
  for (const event of result.timeline) {
    await wait(120);
    addTimelineEvent(event);
    applyRuntimeEvent(event, result);
  }

  els.loopStatus.textContent = "DONE";
  renderCommitteeTranscript(result.committeeTranscript ?? []);
  els.transcriptStatus.textContent = "DONE";
  els.decisionBadge.textContent = result.finalDecision;
  els.decisionTitle.textContent = result.finalDecision === "SIMULATED_BUY" ? currentCopy().finalDecisionBuy : result.finalDecision === "HOLD" ? currentCopy().finalDecisionHold : currentCopy().finalDecisionNoTrade;
  els.decisionReason.textContent = result.reason;
  const marketSignal = result.evidence?.marketSignal;
  els.signalScore.textContent = formatMarketSignalScore(marketSignal, result.evidence);
  els.signalSummary.textContent = marketSignal?.summary ?? result.evidence?.contradictingEvidence?.[0] ?? result.evidence?.supportingEvidence?.[0] ?? currentCopy().evidenceSynthesized;
  els.llmProvider.textContent = result.metrics?.llmProvider ?? result.hypothesis?.generatedBy ?? "unknown";
  els.marketSource.textContent = result.marketSource ?? result.evidence?.marketSignal?.source ?? "unknown";
  els.executionStatus.textContent = result.executionResult?.status ?? "--";
  els.executionSummary.textContent = describeExecutionResult(result.executionResult);
  renderAuditRecord(result.audit);
  els.executionLane.textContent = result.executionProposal?.action ?? "NO ACTION";
  if (result.executionResult?.status) {
    els.executionLane.textContent = `${result.executionResult.status}: ${result.executionProposal?.action ?? "NO ACTION"}`;
  }

  const sessionBudget = Math.max(1, Number(result.policy.sessionBudgetAtomic ?? result.policy.dailyBudgetAtomic));
  const spentRatio = Math.min(1, Math.max(0, result.budget.spentAtomic / sessionBudget));
  els.budgetFill.style.transform = `scaleX(${spentRatio})`;
  els.budgetText.textContent = currentCopy().budgetSpent(result.budget.spentUsdc, result.budget.remainingUsdc);
}

function getModelConfig() {
  return {
    provider: els.providerInput.value,
    model: els.modelInput.value.trim() || DEFAULT_MODELS[els.providerInput.value]
  };
}

function applyRuntimeEvent(event, result) {
  if (event.stateStep === "generate_hypothesis") {
    els.strategyLane.textContent = `${event.output.direction} ${event.output.setup}, ${currentCopy().confidence(event.output.initialConfidence)}`;
  }

  if (event.step === "agent_charge_settled") {
    els.paymentStatus.textContent = "SETTLED";
    renderPaymentFlow("settled", event);
    if (event.service === "risk-challenge") {
      els.riskLane.textContent = currentCopy().paymentCompleted(event.transactionId);
    } else {
      els.marketLane.textContent = currentCopy().paymentCompleted(event.transactionId);
    }
  }

  if (event.step === "signal_delivered") {
    renderPaymentFlow("delivered", event);
    els.signalScore.textContent = formatMarketSignalScore(event.signal, result.evidence);
    els.signalSummary.textContent = event.signal.summary ?? currentCopy().marketSignalDelivered;
  }
}

function formatMarketSignalScore(signal, evidence) {
  if (Number.isFinite(Number(signal?.breakoutScore))) return Math.round(Number(signal.breakoutScore));
  if (Number.isFinite(Number(signal?.confidence))) return Math.round(Number(signal.confidence) * 100);
  if (Number.isFinite(Number(evidence?.evidenceScore))) return Math.round(Number(evidence.evidenceScore));
  return "--";
}

function addTimelineEvent(event) {
  const item = document.createElement("li");
  const title = event.stateStep ?? event.step;
  const body = describeTimelineEvent(event);
  item.innerHTML = `
    <time>${new Date().toLocaleTimeString("zh-CN", { hour12: false })}</time>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
  els.timeline.append(item);
}

function renderCommitteeTranscript(entries) {
  els.committeeTranscript.innerHTML = "";

  for (const entry of entries) {
    const item = document.createElement("li");
    item.innerHTML = `
      <span>${escapeHtml(entry.agent)}</span>
      <div>
        <strong>${escapeHtml(labelAction(entry.action))}</strong>
        <p>${escapeHtml(describeTranscriptEntry(entry))}</p>
      </div>
    `;
    els.committeeTranscript.append(item);
  }

  if (entries.length === 0) {
    els.committeeTranscript.innerHTML = `<li><span>Committee</span><div><strong>WAITING</strong><p>${escapeHtml(currentCopy().committeeWaiting)}</p></div></li>`;
  }
}

function labelAction(action) {
  return String(action ?? "event").replaceAll("_", " ").toUpperCase();
}

function describeTranscriptEntry(entry) {
  if (entry.message) return entry.message;
  if (entry.summary) return entry.summary;
  if (entry.reason) return entry.reason;
  if (entry.action === "approve_agent_charge") return currentCopy().approvePayment(entry.paidAgent ?? entry.service, atomicToUsdc(entry.amountAtomic));
  if (entry.action === "reject_agent_charge") return currentCopy().rejectPayment(entry.paidAgent ?? entry.service, entry.reasons?.join("; "));
  if (entry.blockingReasons?.length) return entry.blockingReasons.join("；");
  if (entry.service) return currentCopy().maxFee(entry.paidAgent ?? entry.service, atomicToUsdc(entry.maxFeeAtomic ?? 0));
  return JSON.stringify(entry);
}

function describeTimelineEvent(event) {
  if (event.step === "agent_quote") {
    renderPaymentFlow("required", event);
    return currentCopy().agentCallQuote(event.paidAgent ?? event.service, event.price, event.reasoningTier);
  }
  if (event.step === "budget_check") {
    renderPaymentFlow("policy", event);
    return event.allowed ? currentCopy().policyPassed(event.remainingBudget) : event.reasons.join("; ");
  }
  if (event.step === "agent_charge_authorized") {
    renderPaymentFlow("signed", event);
    return currentCopy().paymentSigned(event.payer, event.spender, event.facilitator);
  }
  if (event.step === "agent_charge_settled") return `settled ${event.transactionId}`;
  if (event.step === "signal_delivered") return event.signal.summary ?? currentCopy().signalReturned;
  if (event.step === "llm_fallback") return `${event.provider} failed, continued with ${event.fallback}: ${event.reason}`;
  if (event.step === "run_error") return event.message ?? currentCopy().runFailed;
  if (event.step === "audit_recorded") return event.audit.messageHash;
  if (event.stateStep) return summarizeOutput(event.output);
  return JSON.stringify(event);
}

function renderAuditRecord(audit) {
  if (!audit) {
    els.auditHash.textContent = currentCopy().auditNotRecorded;
    return;
  }

  if (audit.status === "failed" || audit.mode === "failed") {
    els.auditHash.textContent = currentCopy().auditFailed(audit.error ?? "unknown");
    return;
  }

  els.auditHash.textContent = audit.messageHash;
}

function summarizeOutput(output) {
  if (!output || typeof output !== "object") return String(output);
  if (output.action) return `${output.action}: ${output.reason ?? ""}`;
  if (output.status && output.agent) return `${output.agent}: ${output.status}`;
  if (output.mode) return output.reason ?? output.mode;
  if (output.asset && output.regime) return `${output.asset} / ${output.regime}`;
  if (output.policyId) return `${output.policyId}`;
  return JSON.stringify(output).slice(0, 180);
}

function applyPolicyToControls(policy) {
  els.assetInput.value = policy.targetAsset;
  els.timeframeInput.value = policy.strategyIntent?.timeframe ?? "4h";
  els.budgetInput.value = atomicToUsdc(policy.sessionBudgetAtomic ?? policy.dailyBudgetAtomic);
  els.perCallInput.value = atomicToUsdc(policy.maxPaidAgentCallAtomic ?? policy.maxPaymentPerCallAtomic);
  state.sessionEscrow = state.sessionEscrow.status === "authorized" ? state.sessionEscrow : {
    status: "not_authorized",
    sessionId: null,
    payerAccountId: "local-session",
    authorizedBudgetAtomic: 0,
    availableBalanceAtomic: 0,
    spentAtomic: 0,
    fundingReference: null,
    authorizedAt: null
  };
  els.autoPayInput.checked = policy.autoPayEnabled ?? true;
  els.allowMarketInput.checked = (policy.allowedPaidAgents ?? policy.allowedServices ?? []).includes("market-signal");
  els.allowRiskInput.checked = (policy.allowedPaidAgents ?? policy.allowedServices ?? []).includes("risk-challenge");
  els.riskInput.value = policy.strategyIntent?.riskPreference ?? "conservative";
  els.executionInput.value = policy.executionMode;
}

function buildPolicyFromControls() {
  const sessionBudgetAtomic = usdcToAtomic(Number(els.budgetInput.value));
  const maxPaidAgentCallAtomic = usdcToAtomic(Number(els.perCallInput.value));
  const allowedPaidAgents = [];
  if (els.allowMarketInput.checked) allowedPaidAgents.push("market-signal");
  if (els.allowRiskInput.checked) allowedPaidAgents.push("risk-challenge");
  const intent = {
    ...(state.intent ?? {}),
    asset: els.assetInput.value.trim().toUpperCase(),
    timeframe: els.timeframeInput.value,
    riskPreference: els.riskInput.value,
    dailyResearchBudgetAtomic: sessionBudgetAtomic,
    sessionBudgetAtomic,
    maxPaymentPerCallAtomic: maxPaidAgentCallAtomic,
    maxPaidAgentCallAtomic,
    executionMode: els.executionInput.value
  };

  return {
    id: `policy_${intent.asset.toLowerCase()}_${intent.timeframe}_${intent.riskPreference}`,
    targetAsset: intent.asset,
    sessionBudgetAtomic,
    maxPaidAgentCallAtomic,
    allowedPaidAgents,
    paidAgentBudgetsAtomic: {
      "market-signal": Math.floor(sessionBudgetAtomic * 0.6),
      "risk-challenge": Math.floor(sessionBudgetAtomic * 0.3)
    },
    autoPayEnabled: els.autoPayInput.checked,
    allowance: {
      ownerAccountId: "local-session",
      spenderAccountId: "platform-billing",
      merchantAccountId: "platform-billing",
      allowanceAtomic: sessionBudgetAtomic,
      spentAtomic: 0
    },
    sessionEscrow: {
      ...state.sessionEscrow,
      payerAccountId: "local-session",
      authorizedBudgetAtomic: usdcToAtomic(Number(els.budgetInput.value))
    },
    dailyBudgetAtomic: sessionBudgetAtomic,
    maxPaymentPerCallAtomic: maxPaidAgentCallAtomic,
    allowedServices: allowedPaidAgents,
    serviceBudgetsAtomic: {
      "market-signal": Math.floor(sessionBudgetAtomic * 0.6),
      "risk-challenge": Math.floor(sessionBudgetAtomic * 0.3)
    },
    executionMode: "simulation",
    riskRules: [
      `${intent.riskPreference}_risk_profile`,
      "user_policy_required_before_paid_agent_billing",
      "budget_boundary_required_for_auto_charge",
      "risk_guard_required_before_execution",
      "execution_agent_simulation_only"
    ],
    strategyIntent: intent
  };
}

function updateRunAvailability() {
  const policy = buildPolicyFromControls();
  const authorized = hasBudgetAuthorization(policy);
  const canRun = Boolean(state.strategyDraft && state.plan && state.policy && authorized && !state.running);
  els.runButton.disabled = !canRun;
  els.policyStatus.textContent = authorized ? "AUTHORIZED" : state.policy ? "DRAFT" : "PENDING";
  renderBudgetAuthorization();
  if (authorized && state.plan && !state.running) {
    els.paymentStatus.textContent = "APPROVED";
  } else if (state.plan && !state.running) {
    const calls = state.plan.agentPlan.plannedToolCalls;
    els.paymentStatus.textContent = calls.length > 0 ? "QUOTED" : "READY";
  }
}

function renderPaymentFlow(stage, details = {}) {
  const copy = currentCopy();
  const stageOrder = ["planned", "required", "policy", "signed", "settled", "delivered"];
  const activeIndex = Math.max(0, stageOrder.indexOf(stage));
  const items = [
    {
      id: "required",
      label: "Agent quote",
      text: details.price
        ? `${details.paidAgent ?? details.service ?? "paid agent"} ${details.reasoningTier ?? "standard"} quote ${details.price}`
        : copy.flowQuotePending
    },
    {
      id: "policy",
      label: "Budget boundary",
      text: typeof details.allowed === "boolean"
        ? details.allowed ? copy.flowPolicyAllowed(details.remainingBudget) : copy.flowPolicyRejected(details.reasons?.join("; "))
        : copy.flowPolicyPending
    },
    {
      id: "signed",
      label: "Simulated charge",
      text: details.payer
        ? `${details.mode ?? "mock"} payer ${details.payer} / spender ${details.spender ?? "n/a"}`
        : copy.flowSignedPending
    },
    {
      id: "settled",
      label: "Simulated settlement",
      text: details.transactionId
        ? `tx ${details.transactionId}`
        : copy.flowSettlePending
    },
    {
      id: "delivered",
      label: "Result delivered",
      text: details.signal?.summary ?? copy.flowDeliveredPending
    }
  ];

  els.x402Flow.innerHTML = "";
  for (const item of items) {
    const itemIndex = stageOrder.indexOf(item.id);
    const row = document.createElement("li");
    row.className = itemIndex < activeIndex ? "is-done" : itemIndex === activeIndex ? "is-active" : "";
    row.innerHTML = `
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.text)}</p>
    `;
    els.x402Flow.append(row);
  }
}

function setBusy(isBusy, text) {
  els.analyzeButton.disabled = isBusy;
  els.intentInput.readOnly = isBusy;
  els.workspaceStatus.textContent = isBusy ? text : els.workspaceStatus.textContent;
}

function resetRunOutput() {
  els.timeline.innerHTML = "";
  els.committeeTranscript.innerHTML = "";
  renderPaymentFlow("planned");
  els.transcriptStatus.textContent = "WAITING";
  els.loopStatus.textContent = "READY";
  els.decisionBadge.textContent = "PENDING";
  els.decisionTitle.textContent = currentCopy().decisionWaiting;
  els.decisionReason.textContent = currentCopy().decisionReasonWaiting;
  els.auditHash.textContent = "waiting";
  els.llmProvider.textContent = "waiting";
  els.marketSource.textContent = "waiting";
  els.executionStatus.textContent = "--";
  els.executionSummary.textContent = currentCopy().executionWaiting;
}

function showError(error) {
  els.workspaceStatus.textContent = error.message;
  els.loopStatus.textContent = "ERROR";
  els.decisionBadge.textContent = "FAILED";
  els.decisionTitle.textContent = currentCopy().runFailed;
  els.decisionReason.textContent = error.message;
  if (els.timeline) {
    addTimelineEvent({
      step: "run_error",
      message: error.message
    });
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? `${url} failed`);
  }
  return payload;
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? `${url} failed`);
  }
  return payload;
}

function renderList(target, values) {
  target.innerHTML = "";
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    target.append(item);
  }
}

function describeAgentCall(call) {
  if (!call) return currentCopy().notPlanned;
  return currentCopy().agentCallQuote(call.agent ?? call.service, atomicToUsdc(call.quotedPriceAtomic));
}

function describeExecutionResult(result) {
  if (!result) return currentCopy().executionWaiting;
  if (result.status === "blocked") return result.blockingReasons?.join("; ") ?? currentCopy().simulationBlocked;
  const order = result.simulatedOrder;
  const report = result.simulationReport;
  if (!order || !report) return `${result.status}`;
  return currentCopy().simulatedPnl(order.side, order.quantity, order.asset, order.fillPriceUsd, report.simulatedPnlUsd);
}

function usdcToAtomic(value) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new RangeError("USDC supports up to six decimal places");
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0")));
  if (!Number.isSafeInteger(amount)) throw new RangeError("USDC amount exceeds the demo limit");
  return amount;
}

function atomicToUsdc(value) {
  return Number(value) / 1_000_000;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
