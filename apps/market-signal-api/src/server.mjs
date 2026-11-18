import http from "node:http";
import { makeSimulationCheckout } from "../../../packages/evm/src/simulation.mjs";
import { quotePaidAgentCall, usageFromSearchParams } from "../../../packages/shared/src/pricing.mjs";
import { createDefaultMarketDataProvider } from "../../agent/src/strategy/MarketContextBuilder.mjs";

const SERVICE_NAME = "market-signal";

export async function createMarketSignalServer({
  port = 4021,
  host = "127.0.0.1",
  signalProvider = createDefaultMarketDataProvider()
} = {}) {
  const checkout = makeSimulationCheckout(SERVICE_NAME);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: SERVICE_NAME });
        return;
      }

      if (request.method !== "GET" || url.pathname !== "/signal") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const asset = url.searchParams.get("asset") ?? "ETH";
      const timeframe = url.searchParams.get("timeframe") ?? "4h";
      const strategyType = url.searchParams.get("strategy") ?? "breakout";
      const locale = url.searchParams.get("locale") ?? "en-US";
      const reasoningTier = normalizeTier(url.searchParams.get("tier"));
      const usage = usageFromSearchParams({ service: SERVICE_NAME, reasoningTier, searchParams: url.searchParams });
      const quote = quotePaidAgentCall({ service: SERVICE_NAME, reasoningTier, usage });
      const priceAtomic = quote.quotedAtomic;
      const checkoutResult = checkout.request({ request, resource: url.pathname + url.search, amount: priceAtomic });
      if (!checkoutResult.payment) {
        sendJson(response, checkoutResult.status, checkoutResult.body);
        return;
      }
      const settlement = checkoutResult.payment;

      const signal = await signalProvider.getSignal({ asset, timeframe, strategyType });

      sendJson(response, 200, {
        service: SERVICE_NAME,
        asset,
        timeframe,
        reasoningTier,
        priceAtomic,
        usage,
        pricingModel: quote.pricingModel,
        payment: settlement,
        signal: localizeSignal(signal, { locale, asset, timeframe, strategyType })
      });
    } catch (error) {
      const status = error.statusCode ?? 500;
      sendJson(response, status, {
        error: status === 402 ? "payment_failed" : "internal_error",
        message: error.message
      });
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return {
    server,
    baseUrl: `http://${host}:${server.address().port}`
  };
}

function localizeSignal(signal, { locale, asset, timeframe, strategyType }) {
  if (locale !== "zh-CN") return signal;
  return {
    ...signal,
    summary: signal.summary?.includes("Static smoke-test")
      ? "Base Sepolia 结算完成后返回的静态冒烟测试市场信号。"
      : `${asset} ${timeframe} ${translateStrategyType(strategyType)}市场信号已返回，置信度 ${signal.confidence ?? "待评估"}。`
  };
}

function translateStrategyType(value) {
  if (value === "mean_reversion") return "均值回归";
  if (value === "momentum") return "趋势动量";
  if (value === "range") return "区间";
  return "突破";
}

export async function closeMarketSignalServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

function normalizeTier(value) {
  return ["basic", "standard", "deep"].includes(value) ? value : "standard";
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4021);
  const { baseUrl } = await createMarketSignalServer({ port });
  console.log(`Market Signal API listening on ${baseUrl}`);
}
