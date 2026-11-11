import test from "node:test";
import assert from "node:assert/strict";
import { createX402EvmTransport, matchesQuote, selectApprovedRequirement, verifyUsdcTransfer } from "./x402-transport.mjs";
import { PurchaseCoordinator } from "./purchase.mjs";
import { createUsdcPolicy } from "../../policy/src/usdc.mjs";
import { BASE_SEPOLIA, USDC } from "./config.mjs";

const payTo = "0x1111111111111111111111111111111111111111";
const payer = "0x2222222222222222222222222222222222222222";
const key = "0x" + "a".repeat(64);
const hash = "0x" + "b".repeat(64);
const now = Date.UTC(2026, 10, 11);
const quote = {
  taskId: "task-1", quoteId: "q-1", providerId: "oasis",
  serviceId: "market-signal", network: BASE_SEPOLIA.network,
  asset: USDC.address, payTo, amountAtomic: "100000", expiresAt: now + 60000
};
const requirement = {
  scheme: "exact", network: BASE_SEPOLIA.network,
  asset: USDC.address, payTo, amount: "100000"
};
const services = { "market-signal": { url: "https://example.com/market-signal", providerId: "oasis", payTo } };
const policy = createUsdcPolicy({
  taskId: "task-1", budgetAtomic: "200000",
  maxPaymentAtomic: "100000", allowedProviders: ["oasis"],
  allowedServices: ["market-signal"], allowedRecipients: [payTo], enabled: true
});

test("x402 requirement selector only accepts one exact Base Sepolia quote", () => {
  assert.equal(selectApprovedRequirement(2, [requirement], quote), requirement);
  for (const bad of [
    { ...requirement, network: "eip155:8453" },
    { ...requirement, amount: "100001" },
    { ...requirement, asset: payTo },
    { ...requirement, payTo: payer },
    { ...requirement, extra: { assetTransferMethod: "permit2" } }
  ]) {
    assert.equal(matchesQuote(bad, quote), false);
    assert.throws(() => selectApprovedRequirement(2, [bad], quote), /does not match/);
  }
  assert.throws(() => selectApprovedRequirement(1, [requirement], quote), /Only x402 v2/);
  assert.throws(() => selectApprovedRequirement(2, [requirement, requirement], quote), /does not match/);
});

test("transport rejects an untrusted destination or a missing signer", () => {
  assert.throws(() => createX402EvmTransport({
    services: { "market-signal": { url: "http://evil.example/signal", providerId: "oasis", payTo } },
    privateKey: key
  }), /HTTPS/);
  assert.throws(() => createX402EvmTransport({ services, privateKey: "" }), /test wallet/);
});

function mockSdk({ challenge = requirement, settlement = null } = {}) {
  const s = settlement ?? { success: true, network: BASE_SEPOLIA.network, transaction: hash };
  const observed = { signCount: 0 };
  return {
    observed,
    sdkLoader: async () => ({
      privateKeyToAccount: () => ({ address: payer }),
      ExactEvmScheme: class {},
      x402Client: class {
        constructor(selector) { this.selector = selector; }
        register() { return this; }
        registerPolicy(policyFn) { this.policyFn = policyFn; return this; }
      },
      wrapFetchWithPayment: (_fetch, client) => async (url, options) => {
        assert.equal(url, services["market-signal"].url);
        assert.equal(options.redirect, "error");
        const allowed = client.policyFn(2, [challenge]);
        if (!allowed.length) throw new Error("SDK policy rejected payment");
        client.selector(2, allowed);
        observed.signCount++;
        return {
          ok: true,
          headers: { get: key => key === "PAYMENT-RESPONSE" ? "encoded" : null },
          json: async () => ({ signal: "sample" })
        };
      },
      decodePaymentResponseHeader: () => s
    })
  };
}

test("SDK transport settles only after external transfer verification", async () => {
  const sdk = mockSdk();
  let verifyCalls = 0;
  const transport = createX402EvmTransport({
    services, privateKey: key, sdkLoader: sdk.sdkLoader,
    verifyTransfer: async args => {
      verifyCalls++;
      assert.equal(args.transactionHash, hash);
      assert.equal(args.payer, payer);
      return true;
    }
  });
  const coordinator = new PurchaseCoordinator({ policy, transport });
  const result = await coordinator.purchase(quote, { now });
  assert.equal(result.status, "settled");
  assert.equal(sdk.observed.signCount, 1);
  assert.equal(verifyCalls, 1);
  assert.equal(coordinator.ledger.getSnapshot().spentAtomic, "100000");
});

test("changed 402 challenge cannot be signed, and uncertain funds remain reserved", async () => {
  const sdk = mockSdk({ challenge: { ...requirement, amount: "200000" } });
  const coordinator = new PurchaseCoordinator({
    policy, transport: createX402EvmTransport({
      services, privateKey: key, sdkLoader: sdk.sdkLoader, verifyTransfer: async () => true
    })
  });
  const result = await coordinator.purchase(quote, { now });
  assert.equal(result.status, "reconciliation_required");
  assert.equal(sdk.observed.signCount, 0);
  assert.equal(coordinator.ledger.getSnapshot().reservedAtomic, "100000");
});

test("missing chain verification prevents accounting settlement", async () => {
  const sdk = mockSdk();
  const coordinator = new PurchaseCoordinator({
    policy, transport: createX402EvmTransport({
      services, privateKey: key, sdkLoader: sdk.sdkLoader,
      verifyTransfer: async () => false
    })
  });
  assert.equal((await coordinator.purchase(quote, { now })).status, "reconciliation_required");
  assert.equal(coordinator.ledger.getSnapshot().spentAtomic, "0");
});

test("on-chain verifier checks receipt status, asset, payer, payee and exact amount", async () => {
  function fakeSdk(status, logs) {
    return {
      baseSepolia: {},
      http: () => ({}),
      createPublicClient: () => ({ getTransactionReceipt: async () => ({ status, logs }) }),
      parseAbiItem: () => ({}),
      decodeEventLog: ({ data }) => ({ args: data })
    };
  }
  const transfer = { address: USDC.address, data: { from: payer, to: payTo, value: 100000n }, topics: [] };
  assert.equal(await verifyUsdcTransfer({ quote, transactionHash: hash, payer, sdk: fakeSdk("success", [transfer]), rpcUrl: "x" }), true);
  assert.equal(await verifyUsdcTransfer({ quote, transactionHash: hash, payer, sdk: fakeSdk("reverted", [transfer]), rpcUrl: "x" }), false);
  assert.equal(await verifyUsdcTransfer({ quote, transactionHash: hash, payer, sdk: fakeSdk("success", [{ ...transfer, address: payTo }]), rpcUrl: "x" }), false);
  assert.equal(await verifyUsdcTransfer({ quote, transactionHash: hash, payer, sdk: fakeSdk("success", [{ ...transfer, data: { from: payer, to: payTo, value: 200000n } }]), rpcUrl: "x" }), false);
});
