# Oasis · 最小化产品架构

\`\`\`text
Browser (official website / workspace)
        │
Node.js HTTP API — apps/api/server.mjs
        │
apps/agent/core.mjs (demo strategy + execution timeline)
        │
Policy Engine — packages/policy/src/usdc.mjs
        │
 ┌──────┴────────┐
│ demo preview   │ trusted x402 CLI transport (manual only)
│ no payments    │ Base Sepolia + USDC
└────────────────┘
\`\`\`

## 用户路径

官网 → 开始使用 → 总览对话 → 创建策略 → 我的策略运行 → Agent Activity → 用户确认模拟订单。

## 授权边界

只有 server-side trusted code 可以创建 Policy、指定 Service Registry、读取钱包私钥。用户的文本目标不能控制上述任何配置。网页 API 永远不签名、不付款。

## 当前真实状态

- 演示链路：可运行的本地模拟 UI + API + Agent Activity + 审批。
- 真实 x402：独立 CLI 买方/卖方代码存在，需通过测试网实际结算验收。
- 目前没有持久化交易账本，不应部署带资金的无人值守服务。
- 未来可以把目前 fixtures 与示例模型替换为实时数据、真实多模型委员会，并把事件持久化。

## 保留的代码

\`packages/policy/src/usdc.mjs\`：独立 USDC Policy Engine 和单进程预算预留账本。

\`packages/evm/src/x402-transport.mjs\`：SDK 支付客户端和链上 Transfer 验证。

\`scripts/base-sepolia-market-server.mjs\` + \`scripts/base-sepolia-x402-smoke.mjs\`：独立真实测试网付费试验。
