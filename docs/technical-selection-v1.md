# Oasis MVP 技术选型与迁移方案 v1.0

状态：技术决策基线（待实现）
目标：将现有 Hedera/HBAR 黑客松 Demo 演进为 Base Sepolia + USDC 的 Oasis AI Trading MVP。
安全边界：仅 Base Sepolia 测试网、独立测试钱包、x402 按次支付、模拟交易；不接主网，不做真实交易。

## 1. 执行摘要

**结论：复用现有 Oasis Agent 核心，不推倒重写。**

当前仓库已经具备 Node.js ESM 运行时、Strategy Agent 状态机、OpenAI/DeepSeek/Claude/GLM 模型适配器、Binance/CoinGecko 行情上下文、Market Agent、Risk Agent、Evidence Synthesizer、Decision Composer、Policy/Billing Guard、x402/Hedera 支付客户端与服务端、模拟交易执行、审计与 Observability。

主要迁移工作：
1. 将支付层从 Hedera HBAR 抽象并迁移到 Base Sepolia USDC。
2. 将预算单位从 tinybar 改为 token atomic units。
3. 强化支付前 Policy Engine、预算预留、幂等和支付后对账。
4. 将现有多模型适配器升级为真正并行、独立、可评测的 Committee。
5. 将固定工具调用抽象成可发现、可报价、可购买的 Service Registry。
6. 将原型 UI 逐步对齐 Figma 五页中文 MVP。

## 2. 当前代码基线

仓库：MRzzz-cyber/oasis-agent-market
主分支：main
当前主栈：Node.js >= 20、ESM、原生 node:test；前端为 Vanilla HTML/CSS/JS。

关键模块：
- apps/agent/src/strategy/StrategyAgent.mjs
- apps/agent/src/strategy/LLMReasoner.mjs
- apps/agent/src/strategy/ModelProviders.mjs
- apps/agent/src/strategy/MarketContextBuilder.mjs
- apps/agent/src/strategy/PolicyPaymentGuard.mjs
- apps/agent/src/strategy/X402PaidToolClient.mjs
- apps/agent/src/strategy/EvidenceSynthesizer.mjs
- apps/agent/src/strategy/DecisionComposer.mjs
- apps/agent/src/market/MarketResearchAgent.mjs
- apps/agent/src/risk/RiskAgent.mjs
- apps/agent/src/execution/ExecutionAgent.mjs
- packages/policy/src/index.mjs
- packages/hedera/src/index.mjs
- apps/frontend/index.html, app.js, styles.css
- apps/demo-api/src/server.mjs

现有架构已经明确：LLM 输出是 hypothesis，不是授权；支付和模拟执行由确定性 Policy/Risk Guard 控制。保留这一原则。

## 3. 推荐技术栈

| 层 | MVP 决策 | 理由 |
|---|---|---|
| Runtime | Node.js 22 LTS，ESM | 延续现有工程，避免迁移成本 |
| Backend | 保留现有 Node HTTP 服务 | 当前 API 足够轻，不先重写 |
| Frontend | 先复用现有 Vanilla UI；下一轮按 Figma 引入 React + Vite + TypeScript | 先打通端到端流程，再做 UI 工程化 |
| Validation | Zod | 对策略、模型结果、服务报价、支付需求做运行时校验 |
| Agent orchestration | 保留现有 StrategyAgent 状态机 | 已有状态机和 Policy Guard；MVP 不引入第二套 LangGraph 编排 |
| LLM | 保留现有 Provider Adapter；新增 Gemini Adapter | 统一结构化输出和成本/延迟记录 |
| Model routing | 自建轻量 Model Registry；OpenRouter 作为可选 Provider | 避免聚合层成为核心单点 |
| Data | 先复用 Binance / CoinGecko；新增 Alchemy 或 Bitquery 其一 | 先跑通一种链上证据 |
| x402 | 官方 @x402/core + @x402/evm + 对应 HTTP adapter | 采用 x402 v2 EVM exact scheme |
| EVM | viem | Base Sepolia、USDC 读取、测试钱包签名 |
| Wallet | 独立 Agent 测试钱包；签名封装在 Wallet Signer 模块 | LLM 不可访问私钥 |
| Policy | 独立确定性 Policy Engine | Agent 只能提出采购意图，不能更改授权 |
| Persistence | 单机 MVP 可先 SQLite；线上多用户再 PostgreSQL | 先保证 run/event/ledger 可恢复 |
| Testing | node:test + 单元测试 + x402 集成测试 + Base Sepolia smoke test | 延续现有测试习惯 |

不建议此阶段直接迁移 Next.js、LangGraph、微服务或 Kubernetes。当前最重要的是可演示的端到端行为。

## 4. Base Sepolia + USDC 支付决策

网络常量：
- Chain ID：84532
- x402 CAIP-2 network：eip155:84532
- USDC（Base Sepolia）：0x036CbD53842c5426634e7929541eC2318f3dCF7e
- Scheme：exact
- 优先路径：EIP-3009 transferWithAuthorization
- 测试 Facilitator：https://x402.org/facilitator（仅开发/测试，不作为生产依赖）

真实资金或部署前，必须从 Circle 官方合约地址页面再次核对地址与 token decimals。Base Sepolia 测试 USDC 无真实价值。

支付链路：
1. Agent 生成服务采购意图与服务 ID。
2. Service Registry 返回报价、供应商、网络、token、金额、有效期。
3. Policy Engine 检查任务预算、单次上限、供应商 allowlist、服务 allowlist、网络和 token。
4. Budget Ledger 原子预留额度，防止并发超支。
5. Wallet Signer 使用独立测试钱包签名 x402 payment payload。
6. x402 client 发起带支付凭证的请求。
7. 服务端/Facilitator 验证并结算。
8. 核验 settlement response 和交易回执。
9. Ledger 将 reservation 转为 settled charge；失败则释放或进入 reconciliation。
10. Agent Activity 记录 quote、policy decision、payment、provider response、成本与 tx hash。

安全规则：
- Agent/LLM 不能读取私钥、助记词、CDP secret 或 signer 对象。
- Agent/LLM 不能调用任意地址转账；只能提交结构化 PurchaseIntent。
- Wallet Signer 只接受 Policy Engine 签发的短时、单次、绑定 quoteId 的授权票据。
- Policy 超时、facilitator 异常、未知 token、未知网络或金额不一致，一律 fail closed。
- 同一 quote/payment request 必须有 idempotency key，防止重试重复扣款。
- 支付状态：quoted -> reserved -> signed -> submitted -> settled / failed / expired / reconciliation_required。
- 测试钱包私钥只放服务端环境变量或 secret store，不进入浏览器、日志和模型上下文。

Policy 金额统一使用 USDC 6 位小数的 atomic units（整数/字符串），不使用 JS 浮点数。
初始示例（仅测试配置）：
- taskBudgetAtomic = 5000000（5 USDC）
- maxPaymentAtomic = 100000（0.10 USDC）
- allowedNetwork = eip155:84532
- allowedToken = 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- allowedProviders = oasis-market-data, oasis-risk-service
- allowedServices = market-signal, risk-challenge

## 5. 模型选择与 Committee

第一版接入：
- OpenAI：默认主模型，Strategy Agent / Committee 聚合。
- Anthropic Claude：独立第二意见。
- Google Gemini：独立第三意见。
- DeepSeek：成本对照或备用，第一周不强制进入委员会。

保留现有 OpenAI、DeepSeek、Claude、GLM Adapter，新增 Gemini。模型 ID 通过环境变量配置，不硬编码“最新模型”。每次调用记录 provider、model、input/output tokens、estimated cost、latency、status、retry count。

Committee v1：
1. 三个模型并行独立分析同一 MarketSnapshot 和同一策略约束。
2. 每个模型返回 action（BUY/SELL/HOLD/NO_TRADE）、confidence、evidence IDs、thesis、counterArguments、riskFlags、suggestedPositionSize。
3. Schema 校验失败重试一次；仍失败则 abstain。
4. Aggregator 统计支持/反对/弃权，提取共同证据和分歧。
5. 低共识、高分歧、证据缺失时默认 HOLD / NO_TRADE。
6. Risk Engine 独立执行预算、仓位、回撤、数据新鲜度、策略授权检查。
7. Committee 不得签名、付款或执行交易。

不要把简单多数票等同于正确。后续用历史数据集做单模型 vs Committee 对照评测。

## 6. 数据服务市场

MVP 先实现自有 Service Registry，不做完全开放的任意 API 市场。

第一批服务：
| 服务 ID | 服务 | 数据来源 | 付费方式 |
|---|---|---|---|
| market-signal | ETH 行情、趋势与成交量摘要 | 现有 Binance / CoinGecko | x402 包装 |
| wallet-flow | 指定地址/Token 资金流 | Alchemy 或 Bitquery（二选一） | x402 包装 |
| risk-challenge | 对策略提出反方风险挑战 | Oasis 内部 Risk Agent | x402 包装 |

第一版只选一个链上数据源。优先先调研 Alchemy API 覆盖与限额；若需要更细的 DEX/Token 流数据，再评估 Bitquery。Dune 适合预先准备 SQL 的深度研究，不作为第一条实时数据路径。

服务目录字段：
serviceId, providerId, description, inputSchema, outputSchema, priceAtomic, currency, network, latencySla, qualityScore, enabled, endpoint。

Agent 根据相关性、价格、数据覆盖、延迟、成功率和用户 allowlist 选择服务。最终支付仍必须经过 Policy Engine。

## 7. Agent Workflow v1

保留现有 StrategyAgent 状态机，不引入第二套 LangGraph 编排。

推荐步骤：
parse_intent -> build_strategy -> build_market_context -> identify_evidence_gap -> discover_service -> quote_service -> policy_check -> reserve_budget -> x402_purchase -> committee_analyze -> aggregate_decision -> final_risk_check -> await_user_approval -> simulated_execution -> settle_ledger -> emit_activity

每个步骤必须有稳定 runId、stepId、eventId；输入输出可 JSON 序列化；记录开始、完成、失败时间；支持失败状态和重试策略；关键状态持久化；不能重复结算或重复创建模拟订单。

## 8. MVP 数据模型

至少需要：
- strategies
- strategy_runs
- agent_events
- service_catalog
- service_quotes
- budget_policies
- budget_reservations
- payments
- model_invocations
- committee_votes
- trade_proposals
- simulated_orders
- economic_ledger

金额存储为 atomic integer string；链 ID、token 地址、供应商 ID、quote ID 必须明确记录。

## 9. 开发顺序

### Sprint 0：仓库与环境确认
- 检查现有测试和本地启动命令。
- 确认 Hedera 支付代码边界。
- 确认 Base Sepolia x402 SDK 版本和 Facilitator /supported 响应。
- 建立 Base Sepolia test wallet。
- 核对 Circle 官方测试 USDC 地址。
- 不修改旧 Hedera adapter，先隔离并保留回归测试。

### Sprint 1：EVM x402 支付闭环
- 新增 packages/evm-payment/ adapter。
- 接入 @x402/core、@x402/evm、viem。
- 实现 Base Sepolia exact scheme。
- 实现测试服务端和付费客户端。
- 接入 Policy Engine quote/payment 检查。
- 实现 budget reservation、idempotency、settlement reconciliation。
- 通过测试网小额 USDC 付款 smoke test（需要用户配置测试凭据）。

### Sprint 2：Committee + Service Registry
- 新增 Gemini Adapter。
- 实现三模型并行分析与结构化输出。
- 实现证据引用和分歧展示。
- 新增 Service Registry / Service Selector。
- 接入一个真实链上数据源。

### Sprint 3：完整产品 Demo
- 对齐 Figma 五页中文界面。
- Agent Activity 实时流。
- 服务报价、支付、结算过程可视化。
- Committee 投票与分歧展示。
- 预算余额与 Economic Ledger。
- 交易确认与模拟成交。
- 完整端到端测试和演示脚本。

## 10. 验收标准

MVP 必须可以完整演示：
1. 用户输入自然语言投资目标。
2. Oasis 生成可编辑策略和预算。
3. Agent 发现缺少证据并选择一项服务。
4. 服务报价进入 Policy Engine。
5. Policy Engine 允许或拒绝支付；拒绝时没有签名和扣款。
6. 允许时 Agent 使用 Base Sepolia USDC 完成一笔 x402 测试支付。
7. 三个模型独立分析同一份市场数据。
8. Committee 解释结论、证据与分歧。
9. Risk Engine 独立校验交易建议。
10. 用户确认后只创建模拟订单。
11. UI 显示 Agent 步骤、模型/数据费用、支付交易哈希、预算剩余和模拟盈亏。
12. 重试、并发和超预算测试不能导致重复扣款或越权支付。

## 11. 官方参考

- x402 EVM exact scheme: https://github.com/x402-foundation/x402/tree/main/typescript/packages/mechanisms/evm
- x402 Facilitator concepts: https://github.com/x402-foundation/x402/blob/main/docs/core-concepts/facilitator.md
- x402 exact scheme: https://github.com/x402-foundation/x402/blob/main/docs/schemes/exact.mdx
- Circle USDC contract addresses: https://developers.circle.com/stablecoins/usdc-contract-addresses
- Base Sepolia docs: https://docs.base.org/
- Coinbase CDP x402 examples: https://github.com/coinbase/cdp-sdk/tree/main/examples/typescript/x402

本文件是技术决策基线，不代表集成已经完成。所有依赖版本、facilitator 支持网络和测试 USDC 地址必须在 Sprint 0 重新核验。
