import test from "node:test";
import assert from "node:assert/strict";
import { loadX402EvmSdk } from "./x402-transport.mjs";
import { BASE_SEPOLIA } from "./config.mjs";

test("real x402 v2 SDK exposes required EVM client and policy APIs", async () => {
  const sdk = await loadX402EvmSdk();
  for (const name of ["x402Client", "wrapFetchWithPayment", "decodePaymentResponseHeader", "ExactEvmScheme", "privateKeyToAccount", "createPublicClient", "http", "decodeEventLog"]) {
    assert.equal(typeof sdk[name], "function", name);
  }
  const account = sdk.privateKeyToAccount("0x" + "a".repeat(64));
  const client = new sdk.x402Client();
  assert.equal(typeof client.register, "function");
  assert.equal(typeof client.registerPolicy, "function");
  client.register(BASE_SEPOLIA.network, new sdk.ExactEvmScheme(account));
  client.registerPolicy((_version, requirements) => requirements);
});
