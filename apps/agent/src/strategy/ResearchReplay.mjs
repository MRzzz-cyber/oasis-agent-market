import { demoPolicy, makeResearchOffers, providers } from "./ResearchPlanner.mjs";
import { ToolPlanner } from "./ToolPlanner.mjs";

const start = "2025-01-01T00:00:00Z";
const end = "2025-07-01T00:00:00Z";
const bucketSeconds = 86400;

export async function fetchHistoricalCandles(fetchImpl = fetch) {
  const url = new URL("https://api.exchange.coinbase.com/products/ETH-USD/candles");
  url.search = new URLSearchParams({ start, end, granularity: String(bucketSeconds) });
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Historical candles unavailable: HTTP " + response.status);
  const rows = await response.json();
  return rows.map(([timestamp, , , , close]) => ({ timestamp, close }))
    .filter(({ timestamp }) => timestamp >= Date.parse(start) / 1000 && timestamp < Date.parse(end) / 1000);
}

export function replayResearch(candles) {
  const ordered = [...candles].sort((first, second) => first.timestamp - second.timestamp);
  if (ordered.some(({ timestamp, close }) => !Number.isFinite(timestamp) || !Number.isFinite(close) || close <= 0)) {
    throw new Error("Candles must have finite timestamps and positive closes");
  }

  const now = 0;
  const offers = makeResearchOffers(now);
  const decisionStake = "300000";
  const totals = {
    noBuy: { correct: 0, spend: 0n, purchases: 0 },
    buyAll: { correct: 0, spend: 0n, purchases: 0 },
    oasis: { correct: 0, spend: 0n, purchases: 0 }
  };
  let cases = 0;
  const warmup = Math.max(...providers.map(provider => provider.window));

  for (let index = warmup; index < ordered.length - 1; index++) {
    const candlesInWindow = ordered.slice(index - warmup, index + 2);
    if (candlesInWindow.some((candle, offset) => offset && candle.timestamp !== candlesInWindow[offset - 1].timestamp + bucketSeconds)) continue;
    const close = ordered[index].close;
    const previous = ordered[index - 1].close;
    const change = (close - previous) / previous;
    const baseline = Math.sign(change);
    const actual = Math.sign(ordered[index + 1].close - close);
    if (!actual) continue;

    const estimates = providers.map(provider => ({
      ...provider,
      prediction: Math.sign(close - ordered[index - provider.window].close)
    }));
    const certaintyBps = 5000 + Math.min(4500, Math.round(Math.abs(change) * 60000));
    const { selectedProvider } = ToolPlanner.planResearch({
      certaintyBps, decisionStake, quotes: offers, offers, policy: demoPolicy, now
    });
    const selected = estimates.find(provider => provider.id === selectedProvider);
    const ensemble = Math.sign(estimates.reduce((vote, provider) => vote + provider.prediction, 0));
    record(totals.noBuy, baseline, actual, []);
    record(totals.buyAll, ensemble || baseline, actual, estimates);
    record(totals.oasis, selected?.prediction || baseline, actual, selected ? [selected] : []);
    cases++;
  }

  if (!cases) throw new Error("No eligible historical windows");
  return {
    source: "Coinbase Exchange ETH-USD daily candles",
    window: { start, end },
    providers: "simulated momentum signals; quality assumptions are uncalibrated",
    cases,
    strategies: Object.fromEntries(Object.entries(totals).map(([name, result]) => [name, {
      correct: result.correct,
      accuracy: result.correct / cases,
      purchases: result.purchases,
      spendAtomic: String(result.spend),
      utilityAtomic: String(BigInt(result.correct) * BigInt(decisionStake) - result.spend)
    }]))
  };
}

function record(result, prediction, actual, purchases) {
  result.correct += Number(prediction === actual);
  result.purchases += purchases.length;
  result.spend += purchases.reduce((sum, provider) => sum + BigInt(provider.amount), 0n);
}
