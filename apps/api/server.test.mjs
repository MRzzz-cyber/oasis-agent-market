import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "./server.mjs";

test("Oasis demo: goal -> strategy -> run -> approval -> simulated order", async t => {
  const server = createAppServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port;
  const post = (route, body) => fetch(url + route, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  const health = await (await fetch(url + "/api/status")).json();
  assert.equal(health.mode, "simulation");
  assert.equal(health.realPaymentsEnabled, false);
  const created = await post("/api/strategies", {
    goal: "每周定投 ETH，预算有限，仅做模拟交易", budget: "5"
  });
  assert.equal(created.status, 201);
  const strategy = await created.json();
  const runResp = await post("/api/runs", { strategyId: strategy.id });
  assert.equal(runResp.status, 201);
  const run = await runResp.json();
  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.payment.status, "not_paid_demo");
  assert.equal(run.operatingBudget.spent, "0");
  assert.ok(run.events.some(e => e.type === "policy"));
  assert.ok(run.events.some(e => e.type === "committee"));
  const approved = await post("/api/runs/" + run.id + "/approve", {});
  assert.equal(approved.status, 200);
  const order = await approved.json();
  assert.equal(order.order.status, "simulated");
  assert.equal(order.order.simulated, true);
  assert.equal((await post("/api/runs/" + run.id + "/approve", {})).status, 409);
});
test("invalid strategy payload fails and no strategy is created", async t => {
  const server = createAppServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port;
  const post = (body) => fetch(url + "/api/strategies", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  assert.equal((await post({ goal: "ETH", budget: "5" })).status, 400);
  assert.equal((await post({ goal: "买入 ETH 先模拟", budget: "0.01" })).status, 400);
  assert.deepEqual(await (await fetch(url + "/api/strategies")).json(), []);
});
