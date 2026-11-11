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
    location: { hostname: "oasis-ai-demo.workers.dev" },
    crypto: webcrypto,
    Date, Number, BigInt,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    api: (path, options) => vm.runInContext(
      `browserDemoRequest(${JSON.stringify(path)}, ${JSON.stringify(options ?? {})})`,
      context
    ),
    storage
  };
}

test("Cloudflare browser demo supports full simulation without payment", async () => {
  const { api, storage } = await demoContext();
  const status = await api("/api/status");
  assert.equal(status.realPaymentsEnabled, false);
  const strategy = await api("/api/strategies", {
    method: "POST", body: JSON.stringify({ goal: "每周定投 ETH，先使用模拟交易", budget: "5.25" })
  });
  assert.equal(strategy.asset, "ETH");
  assert.equal(strategy.budgetAtomic, "5250000");
  assert.equal((await api("/api/strategies")).length, 1);
  const run = await api("/api/runs", {
    method: "POST", body: JSON.stringify({ strategyId: strategy.id })
  });
  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.payment.status, "not_paid_demo");
  assert.equal(run.operatingBudget.spent, "0");
  assert.equal(run.events.find(e => e.type === "demo").paid, false);
  const order = await api("/api/runs/" + run.id + "/approve", { method: "POST" });
  assert.equal(order.order.simulated, true);
  await assert.rejects(() => api("/api/runs/" + run.id + "/approve", { method: "POST" }), /已处理/);
  assert.ok(storage.has("oasis-demo-v1"));
});

test("Cloudflare browser demo rejects invalid budgets and unsupported actions", async () => {
  const { api } = await demoContext();
  for (const badBudget of ["-1", "0.01", "0.1234567", "100.01", "abc"]) {
    await assert.rejects(() => api("/api/strategies", {
      method: "POST", body: JSON.stringify({ goal: "帮我观察 ETH 价格趋势", budget: badBudget })
    }));
  }
  const strategy = await api("/api/strategies", {
    method: "POST", body: JSON.stringify({ goal: "帮我观察 BTC 价格趋势", budget: "1" })
  });
  assert.equal(strategy.asset, "BTC");
  await assert.rejects(() => api("/api/payments", { method: "POST" }), /不存在/);
});
