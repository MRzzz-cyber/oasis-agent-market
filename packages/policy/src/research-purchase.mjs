import { BASE_SEPOLIA, USDC } from "../../evm/src/config.mjs";

export function checkResearchQuote({ quote, offer, policy, now }) {
  if (!offer || !policy) return { allowed: false, reason: "missing_authorization" };
  if (quote.provider !== offer.provider || !policy.providers.includes(offer.provider)) {
    return { allowed: false, reason: "provider_not_allowed" };
  }
  if (quote.network !== BASE_SEPOLIA.network || quote.asset !== USDC.address || quote.scheme !== "exact") {
    return { allowed: false, reason: "payment_rail_mismatch" };
  }
  if (quote.payTo !== offer.payTo || quote.amount !== offer.amount || quote.resource !== offer.resource) {
    return { allowed: false, reason: "quote_mismatch" };
  }
  if (!Number.isSafeInteger(quote.expiresAt) || quote.expiresAt <= now || quote.expiresAt !== offer.expiresAt) {
    return { allowed: false, reason: "expired_or_modified_quote" };
  }
  if (BigInt(offer.amount) > BigInt(policy.perPurchase) || BigInt(offer.amount) > BigInt(policy.remaining)) {
    return { allowed: false, reason: "budget_exceeded" };
  }
  return { allowed: true };
}
