import http from "node:http";
import { makeSimulationCheckout } from "../../../packages/evm/src/simulation.mjs";
import { quotePaidAgentCall, usageFromSearchParams } from "../../../packages/shared/src/pricing.mjs";

const SERVICE_NAME = "risk-challenge";

export async function createRiskChallengeServer({ port = 4022, host = "127.0.0.1" } = {}) {
  const checkout = makeSimulationCheckout(SERVICE_NAME);

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true, service: SERVICE_NAME });
        return;
      }

      if (request.method !== "GET" || url.pathname !== "/challenge") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      const asset = url.searchParams.get("asset") ?? "ETH";
      const setup = url.searchParams.get("setup") ?? "BREAKOUT";
      const confidence = Number(url.searchParams.get("confidence") ?? 0.5);
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

      sendJson(response, 200, {
        service: SERVICE_NAME,
        asset,
        reasoningTier,
        priceAtomic,
        usage,
        pricingModel: quote.pricingModel,
        payment: settlement,
        challenge: buildRiskChallenge({ asset, setup, confidence, locale })
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

export async function closeRiskChallengeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

function normalizeTier(value) {
  return ["standard", "deep"].includes(value) ? value : "standard";
}

function buildRiskChallenge({ asset, setup, confidence, locale }) {
  const isZh = locale === "zh-CN";
  const blockingReasons = [];

  if (setup === "BREAKOUT") {
    blockingReasons.push(isZh ? "突破在模拟执行前需要更强的成交量确认" : "breakout needs stronger volume confirmation before simulated execution");
  }

  if (confidence < 0.65) {
    blockingReasons.push(isZh ? "初始置信度低于委员会执行阈值" : "initial confidence is below the committee execution threshold");
  }

  return {
    verdict: blockingReasons.length > 0 ? "block" : "pass",
    riskLevel: blockingReasons.length > 0 ? "high" : "medium",
    blockingReasons,
    stressScenarios: isZh
      ? [
          `${asset} 突破失败并回到前一区间`,
          "信号出现后流动性变薄，滑点上升",
          "相关主流资产转弱，动量确认失效"
        ]
      : [
          `${asset} rejects the breakout level and returns to the prior range`,
          "liquidity thins after the signal and slippage rises",
          "correlated majors weaken and invalidate momentum confirmation"
        ],
    counterArgument: blockingReasons.length > 0
      ? isZh ? `${asset} ${setup} 证据还不够稳健，不应增加敞口。` : `${asset} ${setup} evidence is not robust enough to increase exposure.`
      : isZh ? `${asset} ${setup} 只能在严格失效条件下进行模拟。` : `${asset} ${setup} can proceed only as a simulation with tight invalidation.`
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4022);
  const { baseUrl } = await createRiskChallengeServer({ port });
  console.log(`Risk Challenge API listening on ${baseUrl}`);
}
