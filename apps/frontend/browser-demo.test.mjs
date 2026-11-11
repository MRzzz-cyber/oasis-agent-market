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
      budget: "5", model: "Claude Sonnet", committee: ["GPT-5.6", "Gemini", "Claude Sonnet"]
    })
  });
  assert.equal(strategy.asset, "ETH");
  assert.equal(strategy.model, "Claude Sonnet");
  assert.equal(strategy.committee.length, 3);
  const run = await api("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: strategy.id }) });
  assert.equal(run.status, "awaiting_approval");
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
    method: "POST", body: JSON.stringify({ goal: "帮我观察 BTC 趋势", budget: "1" })
  });
  assert.equal(strategy.asset, "BTC");
  await assert.rejects(() => api("/api/payments", { method: "POST" }), /不存在/);
  const run = await api("/api/runs", { method: "POST", body: JSON.stringify({ strategyId: strategy.id }) });
  await assert.rejects(() => api("/api/runs/" + run.id + "/monitor", { method: "POST" }), /请先确认模拟订单/);
});
