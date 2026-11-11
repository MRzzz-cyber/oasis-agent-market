# Oasis 真实模型对话接入（Cloudflare Workers）

> 目标：用户在 Oasis 里选择模型并真正与其多轮对话；API Key 留在 Cloudflare，不进入网页。模型调用是付费 API；当前仍然是模拟投资策略和模拟订单。

## 当前支持的模型

| 前端显示 | API 供应商 | Cloudflare Secret | 默认模型 ID（可覆盖） |
|---|---|---|---|
| GPT-5.6 | OpenAI | OPENAI_API_KEY | gpt-5.6-sol |
| Claude Sonnet | Anthropic | ANTHROPIC_API_KEY | claude-sonnet-4-6 |
| Gemini | Google | GEMINI_API_KEY | gemini-3.8-flash |
| DeepSeek | DeepSeek | DEEPSEEK_API_KEY | deepseek-flash |

模型 ID 是可更新的，若账户不具备某个模型的访问权限，请通过 Worker 环境变量 OPENAI_MODEL / ANTHROPIC_MODEL / GEMINI_MODEL / DEEPSEEK_MODEL 设置该账户实际可用的模型 ID。请对照各供应商最新文档确认模型可用性。

## 你的 Cloudflare 配置步骤

1. 进入 Cloudflare Dashboard → Workers & Pages → **oasis-agent-market**（当前 Worker）→ **Settings**。
2. 找到 **Variables and Secrets** → **Add variable**。
3. 类型选 **Secret**，新增 **OASIS_DEMO_ACCESS_CODE**，值为自己设置的随机且较长的体验码。不要把体验码提交到 GitHub 或发到公开聊天。
4. 再新增至少一家模型供应商的 Secret，例如 **OPENAI_API_KEY**，值填对应平台创建的 API Key。四家无需一次全部配置，可逐个接入。
5. 保存并按照 Dashboard 提示部署（Deploy）。
6. 进入 **Deployments**，确认最新 GitHub 重构分支部署成功。
7. 打开 Oasis 公网网址，选择已经配置 Key 的模型，输入投资目标。在创建策略的对话界面填入体验码，点击「连接并重试」或发送下一条消息。
8. 检查真实模型回复与 Token 统计。Worker API 的 `/api/ai/status` 可显示哪些供应商的 Key 已配置，但不会返回 Secret 值。

**重点**：ChatGPT Plus / Pro 会员并不等于 OpenAI API 额度。需要通过 OpenAI API 平台单独创建 API Key，并根据 API 使用量付费。

## 如何确认是真实调用

1. 设置某一家有效 API Key + 体验码。
2. 新版前端显示“真实 API 已接通：供应商名称”。
3. 与模型进行两轮对话，模型回复内容应随输入变化。
4. 回复下方出现 provider、model ID、输入/输出 token 数（如供应商提供）。
5. 若 Key 不存在，页面将明确显示“尚未配置 API Key”，**不会生成假的 AI 回复**。

## 安全注意事项

- 只能在 Cloudflare **Secret** 类型中存储 Key；不要填到浏览器、GitHub、Figma、普通变量或对话里。
- Worker 的 POST /api/ai/chat 要求同源 Origin + 私人体验码；即使访问者知道公开 Worker URL，没有体验码也不能调用付费模型。
- 每次请求最多带 12 条消息，每条最多 2000 字，模型输出有固定 token 上限，防止意外高额调用。
- 体验码不等于完整的用户认证和严格速率限制；**建议仅供小范围内测**，公开运营前应再加 Cloudflare Access、WAF Rate Limiting、账户级调用额度和费用告警。
- 客户端不会持久存储体验码；每次刷新需要重新输入。
- Worker 不执行交易、不调用真实钱包、不自动购买任何数据服务。
- 当前策略草案仍通过本地规则辅助生成；实时 AI 对话已接入，但真实策略结构化提取、三模型并行委员会和实时行情尚待下一阶段。

## 本地调试

在 `apps/frontend/.dev.vars` 添加本地专用 Secret（**不要提交文件**）：

```dotenv
OASIS_DEMO_ACCESS_CODE=your-long-random-test-code
OPENAI_API_KEY=your-test-api-key
```

运行：

```bash
cd apps/frontend
npx wrangler dev
```

浏览器打开 Wrangler 提供的地址。配置好以后模型 API 会按实际供应商计费。

## 官方文档

- Cloudflare Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Worker + Static Assets: https://developers.cloudflare.com/workers/static-assets/binding/
- OpenAI Responses API: https://developers.openai.com/api/reference/resources/responses/methods/create
- Anthropic Messages API: https://platform.claude.com/docs/en/api/messages/create
- Gemini API: https://ai.google.dev/gemini-api/docs
- DeepSeek API: https://api-docs.deepseek.com/
