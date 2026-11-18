import test from "node:test";
import assert from "node:assert/strict";
import { closeDemoApiServer, createDemoApiServer } from "./server.mjs";

test("demo API serves frontend and runs the local agent loop in mock mode", async () => {
  const previousMarketMode = process.env.OASIS_MARKET_DATA_MODE;
  const previousLlmMode = process.env.OASIS_LLM_MODE;
  process.env.OASIS_MARKET_DATA_MODE = "fixture";
  process.env.OASIS_LLM_MODE = "rule";
  const { server, baseUrl } = await createDemoApiServer({ port: 0 });

  try {
    const pageResponse = await fetch(`${baseUrl}/`);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /Oasis Strategy Workspace/);

    const runResponse = await fetch(`${baseUrl}/demo/run`, { method: "POST" });
    const result = await runResponse.json();

    assert.equal(runResponse.status, 200);
    assert.equal(result.finalDecision, "NO_TRADE");
    assert.equal(
      Number(result.budget.spentAtomic),
      result.budget.charges.reduce((sum, charge) => sum + Number(charge.amountAtomic), 0)
    );
    assert.equal(result.budget.spentAtomic > 20000, true);
    assert.equal(result.metrics.paymentsSettled, result.budget.charges.length);
    assert.equal(result.metrics.paymentsSettled >= 1, true);
    assert.equal(result.timeline.some((event) => event.step === "agent_quote"), true);
    assert.equal(result.timeline.some((event) => event.step === "agent_charge_settled"), true);
    assert.equal(result.committeeTranscript.some((event) => event.agent === "Execution Agent"), true);
  } finally {
    await closeDemoApiServer(server);
    if (previousMarketMode === undefined) delete process.env.OASIS_MARKET_DATA_MODE;
    else process.env.OASIS_MARKET_DATA_MODE = previousMarketMode;
    if (previousLlmMode === undefined) delete process.env.OASIS_LLM_MODE;
    else process.env.OASIS_LLM_MODE = previousLlmMode;
  }
});

test("strategy product APIs build intent policy draft strategy draft and plan", async () => {
  const previousMarketMode = process.env.OASIS_MARKET_DATA_MODE;
  const previousLlmMode = process.env.OASIS_LLM_MODE;
  process.env.OASIS_MARKET_DATA_MODE = "fixture";
  process.env.OASIS_LLM_MODE = "rule";
  const { server, baseUrl } = await createDemoApiServer({ port: 0 });

  try {
    const intentResponse = await fetch(`${baseUrl}/strategy/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "我想做 ETH 4h 突破策略，最多花 0.2 USDC，单次服务别超过 0.05 USDC，只做模拟交易，风险保守。"
      })
    });
    const intent = await intentResponse.json();
    assert.equal(intentResponse.status, 200);
    assert.equal(intent.status, "ready");
    assert.equal(intent.asset, "ETH");
    assert.equal(intent.dailyResearchBudgetAtomic, 200000);

    const policyResponse = await fetch(`${baseUrl}/strategy/policy/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent })
    });
    const { policyDraft } = await policyResponse.json();
    assert.equal(policyDraft.targetAsset, "ETH");
    assert.equal(policyDraft.sessionBudgetAtomic, 200000);
    assert.equal(policyDraft.allowedPaidAgents.includes("market-signal"), true);
    assert.equal(policyDraft.autoPayEnabled, true);

    const strategyResponse = await fetch(`${baseUrl}/strategy/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, policy: policyDraft })
    });
    const { strategyDraft } = await strategyResponse.json();
    assert.match(strategyDraft.name, /ETH/);
    assert.equal(strategyDraft.requiredEvidence.includes("Market Agent"), true);

    const planResponse = await fetch(`${baseUrl}/strategy/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, policy: policyDraft })
    });
    const plan = await planResponse.json();
    assert.equal(plan.hypothesis.asset, "ETH");
    assert.equal(plan.agentPlan.plannedToolCalls.some((call) => call.service === "market-signal"), true);
    assert.equal(plan.agentPlan.plannedToolCalls.some((call) => call.agent === "Market Agent"), true);
    assert.equal(plan.agentPlan.plannedToolCalls.every((call) => Number.isInteger(call.quotedAtomic)), true);
    assert.equal(plan.agentPlan.plannedToolCalls.every((call) => typeof call.reasoningTier === "string"), true);

    const unapprovedRunResponse = await fetch(`${baseUrl}/strategy/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: intent.message,
        intent,
        policy: {
          ...policyDraft,
          sessionEscrow: {
            status: "not_authorized",
            authorizedBudgetAtomic: 0,
            availableBalanceAtomic: 0
          }
        },
        strategyDraft,
        modelConfig: { provider: "rule" }
      })
    });
    assert.equal(unapprovedRunResponse.status, 403);
    const unapprovedRun = await unapprovedRunResponse.json();
    assert.equal(unapprovedRun.error, "budget_authorization_required");

    const authorizeResponse = await fetch(`${baseUrl}/billing/session/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionBudgetAtomic: policyDraft.sessionBudgetAtomic
      })
    });
    const sessionEscrow = await authorizeResponse.json();
    assert.equal(authorizeResponse.status, 200);
    assert.equal(sessionEscrow.status, "authorized");
    const authorizedPolicy = {
      ...policyDraft,
      sessionEscrow
    };

    const runResponse = await fetch(`${baseUrl}/strategy/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: intent.message,
        intent,
        policy: authorizedPolicy,
        strategyDraft,
        modelConfig: { provider: "rule" }
      })
    });
    const run = await runResponse.json();
    assert.equal(runResponse.status, 200);
    assert.equal(run.timeline.some((event) => event.step === "agent_charge_authorized"), true);
  } finally {
    await closeDemoApiServer(server);
    if (previousMarketMode === undefined) delete process.env.OASIS_MARKET_DATA_MODE;
    else process.env.OASIS_MARKET_DATA_MODE = previousMarketMode;
    if (previousLlmMode === undefined) delete process.env.OASIS_LLM_MODE;
    else process.env.OASIS_LLM_MODE = previousLlmMode;
  }
});

test("reports Base Sepolia simulation status and local audit records", async () => {
  const { server, baseUrl } = await createDemoApiServer({ port: 0 });
  try {
    const response = await fetch(baseUrl + "/payments/status");
    assert.deepEqual(await response.json(), { mode: "simulation", network: "eip155:84532", asset: "USDC", ready: true });
    const audit = await (await fetch(baseUrl + "/audit/messages")).json();
    assert.equal(audit.mode, "local");
    assert.ok(Array.isArray(audit.messages));
  } finally {
    await closeDemoApiServer(server);
  }
});
