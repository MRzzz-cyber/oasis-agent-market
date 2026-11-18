import { BASE_SEPOLIA, USDC } from "../../../../packages/evm/src/config.mjs";
import { SIMULATION_HEADER, SIMULATION_RECIPIENT } from "../../../../packages/evm/src/simulation.mjs";
import { recordAgentCharge } from "../../../../packages/policy/src/index.mjs";
import { atomicToUsdc } from "../../../../packages/shared/src/index.mjs";
import { checkResearchQuote } from "../../../../packages/policy/src/research-purchase.mjs";
import { quotePaidAgentCall } from "../../../../packages/shared/src/pricing.mjs";

export class X402PaidToolClient {
  constructor({ guard, fetchImpl = fetch } = {}) {
    this.guard = guard;
    this.fetch = fetchImpl;
  }

  async callMarketSignal({ serviceBaseUrl, asset, locale, policy, ledger, plannedCall }) {
    const params = new URLSearchParams({
      asset,
      timeframe: policy.strategyIntent?.timeframe ?? "4h",
      strategy: policy.strategyIntent?.strategyType ?? "breakout",
      tier: plannedCall.reasoningTier,
      locale: locale ?? "en-US"
    });
    appendUsageParams(params, plannedCall.usage, ["candles", "indicators", "timeframes"]);

    return this.callPaidAgent({
      service: "market-signal",
      serviceBaseUrl,
      resourcePath: `/signal?${params.toString()}`,
      policy,
      ledger,
      plannedCall,
      extractResult: (paidResult) => ({
        signal: paidResult.signal,
        result: paidResult
      })
    });
  }

  async callRiskChallenge({ serviceBaseUrl, asset, hypothesis, locale, policy, ledger, plannedCall }) {
    const params = new URLSearchParams({
      asset,
      setup: hypothesis.setup,
      confidence: String(hypothesis.initialConfidence),
      tier: plannedCall.reasoningTier,
      locale: locale ?? "en-US"
    });
    appendUsageParams(params, plannedCall.usage, ["stressScenarios", "checks", "riskFactors"]);

    return this.callPaidAgent({
      service: "risk-challenge",
      serviceBaseUrl,
      resourcePath: `/challenge?${params.toString()}`,
      policy,
      ledger,
      plannedCall,
      extractResult: (paidResult) => ({
        challenge: paidResult.challenge,
        result: paidResult
      })
    });
  }

  async callPaidAgent({ service, serviceBaseUrl, resourcePath, policy, ledger, plannedCall, extractResult }) {
    const endpoint = `${serviceBaseUrl}${resourcePath}`;
    const initial = await this.fetch(endpoint, { redirect: "error", signal: AbortSignal.timeout(10000) });
    if (initial.status !== 402) throw new Error("Expected a research quote");
    const paymentRequired = await initial.json();
    const requirement = paymentRequired.quote;
    const quote = createAgentQuote({ service, plannedCall, id: requirement?.id });
    const policyCheck = this.guard.checkBeforeAgentCharge({ policy, ledger, agentQuote: quote, service, plannedCall });
    const offer = {
      provider: service, resource: resourcePath, amount: String(quote.quotedAtomic), payTo: SIMULATION_RECIPIENT,
      expiresAt: requirement?.expiresAt
    };
    const now = Date.now();
    const authorization = requirement && paymentRequired.mode === "simulation" &&
      typeof requirement.id === "string" && requirement.expiresAt <= now + 60_000 &&
      checkResearchQuote({
        quote: requirement, offer, now,
        policy: {
          providers: policy.allowedPaidAgents,
          perPurchase: policy.maxPaidAgentCallAtomic,
          remaining: policyCheck.remainingAtomic
        }
      });
    if (!policyCheck.allowed || !authorization?.allowed) {
      return {
        status: "blocked", service, paidAgent: paidAgentName(service),
        quote, requirement, paymentRequired,
        policyCheck: { ...policyCheck, allowed: false, reasons: [...policyCheck.reasons, ...(authorization?.allowed ? [] : [authorization?.reason ?? "invalid_quote"])] },
        result: null, payment: null
      };
    }

    const pending = { service, requestId: quote.quoteId, amountAtomic: String(quote.quotedAtomic) };
    ledger.pending.push(pending);
    let paidResult;
    try {
      const paidResponse = await this.fetch(endpoint, {
        headers: { [SIMULATION_HEADER]: requirement.id },
        redirect: "error",
        signal: AbortSignal.timeout(10000)
      });
      if (!paidResponse.ok) throw new Error("Simulated service call failed: " + paidResponse.status);
      paidResult = await paidResponse.json();
      const payment = paidResult.payment;
      if (payment?.mode !== "simulation" || payment.network !== BASE_SEPOLIA.network ||
          payment.asset !== USDC.address || payment.amount !== requirement.amount ||
          payment.transactionId !== "simulation-" + requirement.id) {
        throw new Error("Invalid simulation receipt");
      }
    } finally {
      ledger.pending.splice(ledger.pending.indexOf(pending), 1);
    }

    const paymentPayload = { mode: "simulation", payer: "local-session", facilitatorUrl: "local simulator" };
    const charge = recordAgentCharge({
      ledger,
      quoteId: quote.quoteId,
      service,
      agent: quote.agent,
      reasoningTier: quote.reasoningTier,
      amountAtomic: quote.quotedAtomic,
      usage: quote.usage,
      pricingModel: quote.pricingModel,
      transactionId: paidResult.payment.transactionId
    });

    const extracted = extractResult(paidResult);

    return {
      status: "settled",
      service,
      paidAgent: paidAgentName(service),
      quote,
      requirement,
      paymentRequired,
      policyCheck,
      paymentPayload,
      payment: paidResult.payment,
      charge,
      ...extracted,
      result: extracted.result,
      priceUsdc: atomicToUsdc(requirement.amount)
    };
  }
}

function createAgentQuote({ service, plannedCall, id }) {
  const usageQuote = quotePaidAgentCall({
    service,
    reasoningTier: plannedCall.reasoningTier,
    usage: plannedCall.usage
  });

  return {
    quoteId: id,
    service,
    agent: plannedCall.agent ?? paidAgentName(service),
    reasoningTier: plannedCall.reasoningTier,
    quotedAtomic: usageQuote.quotedAtomic,
    usage: usageQuote.usage,
    pricingModel: usageQuote.pricingModel,
    network: usageQuote.network,
    asset: usageQuote.asset,
    reason: plannedCall.reason
  };
}

function paidAgentName(service) {
  if (service === "market-signal") return "Market Agent";
  if (service === "risk-challenge") return "Risk Agent";
  return service;
}

function appendUsageParams(params, usage, keys) {
  for (const key of keys) {
    if (usage?.[key] !== undefined) {
      params.set(key, String(usage[key]));
    }
  }
}
