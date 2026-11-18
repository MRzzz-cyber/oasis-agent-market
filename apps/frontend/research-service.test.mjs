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

test("the replay route returns three strategies and handles upstream failure", async () => {
  const request = new Request("https://oasistrade.app/api/research/replay");
  const start = Date.parse("2025-01-01T00:00:00Z") / 1000;
  const fetchImpl = async () => Response.json(Array.from({ length: 10 }, (_, index) =>
    [start + index * 86400, 0, 0, 0, 100 + index]));
  const response = await researchRoute(request, { fetchImpl });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys((await response.json()).strategies), ["noBuy", "buyAll", "oasis"]);
  const failure = await researchRoute(request, { fetchImpl: async () => new Response(null, { status: 503 }) });
  assert.equal(failure.status, 502);
  const write = await researchRoute(new Request(request.url, { method: "POST" }), { fetchImpl });
  assert.equal(write.status, 405);
});
