import test from "node:test";
import assert from "node:assert/strict";
import { runSingleAgentDemo } from "./demo.mjs";
import { StrategyAgent } from "./strategy/StrategyAgent.mjs";
import { MemoryManager } from "./strategy/MemoryManager.mjs";

test("single agent demo charges quoted paid agents inside the user budget boundary", async () => {
  const previousMarketMode = process.env.OASIS_MARKET_DATA_MODE;
  const previousLlmMode = process.env.OASIS_LLM_MODE;
  process.env.OASIS_MARKET_DATA_MODE = "fixture";
  process.env.OASIS_LLM_MODE = "rule";
  const memoryManager = new MemoryManager({
    decisionMemoryPath: `${testTempDir()}/strategy-decisions.jsonl`,
    performanceMemoryPath: `${testTempDir()}/strategy-performance.jsonl`
  });

  try {
    const result = await runSingleAgentDemo({
      strategyAgent: new StrategyAgent({ memoryManager })
    });

    assert.equal(result.finalDecision, "NO_TRADE");
    assert.equal(
      result.budget.spentAtomic,
      result.budget.charges.reduce((sum, charge) => sum + Number(charge.amountAtomic), 0)
    );
    assert.equal(result.budget.spentAtomic > 20000, true);
    assert.equal(result.payment.network, "eip155:84532");
    assert.equal(result.payment.asset, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    assert.match(result.payment.transactionId, /^simulation-/);
    assert.equal(result.audit.mode, "local");
    assert.equal(result.hypothesis.generatedBy, "rule_based_fallback");
    assert.equal(result.evidence.evidenceQuality, "low");
    assert.equal(result.evidence.riskChallenge.verdict, "block");
    assert.equal(result.decision.action, "NO_TRADE");
    assert.equal(result.coordination.some((message) => message.type === "RiskChallengeRequest"), true);
    assert.equal(result.coordination.every((message) => Number.isInteger(message.quotedAtomic)), true);
    assert.equal(result.executionProposal.toAgent, "Execution Agent");
    assert.equal(result.executionResult.status, "blocked");
    assert.equal(result.metrics.paymentsSettled, result.budget.charges.length);
    assert.equal(result.metrics.paymentsSettled >= 1, true);
    assert.equal(result.committeeTranscript.some((event) => event.agent === "Risk Agent"), true);
    assert.equal(result.committeeTranscript.some((event) => event.pricingModel === "usage_based_risk_workload"), true);
    assert.equal(result.timeline.some((event) => event.step === "agent_quote" && event.usage), true);
    assert.equal(result.committeeTranscript.some((event) => event.action === "approve_agent_charge"), true);
    assert.equal(result.timeline.some((event) => event.step === "agent_quote"), true);
    assert.equal(result.timeline.some((event) => event.step === "budget_check"), true);
    assert.equal(result.timeline.some((event) => event.step === "agent_charge_settled"), true);
    assert.equal(result.timeline.some((event) => event.step === "signal_delivered"), true);
    assert.equal(result.timeline.some((event) => event.stateStep === "generate_hypothesis"), true);
  } finally {
    if (previousMarketMode === undefined) delete process.env.OASIS_MARKET_DATA_MODE;
    else process.env.OASIS_MARKET_DATA_MODE = previousMarketMode;
    if (previousLlmMode === undefined) delete process.env.OASIS_LLM_MODE;
    else process.env.OASIS_LLM_MODE = previousLlmMode;
  }
});

test("strategy agent returns Simplified Chinese fallback copy when locale is zh-CN", async () => {
  const previousMarketMode = process.env.OASIS_MARKET_DATA_MODE;
  const previousLlmMode = process.env.OASIS_LLM_MODE;
  process.env.OASIS_MARKET_DATA_MODE = "fixture";
  process.env.OASIS_LLM_MODE = "rule";

  try {
    const agent = new StrategyAgent({ locale: "zh-CN" });
    const intent = await agent.parseIntent({
      message: "我想做 ETH 4h 突破策略，预算 0.2 USDC，风险保守。",
      modelConfig: { provider: "rule" },
      locale: "zh-CN"
    });
    const policy = agent.draftPolicy({ intent });
    const draft = await agent.draftStrategy({
      intent,
      policy,
      modelConfig: { provider: "rule" },
      locale: "zh-CN"
    });
    const plan = await agent.planEvidence({
      intent,
      policy,
      modelConfig: { provider: "rule" },
      locale: "zh-CN"
    });

    assert.match(draft.thesis, /只有当/);
    assert.equal(plan.hypothesis.reasoning.some((item) => /当前市场状态|市场数据来源/.test(item)), true);
    assert.match(plan.agentPlan.reason, /Strategy Agent 发现证据缺口|现有证据足够/);
  } finally {
    if (previousMarketMode === undefined) delete process.env.OASIS_MARKET_DATA_MODE;
    else process.env.OASIS_MARKET_DATA_MODE = previousMarketMode;
    if (previousLlmMode === undefined) delete process.env.OASIS_LLM_MODE;
    else process.env.OASIS_LLM_MODE = previousLlmMode;
  }
});

function testTempDir() {
  return new URL(`../../../.tmp-tests/${process.pid}`, import.meta.url).pathname;
}
