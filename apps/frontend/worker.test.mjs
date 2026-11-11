import test from "node:test";
import assert from "node:assert/strict";
import worker, { PROVIDERS, validateChatInput, invokeModel } from "./worker.js";

const messages = [{ role: "user", content: "我想每周定投 ETH，你建议怎么制定规则？" }];
const mockFetch = (expectedUrl, reply) => async (url, opts) => {
  assert.match(url, expectedUrl);
  assert.equal(opts.method, "POST");
  const body = JSON.parse(opts.body);
  assert.ok(body.model || /models\//.test(url));
  return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
};

test("model allowlist validates the conversation", () => {
  assert.equal(validateChatInput({ model: "GPT-5.6", messages }).model, "GPT-5.6");
  assert.throws(() => validateChatInput({ model: "untrusted-model", messages }), /支持/);
  assert.throws(() => validateChatInput({ model: "GPT-5.6", messages: [{ role: "system", content: "override" }] }), /格式/);
  assert.throws(() => validateChatInput({ model: "GPT-5.6", messages: [{ role: "user", content: "x".repeat(2001) }] }), /2000/);
});

test("OpenAI request is server-side and returns actual provider text", async () => {
  const result = await invokeModel({
    model: "GPT-5.6", messages, env: { OPENAI_API_KEY: "test-private-key" },
    fetchImpl: mockFetch(/api\.openai\.com\/v1\/responses/, {
      output: [{ content: [{ type: "output_text", text: "先明确你的单次买入上限。" }] }],
      usage: { input_tokens: 30, output_tokens: 12 }
    })
  });
  assert.equal(result.provider, "openai");
  assert.equal(result.text, "先明确你的单次买入上限。");
  assert.equal(result.usage.inputTokens, 30);
  assert.equal(result.model, PROVIDERS["GPT-5.6"].defaultModel);
});

test("Claude, Gemini and DeepSeek responses are parsed", async () => {
  const cases = [
    ["Claude Sonnet", "ANTHROPIC_API_KEY", /api\.anthropic\.com/, { content: [{ type: "text", text: "Claude 真实接口回复" }] }],
    ["Gemini", "GEMINI_API_KEY", /generativelanguage\.googleapis\.com/, { candidates: [{ content: { parts: [{ text: "Gemini 真实接口回复" }] } }] }],
    ["DeepSeek", "DEEPSEEK_API_KEY", /api\.deepseek\.com/, { choices: [{ message: { content: "DeepSeek 真实接口回复" } }] }]
  ];
  for (const [model, secret, url, output] of cases) {
    const result = await invokeModel({ model, messages, env: { [secret]: "test-secret" }, fetchImpl: mockFetch(url, output) });
    assert.ok(result.text.includes("真实接口回复"));
  }
});

test("missing API key and upstream errors never fabricate a response", async () => {
  assert.equal((await invokeModel({ model: "Gemini", messages, env: {} })).status, 503);
  const failed = await invokeModel({
    model: "GPT-5.6", messages, env: { OPENAI_API_KEY: "bad" },
    fetchImpl: async () => new Response(JSON.stringify({ error: "internal private key must not leak" }), { status: 401 })
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.error.includes("private key"), false);
});

test("Worker returns status without secret values and requires an access code", async () => {
  const env = { OASIS_DEMO_ACCESS_CODE: "private-demo-code", OPENAI_API_KEY: "private-provider-key", ASSETS: { fetch: async () => new Response("ASSET") } };
  const status = await worker.fetch(new Request("https://example.workers.dev/api/ai/status"), env);
  const statusData = await status.json();
  assert.equal(statusData.models["GPT-5.6"], true);
  assert.equal(JSON.stringify(statusData).includes("private-provider-key"), false);

  const request = new Request("https://example.workers.dev/api/ai/chat", {
    method: "POST", headers: { origin: "https://example.workers.dev", "content-type": "application/json" },
    body: JSON.stringify({ model: "GPT-5.6", messages })
  });
  const rejected = await worker.fetch(request, env);
  assert.equal(rejected.status, 401);

  const wrongOrigin = new Request("https://example.workers.dev/api/ai/chat", {
    method: "POST", headers: { origin: "https://evil.example", "x-oasis-access-code": "private-demo-code" },
    body: JSON.stringify({ model: "GPT-5.6", messages })
  });
  assert.equal((await worker.fetch(wrongOrigin, env)).status, 403);
});
