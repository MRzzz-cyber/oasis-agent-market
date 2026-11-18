import assert from "node:assert/strict";
import test from "node:test";
import { makeSimulationCheckout, SIMULATION_HEADER } from "./simulation.mjs";
import { BASE_SEPOLIA, USDC } from "./config.mjs";

test("simulated checkout issues a scoped USDC quote and consumes it once", () => {
  const checkout = makeSimulationCheckout("market-signal", () => 1_000);
  const scope = { resource: "/signal", amount: "10000" };
  const { body } = checkout.request({ ...scope, request: { headers: {} } });
  assert.equal(body.quote.network, BASE_SEPOLIA.network);
  assert.equal(body.quote.asset, USDC.address);
  const request = { headers: { [SIMULATION_HEADER]: body.quote.id } };
  const result = checkout.request({ ...scope, request });
  assert.equal(result.payment.mode, "simulation");
  assert.equal(result.payment.amount, "10000");
  assert.equal(checkout.request({ ...scope, request }).status, 409);
});
