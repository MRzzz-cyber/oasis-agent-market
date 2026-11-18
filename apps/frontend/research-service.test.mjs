import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";
import { researchRoute } from "./research-service.js";

test("the Worker serves the three procurement scenarios under the production API path", async () => {
  const response = await worker.fetch(new Request("https://oasistrade.app/api/research/demo"), {}, {});
  assert.equal(response.status, 200);
  const { mode, network, asset, scenarios } = await response.json();
  assert.equal(mode, "simulation");
  assert.equal(network, "eip155:84532");
  assert.equal(asset, "USDC");
  assert.equal(scenarios.purchase.selectedProvider, "atlas");
  assert.equal(scenarios.decline.selectedProvider, null);
  assert.equal(scenarios.policyBlock.evaluations[0].reason, "quote_mismatch");
});

test("the live Worker uses the pinned historical candle window for all three strategies", async () => {
  const request = new Request("https://oasistrade.app/api/research/replay");
  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.cases, 174);
  assert.deepEqual(Object.keys(result.strategies), ["noBuy", "buyAll", "oasis"]);
  assert.equal(result.strategies.oasis.spendAtomic, "1920000");
  const write = await researchRoute(new Request(request.url, { method: "POST" }));
  assert.equal(write.status, 405);
});
