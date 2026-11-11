export const BASE_SEPOLIA = Object.freeze({
  chainId: 84532,
  network: "eip155:84532",
  name: "Base Sepolia",
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
  explorerUrl: "https://sepolia.basescan.org"
});

export const USDC = Object.freeze({
  symbol: "USDC",
  decimals: 6,
  address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
});

export function parseUsdcAmount(value) {
  const input = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(input)) {
    throw new Error("USDC amount must be a non-negative decimal with at most 6 decimal places");
  }
  const [whole, fraction = ""] = input.split(".");
  return (BigInt(whole) * 10n ** 6n + BigInt(fraction.padEnd(6, "0") || "0")).toString();
}

export function formatUsdcAmount(atomicAmount) {
  if (!/^(0|[1-9]\d*)$/.test(String(atomicAmount))) {
    throw new Error("USDC atomic amount must be a non-negative integer string");
  }
  const amount = BigInt(atomicAmount);
  const whole = amount / 10n ** 6n;
  const fraction = String(amount % 10n ** 6n).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function assertBaseSepoliaPayment({ network, asset, amount }) {
  const reasons = [];
  if (network !== BASE_SEPOLIA.network) reasons.push("Only Base Sepolia is allowed");
  if (String(asset).toLowerCase() !== USDC.address.toLowerCase()) reasons.push("Only the configured USDC contract is allowed");
  try {
    if (BigInt(amount) <= 0n) reasons.push("Payment amount must be greater than zero");
  } catch {
    reasons.push("Payment amount must be an integer atomic-unit string");
  }
  return { allowed: reasons.length === 0, reasons };
}
