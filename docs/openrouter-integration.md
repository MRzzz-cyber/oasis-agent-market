# OpenRouter model integration

## Runtime
- Cloudflare Worker exposes `GET /api/ai/models` and `POST /api/ai/chat`.
- The model catalog is fetched from OpenRouter and cached in the Worker isolate for five minutes.
- Browser selection stores the OpenRouter model ID, not a hard-coded display label.
- Chat requests are streamed as Server-Sent Events from OpenRouter to the browser.
- `OPENROUTER_API_KEY` and `OASIS_DEMO_ACCESS_CODE` are Cloudflare Worker Secrets; neither is sent to the browser.

## Cloudflare secrets
- `OPENROUTER_API_KEY`: required for paid/free model inference.
- `OASIS_DEMO_ACCESS_CODE`: required to protect chat inference from public abuse.

## Verification
- Open the Oasis homepage and confirm the model list loads from OpenRouter.
- Search for a provider/model and select its live model ID.
- Enter the private demo access code in the conversation page and send a message.
- Confirm tokens stream into the assistant message and usage is shown when OpenRouter includes it.
- Confirm invalid access code, missing API key, and provider errors fail closed.

The strategy committee and simulated trading workflow are still demo-only; this milestone only makes the primary strategy-advisor model selection and chat inference real.

## 策略确认与历史记录

- 草案根据用户输入提取最近明确表达的条件，并提供可编辑的确认表；它不是模型自动执行授权。
- 保存前必须确认 BTC/ETH/SOL 标的、单次正金额和 USDT/USDC 币种。单次上限不能高于已填写的投资预算。
- 服务采购预算独立以 USDC 记录；投资金额不会被转换为服务预算，也不在 USDT 与 USDC 之间静默转换。
- 模拟订单使用已确认的单次上限，预置行情与演示观点仍不能验证实时回撤、入场条件或累计预算；没有定时自动运行。
- 策略会保留对话记录；“我的策略”允许选择并重新打开各次运行、订单和复盘。记录只保存在当前浏览器，清除网站数据后不可恢复。
- 旧版策略缺少确认参数时需要点击“补全旧策略”，重新确认并保存后运行；旧运行记录仍可查看。
- 流式回复中断后，未完成的模型文本不进入下一次请求历史；可重试原问题或补充新要求。
