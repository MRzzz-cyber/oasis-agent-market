import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

async function demoContext() {
  const source = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const start = source.indexOf("const browserOnlyDemo =");
  const end = source.indexOf("async function request(", start);
  assert.ok(start >= 0 && end > start, "Browser-only demo module must be present");
  const storage = new Map();
  const context = vm.createContext({
    location: { hostname: "oasis-ai-demo.workers.dev", port: "" },
    crypto: webcrypto, Date, Number, BigInt,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    api: (path, options) => vm.runInContext(
      `browserDemoRequest(${JSON.stringify(path)}, ${JSON.stringify(options ?? {})})`, context
    ),
    storage
  };
}

test("conversation-created strategy preserves selected models and creates a transparent workflow", async () => {
  const { api, storage } = await demoContext();
  const strategy = await api("/api/strategies", {
    method: "POST",
    body: JSON.stringify({
      goal: "每周定投 ETH，月度预算 500 USDT，单次最多买入 80 USDT",
      terms: { asset: "ETH", maxOrder: "25", quoteAsset: "USDT", capital: "500", cadence: "每周" },
      budget: "5", model: "Claude Sonnet", committee: ["GPT-5.6", "Gemini", "Claude Sonnet"]
    })
  });
  assert.equal(strategy.asset, "ETH");
  assert.equal(strategy.model, "Claude Sonnet");
  assert.equal(strategy.committee.length, 3);
  const run = await api("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: strategy.id }) });
  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.proposedOrder.amount, "25");
  assert.equal(run.proposedOrder.quoteAsset, "USDT");
  assert.equal(run.events.length, 7);
  assert.equal(run.events.some(e => e.type === "committee"), true);
  assert.equal(run.payment.status, "not_paid_demo");
  assert.equal(run.operatingBudget.spent, "0");
  assert.equal(run.events.some(e => e.type === "demo"), false);
  const order = await api("/api/runs/" + run.id + "/approve", { method: "POST", body: "{}" });
  assert.equal(order.status, "simulated");
  assert.equal(order.order.simulated, true);
  const monitored = await api("/api/runs/" + run.id + "/monitor", { method: "POST", body: "{}" });
  assert.equal(monitored.status, "monitoring");
  const reviewed = await api("/api/runs/" + run.id + "/review", { method: "POST", body: "{}" });
  assert.match(reviewed.review.summary, /不计算盈亏/);
  assert.ok(storage.has("oasis-demo-v1"));
});

test("demo rejects invalid service budgets and does not expose payment endpoints", async () => {
  const { api } = await demoContext();
  for (const budget of ["-1", "0.01", "0.1234567", "100.01", "abc"]) {
    await assert.rejects(() => api("/api/strategies", {
      method: "POST", body: JSON.stringify({ goal: "帮我观察 ETH 趋势", budget })
    }));
  }
  const strategy = await api("/api/strategies", {
    method: "POST", body: JSON.stringify({ goal: "帮我观察 BTC 趋势", budget: "1", terms: { asset: "BTC", maxOrder: "10", quoteAsset: "USDC", cadence: "按信号触发" } })
  });
  assert.equal(strategy.asset, "BTC");
  await assert.rejects(() => api("/api/payments", { method: "POST" }), /不存在/);
  const run = await api("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: strategy.id }) });
  await assert.rejects(() => api("/api/runs/" + run.id + "/monitor", { method: "POST" }), /请先确认模拟订单/);
});


test("confirmation is required and contradictory order limits cannot create a strategy", async () => {
  const { api } = await demoContext();
  for (const terms of [undefined, { asset: "ETH", maxOrder: "", quoteAsset: "USDT", cadence: "每周" },
    { asset: "ETH", maxOrder: "100", capital: "50", quoteAsset: "USDT", cadence: "每周" }]) {
    await assert.rejects(() => api("/api/strategies", { method: "POST", body: JSON.stringify({ goal: "每周定投 ETH", terms }) }));
  }
  assert.equal((await api("/api/strategies")).length, 0);
});

test("saved run history survives reloading the demo and allows reviewing the original order", async () => {
  const { api, storage } = await demoContext();
  const strategy = await api("/api/strategies", { method: "POST", body: JSON.stringify({ goal: "每周定投 SOL", terms: { asset: "SOL", maxOrder: "12.50", quoteAsset: "USDC", cadence: "每周" } }) });
  const run = await api("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: strategy.id }) });
  await api("/api/runs/" + run.id + "/approve", { method: "POST" });
  const reloaded = await demoContext();
  for (const [key, value] of storage) reloaded.storage.set(key, value);
  const history = await reloaded.api("/api/runs");
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "simulated");
  assert.equal(history[0].order.amount, "12.50");
  assert.equal(history[0].order.quoteAsset, "USDC");
  await assert.rejects(() => reloaded.api("/api/runs/" + run.id + "/approve", { method: "POST" }), /已经处理/);
});

test("draft extraction uses the latest explicit constraint without inventing an asset", async () => {
  const source = await readFile(new URL("./app.js", import.meta.url), "utf8");
  const start = source.indexOf("function latestMatch(");
  const end = source.indexOf("function validateDraft(", start);
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end), context);
  const draft = vm.runInContext('extractDraft("每周定投 ETH，月度预算 500 USDT，单次最多买入 80 USDT；改成 BTC，每次不超过 25 USDC，回撤 5% 暂停")', context);
  assert.equal(draft.asset, "BTC");
  assert.equal(draft.maxOrder, "25");
  assert.equal(draft.quoteAsset, "USDC");
  assert.equal(draft.stopPercent, "5");
  assert.equal(vm.runInContext('extractDraft("帮我制定投资策略").asset', context), "");
});
