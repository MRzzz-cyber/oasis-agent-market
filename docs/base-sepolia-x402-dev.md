# Base Sepolia x402 测试支付开发说明

> 状态：SDK 买方与测试卖方适配代码已提交，自动化测试使用模拟 SDK。尚未完成真实 Base Sepolia 测试网支付验收。本说明中的操作可能真实消耗无价值的测试 USDC。

## 1. 设计边界

- Chain：Base Sepolia，CAIP-2 为 eip155:84532。
- Asset：Circle Base Sepolia USDC，6 decimals。
- Protocol：x402 v2 exact，EIP-3009。
- Agent：只能提出 PurchaseIntent；不能控制签名器或修改 Policy。
- Server：只访问可信 Service Registry 配置的服务端点。
- Policy：在任何付款前检查任务预算、单笔限额、服务商/服务/收款地址、网络/Token。
- SDK selector：每次收到 HTTP 402 都必须与授权报价完全匹配（避免服务器临时抬价或更换收款人）。
- 收款证明：除了卖方的 PAYMENT-RESPONSE，还通过 Base Sepolia RPC 核验成功的交易回执及 USDC Transfer 日志。
- 不确定结算：维持预算占用，标记 reconciliation_required；绝不盲目重试支付。

## 2. 文件

- packages/evm/src/x402-transport.mjs — SDK 买方、报价匹配及链上结算验证。
- packages/evm/src/purchase.mjs — Policy-gated PurchaseCoordinator。
- packages/policy/src/usdc.mjs — USDC Policy + 单进程预算账本。
- scripts/base-sepolia-market-server.mjs — 官方 SDK / Express 本地付费卖方。
- scripts/base-sepolia-x402-smoke.mjs — 明确启用才可调用的端到端测试脚本。

## 3. 依赖安装（须在有 npm 网络的本地或 Codex 环境执行）

当前仓库尚未把下列 SDK 依赖加入 pnpm-lock.yaml。请执行：

```bash
pnpm add @x402/core @x402/evm @x402/fetch @x402/express viem express
pnpm test
```

使用 pnpm 生成并提交新的 package.json / pnpm-lock.yaml，不要手工编辑 lockfile。

**注意：** CI 已有的模拟测试不需要这些 SDK，因此通过 CI 不代表真实 SDK 已完成集成验证。真实版本安装后，还应在本地做 SDK import、402/付费路由和 Base Sepolia 集成测试。

## 4. 本地双端测试

准备 **两个隔离的测试钱包**，分别作为 Agent payer 和商家 payee。

- Agent payer：少量 Base Sepolia 测试 USDC。
- 商家 payee：提供接收地址；绝不把私钥提交到仓库。
- 供应商收款地址与 Service Registry 配置必须一致。

设置以下环境变量（示例值仅为占位；不要直接使用）：

```text
OASIS_TEST_SERVICE_RECIPIENT=0xYourSeparateMerchantTestWalletAddress
OASIS_AGENT_WALLET_PRIVATE_KEY=0xYourIsolatedTestPayerPrivateKey
OASIS_TEST_FACILITATOR_URL=https://x402.org/facilitator
OASIS_TEST_SERVICE_URL=http://127.0.0.1:8787/market-signal
OASIS_ALLOW_LOCALHOST_X402_SERVICE=YES_LOCAL_TEST
OASIS_ENABLE_TESTNET_PAYMENTS=YES_I_AUTHORIZE_TEST_USDC_SPEND
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

两个终端分别运行：

```bash
node scripts/base-sepolia-market-server.mjs
node scripts/base-sepolia-x402-smoke.mjs
```

测试脚本支付限额固定为 **0.10 测试 USDC**，默认关闭；只有设置完整的显式授权开关才会执行。未完成配置时会直接拒绝。

## 5. 验收标准

- HTTP GET /market-signal 初始返回 402 的付款要求。
- SDK 仅能选择 Base Sepolia + 指定 USDC + 指定收款地址 + 100000 原子单位。
- 错误网络、Token、收款地址、金额不得创建支付签名。
- Agent 测试钱包只在 Policy 通过后进行授权。
- 测试卖方调用 Facilitator 完成校验与结算。
- 付款响应包含 transaction hash。
- RPC 核验该 tx 成功并且目标 USDC Transfer 金额、收款人和付款人完全一致。
- Economic Ledger 记账 0.10 USDC；重复 quote 不产生第二笔扣款。
- 付款失败或未知结果应维持待对账状态，禁止自动二次付款。

## 6. 当前仍需补齐

1. 在开发环境执行 pnpm add 并提交 lockfile。
2. 在真实 SDK 下运行独立的 x402 Seller/Buyer 集成测试。
3. 将 Base Payment Transport 注入现有 StrategyAgent 的付款依赖。
4. 将旧 Hedera / HBAR 的 Policy、报价、前端展示改为 USDC。
5. 将单进程账本改为持久化/重启可恢复的账本，才能让带资金的长时间运行更可靠。
6. 新增基于链上查询的已提交但未确认付款的恢复与对账流程。

## 7. 参考文档

- https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/src/exact/README.md
- https://github.com/x402-foundation/x402/blob/main/typescript/packages/http/fetch/README.md
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://docs.base.org/
