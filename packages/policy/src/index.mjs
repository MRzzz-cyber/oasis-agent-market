import { BASE_SEPOLIA, USDC } from "../../evm/src/config.mjs";
import { SIMULATION_RECIPIENT } from "../../evm/src/simulation.mjs";

export const defaultUserPolicy = Object.freeze({
  id: "policy_demo_v1",
  targetAsset: "ETH",
  sessionBudgetAtomic: 200000,
  maxPaidAgentCallAtomic: 50000,
  allowedPaidAgents: ["market-signal", "risk-challenge"],
  paidAgentBudgetsAtomic: {
    "market-signal": 120000,
    "risk-challenge": 60000
  },
  autoPayEnabled: true,
  allowance: {
    ownerAccountId: "local-session",
    spenderAccountId: "simulation-policy",
    merchantAccountId: SIMULATION_RECIPIENT,
    allowanceAtomic: 200000,
    spentAtomic: 0
  },
  sessionEscrow: {
    status: "authorized",
    sessionId: "demo_session_policy_demo_v1",
    payerAccountId: "local-session",
    authorizedBudgetAtomic: 200000,
    availableBalanceAtomic: 200000,
    spentAtomic: 0,
    fundingReference: "local://session-budget",
    authorizedAt: null
  },
  dailyBudgetAtomic: 200000,
  maxPaymentPerCallAtomic: 50000,
  allowedServices: ["market-signal", "risk-challenge"],
  serviceBudgetsAtomic: {
    "market-signal": 120000,
    "risk-challenge": 60000
  },
  executionMode: "simulation",
  riskRules: ["paid_agent_calls_must_stay_within_user_policy"]
});

export function createBudgetLedger(policy) {
  const normalized = normalizeUserPolicy(policy);

  return {
    policyId: normalized.id,
    spentAtomic: 0,
    reservations: [],
    pending: [],
    charges: [],
    allowanceSpentAtomic: normalized.allowance.spentAtomic,
    escrowSpentAtomic: 0,
    escrowCharges: [],
    accounts: {
      ownerAccountId: normalized.allowance.ownerAccountId,
      spenderAccountId: normalized.allowance.spenderAccountId,
      merchantAccountId: normalized.allowance.merchantAccountId
    }
  };
}

export function checkAgentQuoteAllowed({ policy, ledger, agentQuote, service }) {
  const normalized = normalizeUserPolicy(policy);
  const requestedAtomic = Number(agentQuote.quotedAtomic ?? agentQuote.amount);
  const pending = ledger.pending ?? [];
  const remainingAtomic = normalized.sessionBudgetAtomic - Number(ledger.spentAtomic) -
    pending.reduce((sum, item) => sum + Number(item.amountAtomic), 0);
  const reasons = [];

  if (!Number.isSafeInteger(requestedAtomic) || requestedAtomic <= 0 || !Number.isSafeInteger(remainingAtomic)) {
    reasons.push("invalid USDC amount or budget");
  }

  if (!normalized.autoPayEnabled) {
    reasons.push("automatic paid agent billing is disabled by user policy");
  }

  if (!normalized.allowedPaidAgents.includes(service)) {
    reasons.push(`paid agent ${service} is not allowed`);
  }

  if (requestedAtomic > normalized.maxPaidAgentCallAtomic) {
    reasons.push(`quote ${requestedAtomic} USDC atomic units exceeds per-agent call limit ${normalized.maxPaidAgentCallAtomic}`);
  }

  if (requestedAtomic > remainingAtomic) {
    reasons.push(`quote ${requestedAtomic} USDC atomic units exceeds remaining budget ${remainingAtomic}`);
  }

  const paidAgentBudgetAtomic = normalized.paidAgentBudgetsAtomic?.[service];
  if (Number.isInteger(paidAgentBudgetAtomic)) {
    const serviceSpentAtomic = [...ledger.reservations, ...pending]
      .filter((reservation) => reservation.service === service)
      .reduce((sum, reservation) => sum + Number(reservation.amountAtomic), 0);
    const serviceRemainingAtomic = paidAgentBudgetAtomic - serviceSpentAtomic;

    if (requestedAtomic > serviceRemainingAtomic) {
      reasons.push(`quote ${requestedAtomic} USDC atomic units exceeds ${service} paid agent budget remaining ${serviceRemainingAtomic}`);
    }
  }

  if (agentQuote.network !== BASE_SEPOLIA.network) {
    reasons.push(`network ${agentQuote.network} is not allowed for this MVP`);
  }

  if (agentQuote.asset !== USDC.address) {
    reasons.push(`asset ${agentQuote.asset} is not allowed for this MVP`);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    service,
    agent: agentQuote.agent,
    reasoningTier: agentQuote.reasoningTier,
    quoteId: agentQuote.quoteId,
    requestedAtomic,
    remainingAtomic,
    budgetBoundary: {
      sessionBudgetAtomic: normalized.sessionBudgetAtomic,
      maxPaidAgentCallAtomic: normalized.maxPaidAgentCallAtomic,
      paidAgentBudgetAtomic: paidAgentBudgetAtomic ?? null,
      allowedPaidAgents: normalized.allowedPaidAgents
    }
  };
}

export function checkPaymentAllowed({ policy, ledger, paymentRequirement, service }) {
  const normalized = normalizeUserPolicy(policy);
  const quoteDecision = checkAgentQuoteAllowed({
    policy,
    ledger,
    service,
    agentQuote: {
      agent: service,
      service,
      quotedAtomic: Number(paymentRequirement.amount),
      network: paymentRequirement.network,
      asset: paymentRequirement.asset,
      quoteId: paymentRequirement.extra?.requestId
    }
  });
  const requestedAtomic = quoteDecision.requestedAtomic;
  const allowanceRemainingAtomic = normalized.allowance.allowanceAtomic
    - Number(normalized.allowance.spentAtomic ?? 0)
    - Number(ledger.allowanceSpentAtomic ?? 0);
  const escrowRemainingAtomic = Number(normalized.sessionEscrow.availableBalanceAtomic ?? 0)
    - Number(ledger.escrowSpentAtomic ?? 0);
  if (normalized.sessionEscrow.status !== "authorized") {
    quoteDecision.reasons.push("session budget escrow is not authorized");
  }

  if (requestedAtomic > escrowRemainingAtomic) {
    quoteDecision.reasons.push(`price ${requestedAtomic} USDC atomic units exceeds remaining session escrow balance ${escrowRemainingAtomic}`);
  }

  if (normalized.allowance.merchantAccountId && paymentRequirement.payTo !== normalized.allowance.merchantAccountId) {
    quoteDecision.reasons.push(`payTo ${paymentRequirement.payTo} does not match Oasis merchant account ${normalized.allowance.merchantAccountId}`);
  }

  return {
    ...quoteDecision,
    allowed: quoteDecision.reasons.length === 0,
    requestedAtomic,
    allowanceRemainingAtomic,
    escrowRemainingAtomic,
    sessionId: normalized.sessionEscrow.sessionId,
    accounts: {
      ownerAccountId: normalized.allowance.ownerAccountId,
      spenderAccountId: normalized.allowance.spenderAccountId,
      merchantAccountId: normalized.allowance.merchantAccountId
    }
  };
}

export function recordAgentCharge({ ledger, quoteId, service, agent, reasoningTier, amountAtomic, transactionId, usage, pricingModel }) {
  ledger.spentAtomic += amountAtomic;
  ledger.allowanceSpentAtomic = Number(ledger.allowanceSpentAtomic ?? 0) + amountAtomic;
  ledger.escrowSpentAtomic = Number(ledger.escrowSpentAtomic ?? 0) + amountAtomic;
  const charge = {
    quoteId,
    service,
    agent,
    reasoningTier,
    amountAtomic,
    usage,
    pricingModel,
    transactionId,
    chargedAt: new Date().toISOString()
  };
  ledger.charges.push(charge);
  ledger.escrowCharges.push(charge);
  ledger.reservations.push({
    requestId: quoteId,
    service,
    amountAtomic,
    transactionId
  });
  return charge;
}

export function normalizeUserPolicy(policy = defaultUserPolicy) {
  const sessionBudgetAtomic = policy.sessionBudgetAtomic ?? policy.dailyBudgetAtomic ?? defaultUserPolicy.sessionBudgetAtomic;
  const maxPaidAgentCallAtomic = policy.maxPaidAgentCallAtomic
    ?? policy.maxPaymentPerCallAtomic
    ?? defaultUserPolicy.maxPaidAgentCallAtomic;
  const allowedPaidAgents = policy.allowedPaidAgents ?? policy.allowedServices ?? defaultUserPolicy.allowedPaidAgents;
  const paidAgentBudgetsAtomic = policy.paidAgentBudgetsAtomic
    ?? policy.serviceBudgetsAtomic
    ?? defaultUserPolicy.paidAgentBudgetsAtomic;
  const allowance = {
    ...defaultUserPolicy.allowance,
    ...(policy.allowance ?? {})
  };
  const sessionEscrow = {
    ...defaultUserPolicy.sessionEscrow,
    ...(policy.sessionEscrow ?? {}),
    payerAccountId: policy.sessionEscrow?.payerAccountId
      ?? allowance.ownerAccountId
      ?? defaultUserPolicy.sessionEscrow.payerAccountId,
    authorizedBudgetAtomic: policy.sessionEscrow?.authorizedBudgetAtomic
      ?? sessionBudgetAtomic,
    availableBalanceAtomic: policy.sessionEscrow?.availableBalanceAtomic
      ?? policy.sessionEscrow?.authorizedBudgetAtomic
      ?? sessionBudgetAtomic
  };

  return {
    ...policy,
    sessionBudgetAtomic,
    maxPaidAgentCallAtomic,
    allowedPaidAgents,
    paidAgentBudgetsAtomic,
    autoPayEnabled: policy.autoPayEnabled ?? true,
    allowance,
    sessionEscrow,
    dailyBudgetAtomic: sessionBudgetAtomic,
    maxPaymentPerCallAtomic: maxPaidAgentCallAtomic,
    allowedServices: allowedPaidAgents,
    serviceBudgetsAtomic: paidAgentBudgetsAtomic
  };
}
