import { BASE_SEPOLIA, USDC } from "./config.mjs";

// Optional runtime SDKs are loaded only when a real payment is requested.
export async function loadX402EvmSdk() {
  const [fetchSdk, evmSdk, accounts, viem, chains] = await Promise.all([
    import("@x402/fetch"),
    import("@x402/evm/exact/client"),
    import("viem/accounts"),
    import("viem"),
    import("viem/chains")
  ]);
  return {
    x402Client: fetchSdk.x402Client,
    wrapFetchWithPayment: fetchSdk.wrapFetchWithPayment,
    decodePaymentResponseHeader: fetchSdk.decodePaymentResponseHeader,
    ExactEvmScheme: evmSdk.ExactEvmScheme,
    privateKeyToAccount: accounts.privateKeyToAccount,
    createPublicClient: viem.createPublicClient,
    http: viem.http,
    parseAbiItem: viem.parseAbiItem,
    decodeEventLog: viem.decodeEventLog,
    baseSepolia: chains.baseSepolia
  };
}

function sameAddress(a, b) {
  return typeof a === "string" && typeof b === "string" &&
    /^0x[a-fA-F0-9]{40}$/.test(a) && a.toLowerCase() === b.toLowerCase();
}

export function matchesQuote(requirement, quote) {
  return Boolean(requirement &&
    requirement.scheme === "exact" &&
    requirement.network === BASE_SEPOLIA.network &&
    sameAddress(requirement.asset, USDC.address) &&
    sameAddress(requirement.payTo, quote.payTo) &&
    typeof requirement.amount === "string" &&
    requirement.amount === quote.amountAtomic &&
    (!requirement.extra?.assetTransferMethod ||
      requirement.extra.assetTransferMethod === "eip3009"));
}

export function selectApprovedRequirement(version, requirements, quote) {
  if (version !== 2 || !Array.isArray(requirements)) {
    throw new Error("Only x402 v2 payment requirements are supported");
  }
  const matches = requirements.filter(r => matchesQuote(r, quote));
  if (matches.length !== 1) {
    throw new Error("x402 payment challenge does not match authorized quote");
  }
  return matches[0];
}

function validateServiceRegistry(services, allowLocalhost) {
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    throw new TypeError("Trusted service registry is required");
  }
  const registry = new Map();
  for (const [serviceId, config] of Object.entries(services)) {
    const url = new URL(config.url);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.hash ||
      (url.protocol !== "https:" && !(allowLocalhost && local && url.protocol === "http:"))) {
      throw new Error("Service URL must use HTTPS or explicitly enabled localhost HTTP");
    }
    if (!sameAddress(config.payTo, config.payTo)) {
      throw new Error("Trusted registry recipient must be an EVM address");
    }
    if (typeof config.providerId !== "string" || !config.providerId) {
      throw new Error("Trusted registry provider ID is required");
    }
    registry.set(serviceId, Object.freeze({
      url: url.toString(), payTo: config.payTo, providerId: config.providerId
    }));
  }
  return registry;
}

// Never treat a merchant-supplied PAYMENT-RESPONSE header as settlement proof.
export async function verifyUsdcTransfer({ quote, transactionHash, payer, sdk, rpcUrl }) {
  const hash = String(transactionHash);
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return false;
  const client = sdk.createPublicClient({ chain: sdk.baseSepolia, transport: sdk.http(rpcUrl) });
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== "success") return false;
  const event = sdk.parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
  let total = 0n;
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, USDC.address)) continue;
    try {
      const decoded = sdk.decodeEventLog({
        abi: [event], data: log.data, topics: log.topics, eventName: "Transfer"
      });
      if (sameAddress(decoded.args.from, payer) && sameAddress(decoded.args.to, quote.payTo)) {
        total += BigInt(decoded.args.value);
      }
    } catch {
      // Other token events are irrelevant.
    }
  }
  return total === BigInt(quote.amountAtomic);
}

// Trusted app configuration only. Never pass an LLM generated registry or signer.
export function createX402EvmTransport({
  services,
  privateKey = process.env.OASIS_AGENT_WALLET_PRIVATE_KEY,
  rpcUrl = BASE_SEPOLIA.rpcUrl,
  fetchImpl = fetch,
  sdkLoader = loadX402EvmSdk,
  verifyTransfer = verifyUsdcTransfer,
  allowLocalhost = false
}) {
  const registry = validateServiceRegistry(services, allowLocalhost);
  if (typeof privateKey !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error("An isolated 32-byte server-side test wallet key is required");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  return Object.freeze({
    async pay(quote) {
      const service = registry.get(quote.serviceId);
      if (!service || service.providerId !== quote.providerId ||
        !sameAddress(service.payTo, quote.payTo) ||
        quote.network !== BASE_SEPOLIA.network ||
        !sameAddress(quote.asset, USDC.address)) {
        throw new Error("Quote does not match trusted service registry and Base Sepolia policy");
      }

      const sdk = await sdkLoader();
      const account = sdk.privateKeyToAccount(privateKey);
      const client = new sdk.x402Client(
        (version, requirements) => selectApprovedRequirement(version, requirements, quote)
      );
      client.register(BASE_SEPOLIA.network, new sdk.ExactEvmScheme(account));
      client.registerPolicy((version, requirements) =>
        version === 2 ? requirements.filter(r => matchesQuote(r, quote)) : []
      );

      // Only an approved service registry URL is reachable.
      const paidFetch = sdk.wrapFetchWithPayment(fetchImpl, client);
      const response = await paidFetch(service.url, { method: "GET", redirect: "error" });
      if (!response.ok) throw new Error("x402 resource request failed: HTTP " + response.status);

      const header = response.headers.get("PAYMENT-RESPONSE");
      if (!header) throw new Error("Missing x402 settlement response");
      const settlement = sdk.decodePaymentResponseHeader(header);
      if (settlement?.success !== true ||
        settlement.network !== BASE_SEPOLIA.network ||
        !/^0x[a-fA-F0-9]{64}$/.test(String(settlement.transaction))) {
        throw new Error("Invalid x402 settlement response");
      }

      const verified = await verifyTransfer({
        quote, transactionHash: settlement.transaction, payer: account.address, sdk, rpcUrl
      });
      if (!verified) throw new Error("On-chain USDC settlement did not match authorized quote");
      return {
        settled: true, verified: true,
        quoteId: quote.quoteId, network: quote.network,
        asset: quote.asset, payTo: quote.payTo,
        amountAtomic: quote.amountAtomic,
        transactionHash: settlement.transaction,
        data: await response.json()
      };
    }
  });
}
