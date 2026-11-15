import {privyRoute} from "./privy-auth.js";
import {overview} from "./market-overview.js";
import {testnetBook} from "./testnet-quotes.js";
import { snapshot, marketCatalog } from "./candles.js";
import { account, authRoute, googleMode } from "./auth.js";
export { AccountStore } from "./auth.js";
const SYSTEM_PROMPT = [
 "你是 Oasis 的中文 AI 交易助手，帮助用户看懂行情，并通过对话整理真实 ETH 现货买入计划。所有模型遵循同一引导流程：行情研究、选择金额、确认计划、检查钱包与资金、由用户在官网确认真实交易。",
 "用户只询问行情或概念时先直接回答，写明数据来源、市场类型与时间，区分事实与推测。结尾可提供相关下一步；用户明确只研究、取消交易或暂不买入时尊重其选择。",
 "用户想买 ETH 时减少追问：简述主要风险，提供 10 USDC 小额体验、50 USDC 或自定义金额。使用真实 USDC、主网现货的表述，不再默认测试资金或测试网。不要反复要求长期周期、数据服务预算或先保存策略。",
 "10 USDC 是用户选择的预算，不保证满足交易所最低名义金额、数量精度及费用。费用另计，不自动提高预算。用户改变金额、标的或取消计划时重新确认。",
 "主流程为 Hyperliquid 主网 ETH 现货 UETH/USDC，不是 ETH 永续合约。输入的主网永续价格只作分析参考，不能当作现货成交价。",
 "界面核对主网现货可用 USDC，资金不足时给出官网入金入口；钱包收款余额与 Hyperliquid 交易账户余额是两回事。没有工具数据时，不能声称用户余额为零、已充值、钱包未连接或资金足够。",
 "站内目前整理计划、读取余额和提供充值入口，最终真实订单由用户在 Hyperliquid 官网使用 Rabby、MetaMask、OKX 等外部钱包确认。金额不会自动带入官网。Oasis 账号钱包尚不能直接连接该官网，不引导用户向该账号钱包充值来完成此交易。",
 "用户选择金额、确认计划或打开官网都不等于交易授权或成交。不能宣称站内已执行主网订单，不能把旧测试签名、测试资金或测试记录转换为主网交易。旧测试流程仅保留在独立开发入口。",
 "回答简洁，每次最多追问一个必要信息。不要编造报价、模型投票、收益、授权、付款或订单回执，不索要私钥与 API Key，不承诺收益。"
].join("\n");

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let modelCache = null;
let modelCacheAt = 0;

function respond(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}

export function validateChatInput(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.messages)) throw new Error("请输入有效对话");
  if (typeof value.model !== "string" || !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i.test(value.model) || value.model.length > 180) {
    throw new Error("请选择有效的 OpenRouter 模型");
  }
  if (value.messages.length < 1 || value.messages.length > 12) throw new Error("一次最多发送 12 条历史消息");
  const messages = value.messages.map(item => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") throw new Error("对话格式无效");
    const content = item.content.trim();
    const limit = item.role === "assistant" ? 12000 : 2000;
    if (!content || content.length > limit) throw new Error("消息过长：用户最多 2000 字，模型回复最多 12000 字");
    return { role: item.role, content };
  });
  if (messages.reduce((sum, item) => sum + item.content.length, 0) > 20000) throw new Error("对话历史过长，请开始新对话");
  if (messages.at(-1).role !== "user") throw new Error("最后一条必须是用户消息");
  return { model: value.model, messages };
}

export function normalizeOpenRouterModels(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .filter(item => item && typeof item.id === "string" && typeof item.name === "string")
    .filter(item => {
      const inputs = item.architecture?.input_modalities;
      const outputs = item.architecture?.output_modalities;
      return (!Array.isArray(inputs) || inputs.includes("text")) &&
        (!Array.isArray(outputs) || outputs.includes("text"));
    })
    .map(item => ({
      id: item.id,
      name: item.name,
      description: typeof item.description === "string" ? item.description.slice(0, 240) : "",
      contextLength: Number.isFinite(item.context_length) ? item.context_length : null,
      inputPricePerMillion: pricePerMillion(item.pricing?.prompt),
      outputPricePerMillion: pricePerMillion(item.pricing?.completion),
      isFree: pricePerMillion(item.pricing?.prompt) === 0 && pricePerMillion(item.pricing?.completion) === 0,
      created: Number.isFinite(item.created) ? item.created : 0,
      provider: item.id.split("/")[0]
    }))
    .sort((a, b) => b.created - a.created || a.name.localeCompare(b.name))
    .slice(0, 2000);
}

function pricePerMillion(value) {
  if (value == null || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price * 1_000_000 : null;
}

export async function fetchOpenRouterModels({ fetchImpl = fetch, forceRefresh = false } = {}) {
  if (!forceRefresh && modelCache && Date.now() - modelCacheAt < MODEL_CACHE_TTL_MS) return modelCache;
  const response = await fetchImpl(OPENROUTER_MODELS_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("OpenRouter 模型目录暂时不可用（HTTP " + response.status + "）");
  const payload = await response.json();
  const models = normalizeOpenRouterModels(payload);
  if (!models.length) throw new Error("OpenRouter 暂未返回可用的文本模型");
  modelCache = models;
  modelCacheAt = Date.now();
  return models;
}

export async function streamOpenRouterChat({ model, messages, env, fetchImpl = fetch }) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) return respond({ error: "OpenRouter API Key 未配置，请在 Cloudflare Workers 的 Secrets 中添加 OPENROUTER_API_KEY" }, 503);

  let upstream;
  try {
    upstream = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        authorization: "Bearer " + key,
        "content-type": "application/json",
        "HTTP-Referer": "https://oasis-agent-market.zqsanjingshou.workers.dev",
        "X-Title": "Oasis AI"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 900,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: AbortSignal.timeout(90000)
    });
  } catch (error) {
    return respond({ error: error?.name === "TimeoutError" ? "OpenRouter 模型响应超时" : "OpenRouter 连接失败，请稍后重试" }, 502);
  }

  if (!upstream.ok) {
    let detail = "HTTP " + upstream.status;
    try {
      const payload = await upstream.json();
      detail = payload?.error?.message || detail;
    } catch {}
    const safeDetail = upstream.status === 401 ? "API Key 不正确或已失效" :
      upstream.status === 402 ? "OpenRouter 账户余额不足" :
      upstream.status === 404 ? "模型暂不可用，请重新选择模型" :
      upstream.status === 429 ? "请求频率或模型额度已达上限" :
      upstream.status >= 500 ? "模型供应商暂时不可用" : detail.slice(0, 180);
    return respond({ error: "OpenRouter 调用失败：" + safeDetail }, upstream.status === 429 ? 429 : 502);
  }

  if (!upstream.body) return respond({ error: "OpenRouter 未返回流式响应" }, 502);
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no"
    }
  });
}

async function secureEqual(a, b) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest("SHA-256", encoder.encode(v))));
  const left = new Uint8Array(x), right = new Uint8Array(y);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if(url.pathname === "/api/release" && request.method === "GET")return respond({version:"mainnet-guide-v14-20261116",defaultTestBudget:"20"});
    if(url.pathname === "/api/testnet/book" && request.method === "GET")return testnetBook(request);
    if(url.pathname === "/api/market/overview" && request.method === "GET")return overview();
    if (url.pathname === "/api/market/catalog" && request.method === "GET") return marketCatalog();
    if (url.pathname === "/api/market/candles" && request.method === "GET") return snapshot(request);
    if (url.pathname.startsWith("/api/wallet/") || url.pathname==="/.well-known/jwks.json")return privyRoute(request,env);
    if (url.pathname.startsWith("/api/auth/")) return authRoute(request, env);
    if (!url.pathname.startsWith("/api/")) {
      const asset=await env.ASSETS.fetch(request);
      const headers=new Headers(asset.headers);headers.set("cache-control","no-store");headers.set("x-oasis-release","mainnet-guide-v14-20261116");
      if(url.pathname.startsWith("/privy-setup")){headers.set("referrer-policy","no-referrer");headers.set("x-frame-options","DENY");headers.set("content-security-policy","default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");}
      return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    }

    if (request.method === "GET" && url.pathname === "/api/ai/status") {
      return respond({
        googleLogin: googleMode(env),
        enabled: Boolean(env.OASIS_DEMO_ACCESS_CODE),
        openRouterConfigured: Boolean(env.OPENROUTER_API_KEY),
        provider: "OpenRouter"
      });
    }

    if (request.method === "GET" && url.pathname === "/api/ai/models") {
      try {
        const models = await fetchOpenRouterModels();
        return respond({ provider: "OpenRouter", count: models.length, models }, 200, {
          "cache-control": "public, max-age=300"
        });
      } catch (error) {
        return respond({ error: error.message || "无法获取 OpenRouter 模型目录" }, 502);
      }
    }

    if (request.method !== "POST" || url.pathname !== "/api/ai/chat") return respond({ error: "接口不存在" }, 404);
    if (!env.OASIS_DEMO_ACCESS_CODE) return respond({ error: "模型 API 尚未开放：管理员需先配置 OASIS_DEMO_ACCESS_CODE" }, 503);
    const origin = request.headers.get("origin");
    if (!origin || origin !== url.origin) return respond({ error: "只允许从 Oasis 页面调用" }, 403);
    if (googleMode(env)) {
      if (!env.ACCOUNTS) return respond({error:"账号服务尚未配置"},503);
      const current = await account(request,env);
      if (!current.ok) return current;
      if (!(await current.json()).active) return respond({error:"请先激活账号"},403);
    } else if (!(await secureEqual(request.headers.get("x-oasis-access-code") || "", env.OASIS_DEMO_ACCESS_CODE))) return respond({ error: "体验码不正确" }, 401);
    if (Number(request.headers.get("content-length") || 0) > 25000) return respond({ error: "请求内容过大" }, 413);

    let payload;
    try { payload = validateChatInput(await request.json()); }
    catch (error) { return respond({ error: error.message || "无效请求" }, 400); }

    return streamOpenRouterChat({ ...payload, env });
  }
};
