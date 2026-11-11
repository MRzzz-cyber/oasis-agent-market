const SYSTEM_PROMPT = [
  "你是 Oasis 的中文 AI 投资策略顾问，帮助用户通过多轮对话完善可执行的模拟投资策略。",
  "回答简洁自然，每次最多问 1 到 2 个最重要的澄清问题。优先询问交易标的、投入本金、周期、单次上限和风控条件。",
  "明确区分投资本金与 Agent 获取数据/调用模型的服务预算。",
  "当信息足够时，总结目标、标的、交易节奏、预算、入场/暂停规则并请用户确认。",
  "不编造实时市场数据、收益率、钱包付款或订单成交；你没有实时行情或交易工具。",
  "不要索要私钥、API Key；不允许承诺收益，不进行真实交易。"
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
    if (!content || content.length > 2000) throw new Error("单条消息需在 1–2000 字以内");
    return { role: item.role, content };
  });
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
      isFree: Number(item.pricing?.prompt) === 0 && Number(item.pricing?.completion) === 0,
      created: Number.isFinite(item.created) ? item.created : 0,
      provider: item.id.split("/")[0]
    }))
    .sort((a, b) => b.created - a.created || a.name.localeCompare(b.name))
    .slice(0, 2000);
}

function pricePerMillion(value) {
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
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (request.method === "GET" && url.pathname === "/api/ai/status") {
      return respond({
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
    if (!(await secureEqual(request.headers.get("x-oasis-access-code") || "", env.OASIS_DEMO_ACCESS_CODE))) return respond({ error: "体验码不正确" }, 401);
    if (Number(request.headers.get("content-length") || 0) > 25000) return respond({ error: "请求内容过大" }, 413);

    let payload;
    try { payload = validateChatInput(await request.json()); }
    catch (error) { return respond({ error: error.message || "无效请求" }, 400); }

    return streamOpenRouterChat({ ...payload, env });
  }
};
