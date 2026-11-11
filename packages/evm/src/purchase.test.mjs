import test from "node:test";
import assert from "node:assert/strict";
import { PurchaseCoordinator } from "./purchase.mjs";
import { createUsdcPolicy } from "../../../policy/src/usdc.mjs";
import { BASE_SEPOLIA, USDC } from "./config.mjs";

const recipient = "0x1111111111111111111111111111111111111111";
const txHash = "0x" + "b".repeat(64);
const now = Date.UTC(2026, 10, 11);
const policy = createUsdcPolicy({
  taskId: "test-task",
  budgetAtomic: "200000",
  maxPaymentAtomic: "100000",
  allowedProviders: ["provider"],
  allowedServices: ["market-signal"],
  allowedRecipients: [recipient],
  enabled: true
});
const quote = {
  taskId: "test-task",
  quoteId: "purchase-1",
  providerId: "provider",
  serviceId: "market-signal",
  network: BASE_SEPOLIA.network,
  asset: USDC.address,
  payTo: recipient,
  amountAtomic: "100000",
  expiresAt: now + 60000
};

test("blocked purchases never call the payment transport", async () => {
  let calls = 0;
  const coordinator = new PurchaseCoordinator({
    policy,
    transport: { pay: async () => { calls++; return {}; } }
  });
  const result = await coordinator.purchase({ ...quote, network: "eip155:8453" }, { now });
  assert.equal(result.status, "blocked");
  assert.equal(calls, 0);
  assert.equal(coordinator.ledger.getSnapshot().spentAtomic, "0");
});

test("no payment transport fails closed", async () => {
  const coordinator = new PurchaseCoordinator({ policy });
  const result = await coordinator.purchase(quote, { now });
  assert.equal(result.status, "blocked");
  assert.equal(coordinator.ledger.getSnapshot().availableAtomic, "200000");
});

test("verified settlement is recorded once", async () => {
  let calls = 0;
  const coordinator = new PurchaseCoordinator({
    policy,
    transport: {
      pay: async q => {
        calls++;
        return {
          settled: true, verified: true, quoteId: q.quoteId, network: q.network,
          asset: q.asset, payTo: q.payTo, amountAtomic: q.amountAtomic,
          transactionHash: txHash
        };
      }
    }
  });
  const result = await coordinator.purchase(quote, { now });
  assert.equal(result.status, "settled");
  assert.equal(result.payment.transactionHash, txHash);
  assert.equal(coordinator.ledger.getSnapshot().spentAtomic, "100000");
  assert.equal((await coordinator.purchase(quote, { now })).status, "blocked");
  assert.equal(calls, 1);
});

test("unverified payment is not marked settled or released", async () => {
  const coordinator = new PurchaseCoordinator({
    policy,
    transport: {
      pay: async q => ({
        settled: true, verified: false, quoteId: q.quoteId, network: q.network,
        asset: q.asset, payTo: q.payTo, amountAtomic: q.amountAtomic,
        transactionHash: txHash
      })
    }
  });
  assert.equal((await coordinator.purchase(quote, { now })).status, "reconciliation_required");
  assert.equal(coordinator.ledger.getSnapshot().reservedAtomic, "100000");
  assert.equal(coordinator.ledger.getSnapshot().spentAtomic, "0");
});

test("network error retains budget for reconciliation", async () => {
  const coordinator = new PurchaseCoordinator({
    policy,
    transport: { pay: async () => { throw new Error("timeout"); } }
  });
  assert.equal((await coordinator.purchase(quote, { now })).status, "reconciliation_required");
  assert.equal(coordinator.ledger.getSnapshot().availableAtomic, "100000");
});
