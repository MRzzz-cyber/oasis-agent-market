import test from "node:test";
import assert from "node:assert/strict";
import { invokeModel, validateChatInput, OPENROUTER_MODELS } from "./worker.js";

const messages = [{ role: "user", content: "帮我逐步完善 ETH 定投策略" }];

test("free model accepts validated input and routes via OpenRouter", async () => {
  assert.equal(validateChatInput({ model: "免费模型", messages }).model, "免费模型");
  let calls = 0;
  const result = await invokeModel({
    model: "免费模型", messages, env: { OPENROUTER_API_KEY: "secret-test-key" },
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
      assert.equal(options.headers.authorization, "Bearer secret-test-key");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "openrouter/free");
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.messages[1].role, "user");
      return new Response(JSON.stringify({
        model: "nvidia/example-free-model",
        choices: [{ message: { content: "你每周计划投入多少？" } }],
        usage: { prompt_tokens: 42, completion_tokens: 14 }
      }), { status: 200 });
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.text, "你每周计划投入多少？");
  assert.equal(result.provider, "openrouter");
  assert.equal(result.usage.outputTokens, 14);
});

test("one OpenRouter key routes paid model labels by controlled model slugs", async () => {
  for (const [label, config] of Object.entries(OPENROUTER_MODELS)) {
    const result = await invokeModel({
      model: label, messages,
      env: { OPENROUTER_API_KEY: "secret", [config.env]: "test/assigned-model" },
      fetchImpl: async (_url, options) => {
        assert.equal(JSON.parse(options.body).model, "test/assigned-model");
        return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 });
      }
    });
    assert.equal(result.text, "OK", label);
  }
});

test("missing key and quota failures have clear errors and do not fabricate replies", async () => {
  const missing = await invokeModel({ model: "免费模型", messages, env: {} });
  assert.equal(missing.status, 503);
  const limit = await invokeModel({
    model: "免费模型", messages, env: { OPENROUTER_API_KEY: "key" },
    fetchImpl: async () => new Response('{"error":"private internal data"}', { status: 429 })
  });
  assert.equal(limit.status, 429);
  assert.equal(limit.error.includes("private internal"), false);
  const balance = await invokeModel({
    model: "GPT-5.6", messages, env: { OPENROUTER_API_KEY: "key" },
    fetchImpl: async () => new Response("{}", { status: 402 })
  });
  assert.match(balance.error, /余额不足/);
});
