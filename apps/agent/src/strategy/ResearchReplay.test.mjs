import assert from "node:assert/strict";
import test from "node:test";
import { replayResearch } from "./ResearchReplay.mjs";

test("compares all three strategies on identical out-of-sample outcomes", () => {
  const closes = [100, 101, 102, 103, 104, 105, 106, 116, 117, 118, 119];
  const candles = closes.map((close, index) => ({ close, timestamp: index * 86400 }));
  const { cases, strategies } = replayResearch(candles.reverse());
  assert.equal(cases, 4);
  assert.equal(strategies.noBuy.purchases, 0);
  assert.equal(strategies.buyAll.purchases, 12);
  assert.equal(strategies.buyAll.spendAtomic, "440000");
  assert.ok(strategies.oasis.purchases > 0 && strategies.oasis.purchases < cases);
});
