# Oasis · OpenRouter 统一模型网关

Oasis 现在支持优先使用一把 OpenRouter Key 调用所选模型。Cloudflare Worker 接收前端聊天消息，校验私人体验码，再调用 OpenRouter API。不会在浏览器中暴露供应商 Key。

## 现在你要做什么

1. 打开 OpenRouter → Keys，点击 New key，创建 `oasis-ai-demo` 独立密钥。建议设置低额度上限，例如 $5。不要复用 Hermes Key。
2. 第一次可以不充值：Oasis 默认选择 `免费模型`，后端调用模型 ID `openrouter/free`（有每日/每分钟请求限制）。
3. 打开 Cloudflare → Workers & Pages → **oasis-agent-market** → Settings → Variables and Secrets。
4. 添加两个 **Secret**：
   - `OPENROUTER_API_KEY`：新创建的 OpenRouter Key。
   - `OASIS_DEMO_ACCESS_CODE`：你自己创建的私人体验码（较长且随机，不要泄漏）。
5. 按 Cloudflare 提示保存并部署最新 `refactor/simple-base-mvp` 分支。
6. 访问 `https://oasis-agent-market.zqsanjingshou.workers.dev`，选择 **免费模型**，输入自然语言策略需求；进入聊天后输入私人体验码，点击 **连接并重试**。
7. 查看模型回复及 token 使用量。可以去 OpenRouter 的 Activity/Logs 检查真实请求。

## 模型映射与可选环境变量

| 前端显示 | 默认 OpenRouter ID | 可覆盖环境变量 |
|---|---|---|
| 免费模型 | `openrouter/free` | `OPENROUTER_FREE_MODEL` |
| GPT-5.6 | `openai/gpt-5.6-sol` | `OPENROUTER_GPT_MODEL` |
| Claude Sonnet | `anthropic/claude-sonnet-4.6` | `OPENROUTER_CLAUDE_MODEL` |
| Gemini | `google/gemini-2.5-flash` | `OPENROUTER_GEMINI_MODEL` |
| DeepSeek | `deepseek/deepseek-chat` | `OPENROUTER_DEEPSEEK_MODEL` |

模型 ID 和可用性可能变化；如返回 404，请先到 OpenRouter 模型目录确认实际 ID，再设置对应环境变量。付费模型通常需要充值。

## 安全和产品状态

- 网页不接触 API Key，Cloudflare Secret 只在服务端读取。
- 公开 Demo 仍需要私人体验码；它不是完整的用户认证或严格限速。下一阶段需接入真正的 rate limiting、每用户额度和费用告警，才能允许更多人使用。
- 单轮消息最多 2000 字，最多带 12 条消息历史，限制每次输出 token。
- 模型对话为真实 API（配置好 Key 后），**多模型委员会投票仍是演示结果**，不能当成多模型真实判断。
- 交易、数据服务采购及订单仍是模拟，不会发起链上付款。
- 旧四家直连适配暂时保留作为后备；优先使用 OpenRouter，一旦配置 `OPENROUTER_API_KEY` 即路由至 OpenRouter。

## 官方资源

- OpenRouter 模型列表：https://openrouter.ai/models
- OpenRouter 免费模型：https://openrouter.ai/collections/free-models
- OpenRouter API Keys：https://openrouter.ai/settings/keys
- OpenRouter 充值：https://openrouter.ai/settings/credits
- OpenRouter API 文档：https://openrouter.ai/docs/quickstart
