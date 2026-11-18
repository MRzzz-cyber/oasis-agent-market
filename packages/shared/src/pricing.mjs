import { BASE_SEPOLIA, USDC } from "../../evm/src/config.mjs";

export const PAID_AGENT_PRICING = Object.freeze({
  "market-signal": {
    asset: USDC.address,
    network: BASE_SEPOLIA.network,
    tiers: {
      basic: {
        depth: "fast confirmation",
        usage: { candles: 40, indicators: 2, timeframes: 1 }
      },
      standard: {
        depth: "breakout and volume confirmation",
        usage: { candles: 120, indicators: 4, timeframes: 1 }
      },
      deep: {
        depth: "multi-timeframe confirmation",
        usage: { candles: 240, indicators: 6, timeframes: 3 }
      }
    },
    formula: {
      baseAtomic: 4000,
      perCandleAtomic: 100,
      perIndicatorAtomic: 1500,
      perTimeframeAtomic: 2500
    }
  },
  "risk-challenge": {
    asset: USDC.address,
    network: BASE_SEPOLIA.network,
    tiers: {
      standard: {
        depth: "adversarial downside review",
        usage: { stressScenarios: 3, checks: 4, riskFactors: 2 }
      },
      deep: {
        depth: "stress scenarios and invalidation checks",
        usage: { stressScenarios: 6, checks: 7, riskFactors: 4 }
      }
    },
    formula: {
      baseAtomic: 5000,
      perStressScenarioAtomic: 3500,
      perCheckAtomic: 1200,
      perRiskFactorAtomic: 1500
    }
  }
});

export function quotePaidAgentCall({ service, reasoningTier = "standard", usage } = {}) {
  const pricing = PAID_AGENT_PRICING[service];
  if (!pricing) {
    throw new Error(`Unknown paid agent service: ${service}`);
  }

  const tier = pricing.tiers[reasoningTier] ? reasoningTier : defaultTierFor(service);
  const normalizedUsage = normalizeUsage({ service, reasoningTier: tier, usage });
  const quotedAtomic = calculateUsagePriceAtomic({ service, usage: normalizedUsage });

  return {
    service,
    reasoningTier: tier,
    quotedAtomic,
    usage: normalizedUsage,
    pricingModel: pricingModelName(service),
    depth: pricing.tiers[tier].depth,
    network: pricing.network,
    asset: pricing.asset
  };
}

export function listPaidAgentQuotes() {
  return Object.fromEntries(
    Object.entries(PAID_AGENT_PRICING).map(([service, pricing]) => [
      service,
      Object.keys(pricing.tiers).map((reasoningTier) => {
        const quote = quotePaidAgentCall({ service, reasoningTier });
        return {
          tier: reasoningTier,
          priceAtomic: quote.quotedAtomic,
          depth: quote.depth,
          usage: quote.usage,
          pricingModel: quote.pricingModel
        };
      })
    ])
  );
}

export function normalizeUsage({ service, reasoningTier = "standard", usage } = {}) {
  const pricing = PAID_AGENT_PRICING[service];
  if (!pricing) {
    throw new Error(`Unknown paid agent service: ${service}`);
  }

  const tier = pricing.tiers[reasoningTier] ? reasoningTier : defaultTierFor(service);
  const defaults = pricing.tiers[tier].usage;

  if (service === "market-signal") {
    return {
      candles: clampInteger(usage?.candles, defaults.candles, 20, 500),
      indicators: clampInteger(usage?.indicators, defaults.indicators, 1, 12),
      timeframes: clampInteger(usage?.timeframes, defaults.timeframes, 1, 5)
    };
  }

  if (service === "risk-challenge") {
    return {
      stressScenarios: clampInteger(usage?.stressScenarios, defaults.stressScenarios, 1, 10),
      checks: clampInteger(usage?.checks, defaults.checks, 1, 12),
      riskFactors: clampInteger(usage?.riskFactors, defaults.riskFactors, 1, 8)
    };
  }

  return { ...defaults };
}

export function usageFromSearchParams({ service, reasoningTier, searchParams }) {
  if (service === "market-signal") {
    return normalizeUsage({
      service,
      reasoningTier,
      usage: {
        candles: searchParams.get("candles"),
        indicators: searchParams.get("indicators"),
        timeframes: searchParams.get("timeframes")
      }
    });
  }

  if (service === "risk-challenge") {
    return normalizeUsage({
      service,
      reasoningTier,
      usage: {
        stressScenarios: searchParams.get("stressScenarios"),
        checks: searchParams.get("checks"),
        riskFactors: searchParams.get("riskFactors")
      }
    });
  }

  return normalizeUsage({ service, reasoningTier });
}

function calculateUsagePriceAtomic({ service, usage }) {
  const pricing = PAID_AGENT_PRICING[service];
  const formula = pricing.formula;

  if (service === "market-signal") {
    return formula.baseAtomic
      + usage.candles * formula.perCandleAtomic
      + usage.indicators * formula.perIndicatorAtomic
      + usage.timeframes * formula.perTimeframeAtomic;
  }

  if (service === "risk-challenge") {
    return formula.baseAtomic
      + usage.stressScenarios * formula.perStressScenarioAtomic
      + usage.checks * formula.perCheckAtomic
      + usage.riskFactors * formula.perRiskFactorAtomic;
  }

  return formula.baseAtomic;
}

function defaultTierFor(service) {
  return service === "market-signal" ? "standard" : "standard";
}

function pricingModelName(service) {
  if (service === "market-signal") return "usage_based_market_data";
  if (service === "risk-challenge") return "usage_based_risk_workload";
  return "usage_based";
}

function clampInteger(value, fallback, min, max) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
