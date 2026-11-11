import { BASE_SEPOLIA, USDC } from "../../evm/src/config.mjs";

const ATOMIC = /^(0|[1-9][0-9]*)$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function atomic(value, field) {
  if (typeof value !== "string" || !ATOMIC.test(value)) {
    throw new TypeError(field + " must be a canonical unsigned integer string");
  }
  return BigInt(value);
}

function normalizeAddress(value, field) {
  if (typeof value !== "string" || !ADDRESS.test(value)) {
    throw new TypeError(field + " must be a valid EVM address");
  }
  return value.toLowerCase();
}

function requireId(value, field) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(value)) {
    throw new TypeError(field + " must be a nonempty safe identifier");
  }
  return value;
}

/**
 * Construct an authorization boundary exclusively from trusted user/server input.
 * Never use LLM-generated configuration for this function.
 */
export function createUsdcPolicy({
  taskId,
  budgetAtomic,
  maxPaymentAtomic,
  allowedProviders,
  allowedServices,
  allowedRecipients,
  enabled = false
}) {
  requireId(taskId, "taskId");
  const budget = atomic(budgetAtomic, "budgetAtomic");
  const maxPayment = atomic(maxPaymentAtomic, "maxPaymentAtomic");
  if (budget <= 0n || maxPayment <= 0n || maxPayment > budget) {
    throw new RangeError("Budget and payment limit must be positive; payment limit cannot exceed budget");
  }
  for (const [field, values] of Object.entries({ allowedProviders, allowedServices, allowedRecipients })) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new TypeError(field + " must be a nonempty allowlist");
    }
  }
  const recipients = allowedRecipients.map(v => normalizeAddress(v, "allowedRecipient"));
  return Object.freeze({
    taskId,
    budgetAtomic: budget.toString(),
    maxPaymentAtomic: maxPayment.toString(),
    network: BASE_SEPOLIA.network,
    asset: USDC.address,
    allowedProviders: Object.freeze([...new Set(allowedProviders.map(v => requireId(v, "provider")))]),
    allowedServices: Object.freeze([...new Set(allowedServices.map(v => requireId(v, "service")))]),
    allowedRecipients: Object.freeze([...new Set(recipients)]),
    enabled: enabled === true
  });
}

function fingerprint(quote) {
  return [
    quote.taskId, quote.quoteId, quote.providerId, quote.serviceId,
    quote.network, String(quote.asset).toLowerCase(),
    String(quote.payTo).toLowerCase(), quote.amountAtomic, quote.expiresAt
  ].join("|");
}

/**
 * In-memory, single-process budget ledger.
 * Reserve synchronously, before any async signing/payment step.
 * Not suitable for multi-process or restart-safe real payments without durable storage.
 */
export class UsdcBudgetLedger {
  #policy;
  #records = new Map();

  constructor(policy) {
    if (!policy || !Object.isFrozen(policy)) throw new TypeError("An immutable policy is required");
    this.#policy = policy;
  }

  get policy() {
    return this.#policy;
  }

  getSnapshot() {
    let reserved = 0n, settled = 0n;
    const records = [];
    for (const r of this.#records.values()) {
      if (r.status === "reserved" || r.status === "reconciliation_required") reserved += BigInt(r.amountAtomic);
      if (r.status === "settled") settled += BigInt(r.amountAtomic);
      records.push({ ...r });
    }
    return {
      taskId: this.#policy.taskId,
      currency: "USDC",
      budgetAtomic: this.#policy.budgetAtomic,
      reservedAtomic: reserved.toString(),
      spentAtomic: settled.toString(),
      availableAtomic: (BigInt(this.#policy.budgetAtomic) - reserved - settled).toString(),
      records
    };
  }

  evaluate(quote, now = Date.now()) {
    const p = this.#policy, reasons = [];
    if (!quote || typeof quote !== "object") return { allowed: false, reasons: ["Quote is required"] };
    if (!p.enabled) reasons.push("Payment permission is disabled");
    if (quote.taskId !== p.taskId) reasons.push("Task not authorized");
    if (quote.network !== p.network) reasons.push("Network not authorized");
    if (typeof quote.asset !== "string" || quote.asset.toLowerCase() !== p.asset.toLowerCase()) reasons.push("Token not authorized");
    if (typeof quote.payTo !== "string" || !p.allowedRecipients.includes(quote.payTo.toLowerCase())) reasons.push("Recipient not authorized");
    if (!p.allowedProviders.includes(quote.providerId)) reasons.push("Provider not authorized");
    if (!p.allowedServices.includes(quote.serviceId)) reasons.push("Service not authorized");
    if (typeof quote.expiresAt !== "number" || !Number.isFinite(quote.expiresAt) || quote.expiresAt <= now) reasons.push("Quote expired or invalid");
    try { requireId(quote.quoteId, "quoteId"); } catch { reasons.push("Invalid quote ID"); }
    let amount = 0n;
    try {
      amount = atomic(quote.amountAtomic, "amountAtomic");
      if (amount <= 0n) reasons.push("Amount must be positive");
      if (amount > BigInt(p.maxPaymentAtomic)) reasons.push("Per-payment limit exceeded");
      if (amount > BigInt(this.getSnapshot().availableAtomic)) reasons.push("Task budget exceeded");
    } catch {
      reasons.push("Invalid atomic amount");
    }
    const existing = this.#records.get(quote.quoteId);
    if (existing) reasons.push(existing.fingerprint === fingerprint(quote) ? "Quote already processed" : "Quote ID conflict");
    return { allowed: reasons.length === 0, reasons };
  }

  reserve(quote, now = Date.now()) {
    const decision = this.evaluate(quote, now);
    if (!decision.allowed) return { ...decision, record: null };
    const record = {
      quoteId: quote.quoteId,
      taskId: quote.taskId,
      providerId: quote.providerId,
      serviceId: quote.serviceId,
      amountAtomic: quote.amountAtomic,
      fingerprint: fingerprint(quote),
      status: "reserved",
      reservedAt: new Date(now).toISOString(),
      transactionHash: null
    };
    this.#records.set(record.quoteId, record);
    return { allowed: true, reasons: [], record: { ...record } };
  }

  settle(quoteId, transactionHash) {
    const record = this.#records.get(quoteId);
    if (!record) throw new Error("Unknown quote");
    if (record.status === "settled") {
      if (record.transactionHash !== transactionHash) throw new Error("Settlement hash conflict");
      return { ...record };
    }
    if (!["reserved", "reconciliation_required"].includes(record.status)) throw new Error("Invalid settlement state");
    if (typeof transactionHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      throw new TypeError("Verified EVM transaction hash required");
    }
    record.status = "settled";
    record.transactionHash = transactionHash;
    record.settledAt = new Date().toISOString();
    return { ...record };
  }

  fail(quoteId, { submitted = false } = {}) {
    const record = this.#records.get(quoteId);
    if (!record) throw new Error("Unknown quote");
    if (record.status === "settled") throw new Error("Cannot fail a settled payment");
    if (record.status === "failed") return { ...record };
    if (record.status === "reconciliation_required" && !submitted) {
      throw new Error("Cannot release budget while settlement is uncertain");
    }
    record.status = submitted ? "reconciliation_required" : "failed";
    record.updatedAt = new Date().toISOString();
    return { ...record };
  }
}
