import assert from "node:assert/strict";
import test from "node:test";
import { demoPolicy, makeResearchOffers, planResearch, runResearchDemo } from "./ResearchPlanner.mjs";

test("selects positive surplus, declines saturated evidence, and blocks changed recipients", () => {
  const { scenarios } = runResearchDemo();
  assert.equal(scenarios.purchase.selectedProvider, "atlas");
  assert.equal(scenarios.decline.selectedProvider, null);
  assert.ok(scenarios.decline.evaluations.every(entry => entry.reason === "insufficient_value"));
  assert.equal(scenarios.policyBlock.selectedProvider, null);
  assert.equal(scenarios.policyBlock.evaluations[0].reason, "quote_mismatch");
});

test("budget and expiry override attractive prices", () => {
  const now = 100_000;
  const offers = makeResearchOffers(now);
  const request = {
    certaintyBps: 5000, decisionStake: "1000000", quotes: offers, offers, now,
    policy: { ...demoPolicy, remaining: "9999" }
  };
  assert.ok(planResearch(request).evaluations.every(entry => entry.reason === "budget_exceeded"));
  const expired = planResearch({ ...request, now: now + 60_000, policy: demoPolicy });
  assert.ok(expired.evaluations.every(entry => entry.reason === "expired_or_modified_quote"));
});
