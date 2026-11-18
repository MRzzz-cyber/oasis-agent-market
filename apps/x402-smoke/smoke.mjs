import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { x402Client } from "@x402/core/client";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader, x402HTTPClient } from "@x402/core/http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme as ClientScheme } from "@x402/evm/exact/client";
import { ExactEvmScheme as ServerScheme } from "@x402/evm/exact/server";
import { createPublicClient, getAddress, http, parseAbiItem, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { BASE_SEPOLIA, USDC } from "../../packages/evm/src/config.mjs";
import { checkResearchQuote } from "../../packages/policy/src/research-purchase.mjs";

const key = process.env.OASIS_TESTNET_PAYER_KEY;
const recipient = process.env.OASIS_TESTNET_PAY_TO;
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "") || !recipient) {
  throw new Error("Configure OASIS_TESTNET_PAYER_KEY and OASIS_TESTNET_PAY_TO for an isolated test wallet");
}

const payer = privateKeyToAccount(key);
const payTo = getAddress(recipient);
if (payTo === payer.address || /^0x0{40}$/.test(payTo)) throw new Error("Use a distinct nonzero testnet recipient");
const rpc = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEPOLIA.rpcUrl) });
const amount = "10000";
if (await rpc.getChainId() !== BASE_SEPOLIA.chainId) throw new Error("Unexpected RPC network");
const balance = await rpc.readContract({
  address: USDC.address,
  abi: [parseAbiItem("function balanceOf(address owner) view returns (uint256)")],
  functionName: "balanceOf",
  args: [payer.address]
});
if (balance < BigInt(amount)) throw new Error("Test payer needs at least 0.01 Base Sepolia USDC");

const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const resourceServer = new x402ResourceServer(facilitator).register(BASE_SEPOLIA.network, new ServerScheme());
await resourceServer.initialize();
const [requirement] = await resourceServer.buildPaymentRequirements({
  scheme: "exact",
  network: BASE_SEPOLIA.network,
  payTo,
  price: "$0.01",
  maxTimeoutSeconds: 60
});
const resource = "/research/" + randomUUID();
const offer = {
  provider: "pulse", resource, payTo, amount, expiresAt: Date.now() + 60_000
};
const policy = { providers: [offer.provider], perPurchase: amount, remaining: amount };
let declared;
let attempted = false;
const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" || request.url !== resource) {
      response.writeHead(404).end();
      return;
    }
    const signature = request.headers["payment-signature"];
    if (typeof signature !== "string") {
      response.writeHead(402, { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(declared) }).end();
      return;
    }
    if (attempted || Date.now() >= offer.expiresAt) {
      response.writeHead(409).end();
      return;
    }
    const payment = decodePaymentSignatureHeader(signature);
    const quoted = payment.accepted;
    if (payment.x402Version !== 2 || payment.resource?.url !== declared.resource.url ||
      !quoted || quoted.network !== requirement.network || quoted.asset !== requirement.asset ||
      quoted.payTo !== requirement.payTo || quoted.amount !== requirement.amount || quoted.scheme !== requirement.scheme) {
      response.writeHead(400).end();
      return;
    }
    attempted = true;
    const verification = await resourceServer.verifyPayment(payment, requirement);
    if (!verification.isValid) {
      response.writeHead(402).end();
      return;
    }
    const result = await resourceServer.settlePayment(payment, requirement);
    if (!result.success) {
      response.writeHead(402).end();
      return;
    }
    response.writeHead(200, {
      "content-type": "application/json",
      "PAYMENT-RESPONSE": encodePaymentResponseHeader(result)
    }).end(JSON.stringify({ provider: "pulse", dataset: "smoke-test" }));
  } catch {
    response.writeHead(502).end();
  }
});

await new Promise((ready, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", ready);
});
try {
  const url = "http://127.0.0.1:" + server.address().port + resource;
  declared = await resourceServer.createPaymentRequiredResponse([requirement], { url, mimeType: "application/json" });
  const initial = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (initial.status !== 402) throw new Error("Expected an x402 challenge");
  const client = new x402HTTPClient(new x402Client().register(BASE_SEPOLIA.network, new ClientScheme(payer)));
  const challenge = client.getPaymentRequiredResponse(name => initial.headers.get(name));
  if (challenge.x402Version !== 2 || challenge.resource?.url !== url || challenge.accepts.length !== 1) {
    throw new Error("Unexpected x402 challenge");
  }
  const quote = { ...challenge.accepts[0], provider: offer.provider, resource, expiresAt: offer.expiresAt };
  const decision = checkResearchQuote({ quote, offer, policy, now: Date.now() });
  if (!decision.allowed) throw new Error("Payment policy rejected the challenge: " + decision.reason);
  const payload = await client.createPaymentPayload(challenge);
  const paid = await fetch(url, {
    headers: client.encodePaymentSignatureHeader(payload),
    redirect: "error",
    signal: AbortSignal.timeout(90000)
  });
  if (!paid.ok) throw new Error("Settlement request ended with HTTP " + paid.status + ". Check chain activity before retrying.");
  const result = client.getPaymentSettleResponse(name => paid.headers.get(name));
  if (!result.success || result.network !== BASE_SEPOLIA.network || !/^0x[0-9a-f]{64}$/i.test(result.transaction)) {
    throw new Error("Facilitator did not return a valid testnet settlement");
  }
  const explorer = BASE_SEPOLIA.explorerUrl + "/tx/" + result.transaction;
  console.log("Facilitator transaction:", explorer);
  const receipt = await rpc.waitForTransactionReceipt({ hash: result.transaction, timeout: 90000 });
  const transfers = parseEventLogs({
    abi: [parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")],
    logs: receipt.logs.filter(log => log.address.toLowerCase() === USDC.address.toLowerCase())
  });
  const matched = transfers.some(({ args }) =>
    getAddress(args.from) === payer.address && getAddress(args.to) === payTo && args.value === BigInt(amount)
  );
  if (receipt.status !== "success" || !matched) throw new Error("USDC transfer could not be confirmed: " + explorer);
  console.log(JSON.stringify({ status: "confirmed", transaction: result.transaction, explorer, amountAtomic: amount }));
} finally {
  await new Promise(resolve => server.close(resolve));
}
