import { BASE_SEPOLIA, USDC } from "../../../../packages/evm/src/config.mjs";
import { checkResearchQuote } from "../../../../packages/policy/src/research-purchase.mjs";

export const providers = Object.freeze([
  Object.freeze({ id: "pulse", amount: "10000", qualityBps: 5600, window: 1 }),
  Object.freeze({ id: "atlas", amount: "30000", qualityBps: 6800, window: 3 }),
  Object.freeze({ id: "prism", amount: "70000", qualityBps: 7600, window: 6 })
]);

export const demoPolicy = Object.freeze({
  providers: Object.freeze(providers.map(({ id }) => id)),
  perPurchase: "70000",
  remaining: "110000"
});

export function makeResearchOffers(now) {
  return providers.map((provider, index) => ({
    provider: provider.id,
    scheme: "exact",
    network: BASE_SEPOLIA.network,
    asset: USDC.address,
    payTo: "0x" + String(index + 1).padStart(40, "0"),
    amount: provider.amount,
    resource: "/research/" + provider.id,
    expiresAt: now + 60_000
  }));
}

export function planResearch({ certaintyBps, decisionStake, quotes, offers, policy, now }) {
  if (!Number.isInteger(certaintyBps) || certaintyBps < 5000 || certaintyBps > 10000) {
    throw new RangeError("certaintyBps must be an integer between 5000 and 10000");
  }
  const stake = BigInt(decisionStake);
  if (stake < 0n) throw new RangeError("decisionStake must be nonnegative");

  const evaluations = quotes.map(quote => {
    const offer = offers.find(candidate => candidate.provider === quote.provider);
    const authorization = checkResearchQuote({ quote, offer, policy, now });
    if (!authorization.allowed) {
      return { provider: quote.provider, status: "blocked", reason: authorization.reason };
    }

    const provider = providers.find(candidate => candidate.id === quote.provider);
    if (!provider) return { provider: quote.provider, status: "blocked", reason: "unknown_provider" };
    const improvement = BigInt(Math.max(0, provider.qualityBps - certaintyBps));
    const estimate = stake * improvement / 10000n;
    const surplus = estimate - BigInt(quote.amount);
    return {
      provider: quote.provider,
      amount: quote.amount,
      estimatedValue: String(estimate),
      surplus: String(surplus),
      status: "declined",
      reason: surplus > 0n ? "better_offer_available" : "insufficient_value"
    };
  });

  const best = evaluations.reduce((selected, candidate) => {
    if (candidate.status === "blocked" || BigInt(candidate.surplus) <= 0n) return selected;
    if (!selected || BigInt(candidate.surplus) > BigInt(selected.surplus)) return candidate;
    return selected;
  }, null);
  if (best) {
    best.status = "selected";
    best.reason = "highest_positive_estimated_surplus";
  }
  return { selectedProvider: best?.provider ?? null, evaluations };
}

export function runResearchDemo() {
  const now = Date.now();
  const offers = makeResearchOffers(now);
  const invalidQuote = { ...offers[2], payTo: offers[0].payTo };
  const evaluate = (certaintyBps, quotes) => planResearch({
    certaintyBps, decisionStake: "300000", quotes, offers, policy: demoPolicy, now
  });
  return {
    mode: "simulation",
    network: BASE_SEPOLIA.network,
    asset: USDC.symbol,
    scenarios: {
      purchase: evaluate(5200, offers),
      decline: evaluate(8000, offers),
      policyBlock: evaluate(5200, [invalidQuote])
    }
  };
}
