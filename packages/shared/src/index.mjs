import { parseUsdcAmount, formatUsdcAmount } from "../../evm/src/config.mjs";

export function usdcToAtomic(value) {
  const amount = Number(parseUsdcAmount(value));
  if (!Number.isSafeInteger(amount)) throw new RangeError("USDC amount exceeds the demo limit");
  return amount;
}

export function atomicToUsdc(value) {
  const amount = BigInt(value);
  return amount < 0n ? "-" + formatUsdcAmount(-amount) : formatUsdcAmount(amount);
}

export function nowIso() {
  return new Date().toISOString();
}

export function createRequestId(prefix = "req") {
  return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}
