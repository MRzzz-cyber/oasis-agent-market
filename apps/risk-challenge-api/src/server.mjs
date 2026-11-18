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
