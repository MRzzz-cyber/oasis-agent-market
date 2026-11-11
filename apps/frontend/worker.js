const SYSTEM_PROMPT = [
  "你是 Oasis 的中文 AI 投资策略顾问，帮助用户通过多轮对话完善可执行的模拟投资策略。",
  "回答简洁自然，每次最多问 1 到 2 个最重要的澄清问题。优先询问交易标的、投入本金、周期、单次上限和风控条件。",
  "明确区分投资本金与 Agent 获取数据/调用模型的服务预算。",
  "当信息足够时，总结目标、标的、交易节奏、预算、入场/暂停规则并请用户确认。",
  "不编造实时市场数据、收益率、钱包付款或订单成交；你没有实时行情或交易工具。",
  "不要索要私钥、API Key；不允许承诺收益，不进行真实交易。"
].join("\n");

export const PROVIDERS = Object.freeze({
  "免费模型": { secret: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_FREE_MODEL", defaultModel: "openrouter/free", kind: "openrouter" },
  "GPT-5.6": { secret: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL", defaultModel: "gpt-5.6-sol", endpoint: "https://api.openai.com/v1/responses", kind: "openai" },
  "Claude Sonnet": { secret: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL", defaultModel: "claude-sonnet-4-6", endpoint: "https://api.anthropic.com/v1/messages", kind: "anthropic" },
  Gemini: { secret: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-3.8-flash", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", kind: "gemini" },
  DeepSeek: { secret: "DEEPSEEK_API_KEY", modelEnv: "DEEPSEEK_MODEL", defaultModel: "deepseek-flash", endpoint: "https://api.deepseek.com/chat/completions", kind: "deepseek" }
});

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

export function validateChatInput(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.messages)) throw new Error("请输入有效对话");
  if (!Object.hasOwn(PROVIDERS, value.model)) throw new Error("请从支持的模型中选择");
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

function extractOutput(data, kind) {
  if (kind === "openai") return (data.output || []).flatMap(item => (item.content || []).filter(c => c.type === "output_text").map(c => c.text)).join("\n");
  if (kind === "anthropic") return (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  if (kind === "gemini") return (data.candidates?.[0]?.content?.parts || []).filter(p => typeof p.text === "string").map(p => p.text).join("\n");
  return data.choices?.[0]?.message?.content || "";
}

export const OPENROUTER_MODELS = Object.freeze({
  "免费模型": { env: "OPENROUTER_FREE_MODEL", model: "openrouter/free" },
  "GPT-5.6": { env: "OPENROUTER_GPT_MODEL", model: "openai/gpt-5.6-sol" },
  "Claude Sonnet": { env: "OPENROUTER_CLAUDE_MODEL", model: "anthropic/claude-sonnet-4.6" },
  Gemini: { env: "OPENROUTER_GEMINI_MODEL", model: "google/gemini-2.5-flash" },
  DeepSeek: { env: "OPENROUTER_DEEPSEEK_MODEL", model: "deepseek/deepseek-chat" }
});

export async function invokeOpenRouter({ model, messages, env, fetchImpl = fetch }) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) return { error: "OpenRouter Key 未配置，请在 Cloudflare Secrets 中添加 OPENROUTER_API_KEY", status: 503 };
  const choice = OPENROUTER_MODELS[model];
  if (!choice) return { error: "不支持该模型", status: 400 };
  const modelId = env[choice.env] || choice.model;
  let response;
  try {
    response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "authorization": "Bearer " + key,
        "content-type": "application/json",
        "HTTP-Referer": "https://oasis-agent-market.zqsanjingshou.workers.dev",
        "X-Title": "Oasis AI"
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 650, stream: false
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    return { error: error?.name === "TimeoutError" ? "OpenRouter 模型响应超时" : "OpenRouter 连接失败，请检查网络", status: 502 };
  }
  if (!response.ok) {
    const detail = response.status === 401 ? "API Key 不正确或已失效" :
      response.status === 402 ? "账户余额不足，或所选付费模型需要先充值" :
      response.status === 404 ? "模型 ID 不可用，请在 Cloudflare 配置对应的 OPENROUTER_*_MODEL" :
      response.status === 429 ? "免费额度或请求频率已达上限" : "HTTP " + response.status;
    return { error: "OpenRouter 调用失败：" + detail, status: response.status === 429 ? 429 : 502 };
  }
  let data;
  try { data = await response.json(); } catch { return { error: "OpenRouter 返回无效 JSON", status: 502 }; }
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return { error: "模型没有返回可展示的文本", status: 502 };
  return {
    text: text.trim().slice(0, 6000),
    model: data.model || modelId,
    provider: "openrouter",
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null
    }
  };
}

export async function invokeModel({ model, messages, env, fetchImpl = fetch }) {
  if (env.OPENROUTER_API_KEY || model === "免费模型") return invokeOpenRouter({ model, messages, env, fetchImpl });
  const spec = PROVIDERS[model];
  const apiKey = env[spec.secret];
  if (!apiKey) return { error: model + " 尚未配置 API Key，请在 Cloudflare Secrets 配置 " + spec.secret, status: 503 };
  const modelId = env[spec.modelEnv] || spec.defaultModel;
  let url, body, headers = { "content-type": "application/json" };
  if (spec.kind === "openai") {
    url = spec.endpoint;
    headers.authorization = "Bearer " + apiKey;
    body = { model: modelId, instructions: SYSTEM_PROMPT, input: messages, max_output_tokens: 650 };
  } else if (spec.kind === "anthropic") {
    url = spec.endpoint;
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: modelId, system: SYSTEM_PROMPT, messages, max_tokens: 650 };
  } else if (spec.kind === "gemini") {
    url = spec.endpoint + "/" + encodeURIComponent(modelId) + ":generateContent";
    headers["x-goog-api-key"] = apiKey;
    body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 650 }
    };
  } else {
    url = spec.endpoint;
    headers.authorization = "Bearer " + apiKey;
    body = { model: modelId, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages], max_tokens: 650, stream: false };
  }
  let response;
  try {
    response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  } catch (e) {
    return { error: e?.name === "TimeoutError" ? "模型调用超时，请稍后重试" : "无法连接模型供应商，请检查网络和服务状态", status: 502 };
  }
  if (!response.ok) {
    // Never include the raw provider error body in a public response; it could contain internal details.
    return { error: response.status === 401 || response.status === 403 ? model + " API Key 无效或无权限" : response.status === 429 ? model + " 请求频率或配额受限" : model + " 调用失败（HTTP " + response.status + "）", status: response.status === 429 ? 429 : 502 };
  }
  let result;
  try { result = await response.json(); } catch { return { error: "模型返回了无效 JSON", status: 502 }; }
  const text = extractOutput(result, spec.kind);
  if (!text || !text.trim()) return { error: "模型未返回可展示的文本", status: 502 };
  return {
    text: text.trim().slice(0, 6000),
    model: modelId,
    provider: spec.kind,
    usage: {
      inputTokens: result.usage?.input_tokens ?? result.usage?.prompt_tokens ?? result.usageMetadata?.promptTokenCount ?? null,
      outputTokens: result.usage?.output_tokens ?? result.usage?.completion_tokens ?? result.usageMetadata?.candidatesTokenCount ?? null
    }
  };
}

async function secureEqual(a, b) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(v => crypto.subtle.digest("SHA-256", encoder.encode(v))));
  return new Uint8Array(x).every((n, i) => n === new Uint8Array(y)[i]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "GET" && url.pathname === "/api/ai/status") {
      return respond({ enabled: Boolean(env.OASIS_DEMO_ACCESS_CODE), models: Object.fromEntries(Object.entries(PROVIDERS).map(([name, spec]) => [name, Boolean(env.OPENROUTER_API_KEY || env[spec.secret])])) });
    }
    if (request.method !== "POST" || url.pathname !== "/api/ai/chat") return respond({ error: "接口不存在" }, 404);
    if (!env.OASIS_DEMO_ACCESS_CODE) return respond({ error: "模型 API 尚未开放：管理员需先配置 OASIS_DEMO_ACCESS_CODE" }, 503);
    const origin = request.headers.get("origin");
    if (!origin || origin !== url.origin) return respond({ error: "只允许从 Oasis 页面调用" }, 403);
    if (!(await secureEqual(request.headers.get("x-oasis-access-code") || "", env.OASIS_DEMO_ACCESS_CODE))) return respond({ error: "体验码不正确" }, 401);
    if (Number(request.headers.get("content-length") || 0) > 25000) return respond({ error: "请求内容过大" }, 413);
    let payload;
    try { payload = validateChatInput(await request.json()); }
    catch (e) { return respond({ error: e.message || "无效请求" }, 400); }
    const result = await invokeModel({ ...payload, env });
    if (result.error) return respond({ error: result.error }, result.status);
    return respond({ ok: true, ...result });
  }
};
