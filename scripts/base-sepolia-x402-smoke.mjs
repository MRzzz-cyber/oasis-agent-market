import { PurchaseCoordinator } from "../packages/evm/src/purchase.mjs";
import { createX402EvmTransport } from "../packages/evm/src/x402-transport.mjs";
import { BASE_SEPOLIA, USDC, parseUsdcAmount } from "../packages/evm/src/config.mjs";
import { createUsdcPolicy } from "../packages/policy/src/usdc.mjs";

// Intentionally opt-in: this program MAY spend Base Sepolia *test* USDC.
// No mainnet network or wallet support. Key remains server side.
if (process.env.OASIS_ENABLE_TESTNET_PAYMENTS !== "YES_I_AUTHORIZE_TEST_USDC_SPEND") {
  throw new Error("Testnet payments disabled. Set OASIS_ENABLE_TESTNET_PAYMENTS=YES_I_AUTHORIZE_TEST_USDC_SPEND explicitly.");
}

const serviceUrl = process.env.OASIS_TEST_SERVICE_URL;
const payTo = process.env.OASIS_TEST_SERVICE_RECIPIENT;
const privateKey = process.env.OASIS_AGENT_WALLET_PRIVATE_KEY;

if (!serviceUrl || !payTo || !privateKey) {
  throw new Error("Configure OASIS_TEST_SERVICE_URL, OASIS_TEST_SERVICE_RECIPIENT and OASIS_AGENT_WALLET_PRIVATE_KEY");
}
if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error("Invalid test service recipient address");

const amountAtomic = parseUsdcAmount("0.10");
const policy = createUsdcPolicy({
  taskId: "oasis-smoke",
  budgetAtomic: parseUsdcAmount("0.10"),
  maxPaymentAtomic: amountAtomic,
  allowedProviders: ["oasis-test-service"],
  allowedServices: ["market-signal"],
  allowedRecipients: [payTo],
  enabled: true
});
const transport = createX402EvmTransport({
  services: {
    "market-signal": {
      url: serviceUrl,
      providerId: "oasis-test-service",
      payTo
    }
  },
  privateKey,
  allowLocalhost: process.env.OASIS_ALLOW_LOCALHOST_X402_SERVICE === "YES_LOCAL_TEST"
});
const coordinator = new PurchaseCoordinator({ policy, transport });
const quote = {
  taskId: policy.taskId,
  quoteId: "smoke-" + crypto.randomUUID(),
  providerId: "oasis-test-service",
  serviceId: "market-signal",
  network: BASE_SEPOLIA.network,
  asset: USDC.address,
  payTo,
  amountAtomic,
  expiresAt: Date.now() + 120000
};
const result = await coordinator.purchase(quote);
const output = {
  status: result.status,
  reasons: result.reasons,
  payment: result.payment,
  ledger: coordinator.ledger.getSnapshot()
};
console.log(JSON.stringify(output, null, 2));
if (result.status !== "settled") process.exitCode = 1;
