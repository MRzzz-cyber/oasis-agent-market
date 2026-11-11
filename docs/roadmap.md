# Oasis MVP Roadmap

## MVP 要证明什么

Agent 能在用户预先设定的权限和预算内，自主发现并购买一项数据服务，完成分析并给出可解释的交易建议。任何真实交易仍由用户确认；MVP 只生成模拟订单。

## Phase 1 — Base Sepolia payment loop

- [x] Base Sepolia / USDC 基础常量和整数金额工具。
- [ ] x402 v2 client/server adapter。
- [ ] 独立 Agent 测试钱包 signer。
- [ ] Policy Engine：网络、资产、服务商、服务、单笔上限、任务预算。
- [ ] Budget reservation + idempotency。
- [ ] Market Signal API 的 x402 付费闭环。
- [ ] 记录支付摘要、结算状态、交易哈希和账本事件。
- [ ] 超预算、错误资产、错误网络、重放和并发测试。

验收：Agent 购买一次 0.10 USDC 的测试数据服务，服务返回数据，账本状态和交易哈希可查。

## Phase 2 — Agent decision quality

- [ ] 保留 StrategyAgent / Market Agent / Risk Agent。
- [ ] 三个模型独立并行分析同一份 MarketSnapshot。
- [ ] 结构化输出、证据 ID、置信度、反方观点和模型成本。
- [ ] 聚合器展示共识与分歧；高分歧默认 HOLD / NO_TRADE。
- [ ] Risk Engine 最终复核，不把模型多数票当作安全授权。

## Phase 3 — Product demo

- [ ] 显示策略与预算设置。
- [ ] 显示服务发现、报价和 Policy 决策。
- [ ] 显示 x402 支付和结算状态。
- [ ] 显示模型委员会意见和证据。
- [ ] 显示用户确认与模拟订单。
- [ ] 展示 Economic Ledger 和完整 Agent Activity。

## Explicitly out of scope

- Base Mainnet 和真实资金。
- Agent 自主真实下单。
- 多链钱包抽象。
- 微服务、Kubernetes、复杂消息队列。
- 开放式第三方服务市场。
- 过早引入 LangGraph、Next.js 或大型数据库。
