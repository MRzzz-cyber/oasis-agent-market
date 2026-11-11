# Oasis 技术选型（MVP）

> 当前目标架构。Base Sepolia 支付适配器尚未接入完整 x402 客户端/服务端；旧 Hedera Demo 暂时保留用于回归。

## 决策原则

只引入能够直接支持核心闭环的技术。先完成可运行产品，再根据真实瓶颈增加框架和基础设施。

## 最终技术栈

| 层 | 选择 | 不采用 |
|---|---|---|
| Runtime | Node.js 22 LTS、ESM | 多 Runtime |
| Package manager | pnpm | 多包管理器 |
| Backend | Node 原生 HTTP | 暂不引入 Express/Fastify |
| Frontend | 现有 Vanilla HTML/CSS/JS | 暂不迁移 React/Next |
| Agent | 现有 StrategyAgent 状态机 | LangGraph / 多套编排器 |
| LLM | 统一 Provider Adapter，按需启用 OpenAI/Claude/Gemini/DeepSeek | 复杂模型路由平台 |
| Payment | x402 v2 + @x402/core + @x402/evm + @x402/fetch | 手写 402 headers |
| EVM | viem | ethers 与 viem 并存 |
| Network | Base Sepolia（eip155:84532） | 多链并行 |
| Asset | Circle USDC（6 decimals） | 自定义测试 Token |
| Policy | 纯 JavaScript 确定性规则 | 让 LLM 决定授权 |
| Persistence | 第一阶段单实例内存/本地文件；需要恢复和多用户后再选 SQLite | 先部署数据库集群 |
| Tests | node:test | 额外测试框架 |

## 核心模块边界

- apps/agent：Agent 编排和业务流程。
- apps/demo-api：单一 HTTP API 和静态前端入口。
- apps/market-signal-api、apps/risk-challenge-api：本地付费服务 handler；不部署成微服务集群。
- apps/frontend：用户界面。
- packages/policy：唯一支付授权决策入口。
- packages/evm：Base 网络、USDC 单位和 EVM/x402 支付适配。
- packages/shared：通用 ID、时间、价格和共享结构。
- packages/hedera：旧黑客松实现；迁移完成后归档，不再作为新流程依赖。

## 支付安全规则

1. Agent 只能提交 PurchaseIntent，不持有 signer，也不读取私钥。
2. Policy Engine 校验任务总预算、单笔上限、服务商白名单、服务白名单、网络、Token、报价有效期和收款地址。
3. 预算以 USDC atomic units（BigInt/整数字符串）存储，禁止浮点金额。
4. Policy 通过后才预留预算；并发请求必须防止超支。
5. Wallet Signer 只接受短时、单次、绑定 quoteId 的授权。
6. 支付状态可追踪：quoted → reserved → submitted → settled / failed / reconciliation_required。
7. 重试必须幂等；facilitator 返回成功后仍需核验结算响应。
8. 第一版只用 Base Sepolia 测试钱包；不连接主网、不执行真实交易。

## 为什么暂时不加数据库

第一阶段是单实例演示，优先把接口、事件和账本状态设计正确。只有在需要服务重启恢复、并发任务或多用户隔离时，再引入 SQLite。不要为了架构图而提前运维数据库。

## 当前迁移状态

- [x] 建立 Base Sepolia 网络与 USDC 常量。
- [x] 建立无浮点金额换算与基础支付校验。
- [ ] 接入官方 x402 v2 EVM client。
- [ ] 将 Policy Engine 从 tinybar/HBAR 迁移为 USDC atomic units。
- [ ] 完成预算预留、幂等和结算对账。
- [ ] 将 Market/Risk 服务接入 x402 v2。
- [ ] 通过 Base Sepolia 测试网端到端付款。
- [ ] 移除 Hedera 运行时依赖和过时配置。

## 官方依据

- https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/evm
- https://github.com/x402-foundation/x402
- https://docs.base.org/
- https://developers.circle.com/stablecoins/usdc-contract-addresses
