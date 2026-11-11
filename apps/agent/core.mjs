import { randomUUID } from "node:crypto";
import { BASE_SEPOLIA, USDC, parseUsdcAmount, formatUsdcAmount } from "../../packages/evm/src/config.mjs";
import { createUsdcPolicy, UsdcBudgetLedger } from "../../packages/policy/src/usdc.mjs";

export const DEMO_RECIPIENT = "0x1111111111111111111111111111111111111111";
export const DEMO_SERVICE_PRICE_ATOMIC = "100000";
export const SAMPLE_SERVICES = Object.freeze([
  { id: "market-signal", name: "Market Signal API", provider: "oasis-demo", price: "0.10 USDC" }
]);

function assertGoal(value) {
  if (typeof value !== "string" || value.trim().length < 4 || value.length > 2000) {
    throw new Error("请输入 4–2000 字的投资目标");
  }
  return value.trim();
}
function budgetAtomic(value) {
  const parsed = parseUsdcAmount(value ?? "5");
  if (BigInt(parsed) < 100000n || BigInt(parsed) > 100000000n) {
    throw new Error("Agent 研究预算必须在 0.10–100 USDC");
  }
  return parsed;
}
export function createStrategy({ goal, budget = "5" }) {
  const message = assertGoal(goal);
  const budgetValue = budgetAtomic(String(budget));
  const asset = /\bBTC\b|比特币/i.test(message) ? "BTC" : /\bSOL\b|索拉纳/i.test(message) ? "SOL" : "ETH";
  return {
    id: randomUUID(),
    goal: message,
    asset,
    budgetAtomic: budgetValue,
    maxPurchaseAtomic: DEMO_SERVICE_PRICE_ATOMIC,
    mode: "simulation",
    needsApproval: true,
    status: "draft",
    createdAt: new Date().toISOString()
  };
}

export function prepareRun(strategy, { paymentMode = "demo" } = {}) {
  const runId = randomUUID();
  const events = [];
  function emit(type, message, detail = {}) {
    events.push({ id: randomUUID(), type, message, at: new Date().toISOString(), ...detail });
  }
  emit("strategy", "策略已创建", { asset: strategy.asset });
  emit("signal", "识别市场研究任务", { source: "demonstration fixture" });
  emit("service", "发现数据服务：Market Signal API", { price: "0.10 USDC" });

  const policy = createUsdcPolicy({
    taskId: runId,
    budgetAtomic: strategy.budgetAtomic,
    maxPaymentAtomic: strategy.maxPurchaseAtomic,
    allowedProviders: ["oasis-demo"],
    allowedServices: ["market-signal"],
    allowedRecipients: [DEMO_RECIPIENT],
    enabled: paymentMode === "demo" // local demonstration ONLY; never use as live payment policy
  });
  const ledger = new UsdcBudgetLedger(policy);
  const quote = {
    taskId: runId, quoteId: randomUUID(), providerId: "oasis-demo",
    serviceId: "market-signal", network: BASE_SEPOLIA.network,
    asset: USDC.address, payTo: DEMO_RECIPIENT,
    amountAtomic: DEMO_SERVICE_PRICE_ATOMIC, expiresAt: Date.now() + 120000
  };

  // Demo mode never signs, transfers, or claims any payment settlement.
  const decision = ledger.evaluate(quote);
  emit("policy", decision.allowed ? "模拟预算检查通过" : "服务采购已被权限拦截",
    { allowed: decision.allowed, reasons: decision.reasons });
  if (decision.allowed) {
    emit("demo", "数据采购仅作演示：没有发生链上付款", { currency: "USDC", amount: "0.10", paid: false });
  }
  const votes = [
    { model: "示例模型 A", action: "BUY", rationale: "趋势信息支持继续观察买入机会" },
    { model: "示例模型 B", action: "BUY", rationale: "资金流向与趋势信号一致" },
    { model: "示例模型 C", action: "HOLD", rationale: "短期波动仍然存在" }
  ];
  emit("committee", "模型委员会演示：2 买入 / 1 观望", { votes, simulated: true });
  emit("risk", "风险规则检查通过：仅允许模拟交易", { passed: true });
  emit("proposal", "生成模拟交易建议，等待用户确认", { asset: strategy.asset, amount: "80 USDC" });
  return {
    id: runId, strategyId: strategy.id, goal: strategy.goal, asset: strategy.asset,
    status: "awaiting_approval", paymentMode,
    payment: { status: "not_paid_demo", network: BASE_SEPOLIA.network, amountAtomic: DEMO_SERVICE_PRICE_ATOMIC },
    operatingBudget: {
      limit: formatUsdcAmount(strategy.budgetAtomic),
      spent: "0", // Never count a demo purchase as actual USDC spent.
      simulatedQuote: "0.10"
    },
    votes, proposedOrder: { side: "BUY", asset: strategy.asset, amountUsdc: "80.00", mode: "simulation" },
    events, createdAt: new Date().toISOString()
  };
}

export function approveRun(run) {
  if (!run || run.status !== "awaiting_approval") throw new Error("该建议已处理或不存在");
  run.status = "simulated";
  run.order = {
    id: randomUUID(), ...run.proposedOrder, status: "simulated",
    executedAt: new Date().toISOString(), simulated: true
  };
  run.events.push({
    id: randomUUID(), type: "execution", message: "用户已确认：创建模拟订单（没有真实交易）",
    at: new Date().toISOString(), orderId: run.order.id
  });
  return run;
}
export function rejectRun(run) {
  if (!run || run.status !== "awaiting_approval") throw new Error("该建议已处理或不存在");
  run.status = "rejected";
  run.events.push({
    id: randomUUID(), type: "execution", message: "用户暂不执行本次模拟交易",
    at: new Date().toISOString()
  });
  return run;
}
