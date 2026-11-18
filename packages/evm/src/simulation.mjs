import { BASE_SEPOLIA, USDC } from "./config.mjs";
import { randomUUID } from "node:crypto";

export const SIMULATION_RECIPIENT = "0x0000000000000000000000000000000000000001";
export const SIMULATION_HEADER = "x-oasis-simulation";
const lifetime = 60_000;
const quoteLimit = 512;

export function makeSimulationCheckout(service, clock = Date.now) {
  const quotes = new Map();

  return {
    request({ request, resource, amount }) {
      const now = clock();
      for (const [id, quote] of quotes) {
        if (quote.expiresAt <= now) quotes.delete(id);
      }
      const id = request.headers[SIMULATION_HEADER];
      if (id === undefined) {
        if (quotes.size >= quoteLimit) return { status: 429, body: { error: "too_many_quotes" } };
        const quote = {
          id: randomUUID(), provider: service, resource, amount: String(amount),
          payTo: SIMULATION_RECIPIENT, network: BASE_SEPOLIA.network,
          asset: USDC.address, scheme: "exact", expiresAt: now + lifetime
        };
        quotes.set(quote.id, quote);
        return { status: 402, body: { mode: "simulation", quote } };
      }
      const quote = quotes.get(id);
      if (!quote || quote.resource !== resource || quote.amount !== String(amount)) {
        return { status: 409, body: { error: "invalid_simulation_quote" } };
      }
      quotes.delete(id);
      return { payment: {
        mode: "simulation", network: BASE_SEPOLIA.network, asset: USDC.address,
        amount: quote.amount, transactionId: "simulation-" + quote.id,
        settledAt: new Date(now).toISOString()
      } };
    }
  };
}
