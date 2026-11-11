import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_SEPOLIA, USDC, assertBaseSepoliaPayment,
  formatUsdcAmount, parseUsdcAmount
} from "./index.mjs";

test("Base Sepolia network and USDC constants are explicit", () => {
  assert.equal(BASE_SEPOLIA.chainId, 84532);
  assert.equal(BASE_SEPOLIA.network, "eip155:84532");
  assert.equal(USDC.decimals, 6);
  assert.equal(USDC.address, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
});

test("USDC amounts use integer atomic units without floating point", () => {
  assert.equal(parseUsdcAmount("1"), "1000000");
  assert.equal(parseUsdcAmount("0.1"), "100000");
  assert.equal(parseUsdcAmount("12.345678"), "12345678");
  assert.equal(formatUsdcAmount("12345678"), "12.345678");
  assert.equal(formatUsdcAmount("100000"), "0.1");
  assert.equal(formatUsdcAmount("1000000"), "1");
});

test("USDC parser rejects invalid precision and negative values", () => {
  assert.throws(() => parseUsdcAmount("-1"));
  assert.throws(() => parseUsdcAmount("0.0000001"));
  assert.throws(() => parseUsdcAmount("1.2.3"));
});

test("payment guard rejects other networks, assets and invalid amounts", () => {
  assert.equal(assertBaseSepoliaPayment({
    network: BASE_SEPOLIA.network, asset: USDC.address, amount: "100000"
  }).allowed, true);
  assert.equal(assertBaseSepoliaPayment({
    network: "eip155:8453", asset: USDC.address, amount: "100000"
  }).allowed, false);
  assert.equal(assertBaseSepoliaPayment({
    network: BASE_SEPOLIA.network, asset: "0x0000000000000000000000000000000000000001", amount: "100000"
  }).allowed, false);
  assert.equal(assertBaseSepoliaPayment({
    network: BASE_SEPOLIA.network, asset: USDC.address, amount: "0"
  }).allowed, false);
});
