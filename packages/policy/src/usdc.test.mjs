import test from "node:test";
import assert from "node:assert/strict";
import { createUsdcPolicy, UsdcBudgetLedger } from "./usdc.mjs";
import { BASE_SEPOLIA, USDC } from "../../evm/src/config.mjs";

const recipient = "0x1111111111111111111111111111111111111111";
const now = Date.UTC(2026, 10, 11);
const txHash = "0x" + "a".repeat(64);

function policy(overrides = {}) {
  return createUsdcPolicy({
    taskId: "task1",
    budgetAtomic: "300000",
    maxPaymentAtomic: "100000",
    allowedProviders: ["oasis"],
    allowedServices: ["market-signal"],
    allowedRecipients: [recipient],
    enabled: true,
    ...overrides
  });
}

function quote(id = "quote1", overrides = {}) {
  return {
    taskId: "task1",
    quoteId: id,
    providerId: "oasis",
    serviceId: "market-signal",
    network: BASE_SEPOLIA.network,
    asset: USDC.address,
    payTo: recipient,
    amountAtomic: "100000",
    expiresAt: now + 60000,
    ...overrides
  };
}

test("policy starts disabled unless user explicitly enables payments", () => {
  const ledger = new UsdcBudgetLedger(policy({ enabled: false }));
  assert.match(ledger.evaluate(quote(), now).reasons.join(";"), /disabled/);
});

test("policy is frozen and cannot be widened by changing the copy", () => {
  const p = policy();
  assert.equal(Object.isFrozen(p.allowedProviders), true);
  assert.throws(() => p.allowedProviders.push("attacker"));
});

test("reserve checks provider, service, recipient, asset, network and expiry", () => {
  const samples = [
    quote("provider", { providerId: "unknown" }),
    quote("service", { serviceId: "admin" }),
    quote("recipient", { payTo: "0x2222222222222222222222222222222222222222" }),
    quote("asset", { asset: "0x2222222222222222222222222222222222222222" }),
    quote("network", { network: "eip155:8453" }),
    quote("expired", { expiresAt: now }),
    quote("amount", { amountAtomic: "100001" }),
    quote("floating", { amountAtomic: "0.1" })
  ];
  for (const sample of samples) {
    const ledger = new UsdcBudgetLedger(policy());
    assert.equal(ledger.reserve(sample, now).allowed, false, sample.quoteId);
    assert.equal(ledger.getSnapshot().reservedAtomic, "0");
  }
});

test("reservations consume capacity before settlement and prevent budget overruns", () => {
  const ledger = new UsdcBudgetLedger(policy({ budgetAtomic: "150000" }));
  assert.equal(ledger.reserve(quote("a"), now).allowed, true);
  assert.equal(ledger.reserve(quote("b"), now).allowed, false);
  assert.equal(ledger.getSnapshot().availableAtomic, "50000");
});

test("quote IDs are idempotent and cannot change their bound terms", () => {
  const ledger = new UsdcBudgetLedger(policy());
  assert.equal(ledger.reserve(quote(), now).allowed, true);
  assert.match(ledger.reserve(quote(), now).reasons.join(";"), /already processed/);
  assert.match(ledger.reserve(quote("quote1", { payTo: "0x2222222222222222222222222222222222222222" }), now).reasons.join(";"), /conflict/);
});

test("settled charges count exactly once and reject conflicting transaction hashes", () => {
  const ledger = new UsdcBudgetLedger(policy());
  ledger.reserve(quote(), now);
  ledger.settle("quote1", txHash);
  ledger.settle("quote1", txHash);
  assert.equal(ledger.getSnapshot().spentAtomic, "100000");
  assert.equal(ledger.getSnapshot().reservedAtomic, "0");
  assert.throws(() => ledger.settle("quote1", "0x" + "b".repeat(64)), /conflict/);
});

test("known pre-submit failures release budget", () => {
  const ledger = new UsdcBudgetLedger(policy());
  ledger.reserve(quote(), now);
  ledger.fail("quote1", { submitted: false });
  assert.equal(ledger.getSnapshot().availableAtomic, "300000");
  assert.equal(ledger.getSnapshot().records[0].status, "failed");
});

test("uncertain settlement retains reserved funds until reconciled", () => {
  const ledger = new UsdcBudgetLedger(policy());
  ledger.reserve(quote(), now);
  ledger.fail("quote1", { submitted: true });
  assert.equal(ledger.getSnapshot().reservedAtomic, "100000");
  assert.throws(() => ledger.fail("quote1", { submitted: false }), /Cannot release/);
  ledger.settle("quote1", txHash);
  assert.equal(ledger.getSnapshot().spentAtomic, "100000");
});

test("malformed policies fail closed", () => {
  assert.throws(() => policy({ budgetAtomic: "0.3" }), /integer string/);
  assert.throws(() => policy({ maxPaymentAtomic: "400000" }), /limit/);
  assert.throws(() => policy({ allowedRecipients: [] }), /allowlist/);
  assert.throws(() => policy({ allowedRecipients: ["abc"] }), /EVM address/);
});
