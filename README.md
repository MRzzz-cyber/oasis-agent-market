# Oasis AI

**让 AI 帮你做投资。** Oasis 是一个以自然语言为入口、预算受限的 AI 投资 Agent MVP。

> 当前可运行的网页演示只使用 **示例市场信息 + 示例模型观点 + 模拟交易**。不会调用真实模型、不会付款、不会自动发起真实交易。真正的 x402 测试支付仅在单独的、显式授权的命令行脚本中运行，仍需测试网验证。

## 技术栈

- Node.js 22 / 原生 HTTP API / HTML + CSS + JavaScript
- Base Sepolia / USDC / x402 v2 (测试支付)
- 确定性 Policy Engine + USDC 原子单位预算账本
- 不需要 React、数据库或 LangGraph 就能启动 Demo
- 不保留旧的 Hedera 运行模块

## 启动

安装 Node.js 22 或更新版本：

\`\`\`bash
npm install
npm run dev
\`\`\`

打开 **http://127.0.0.1:3000**

进入官网 → 点击「开始使用」→ 输入投资目标 → 创建策略 → 我的策略 → 运行策略 → 查看 Agent Activity → 确认模拟交易。

默认无需钱包、API Key 或外部网络服务（首次 npm install 除外）。

## 测试

\`\`\`bash
npm test
\`\`\`

测试覆盖自然语言策略创建、API、预算限制、权限白名单、预留账本、重复处理、x402 报价匹配，以及模拟订单不能重复执行。

## 支付隔离

- 网页 API **没有** 触发真实支付的接口。
- 只有显式授权的 CLI 脚本可以使用隔离的 Base Sepolia 测试钱包。
- Policy Engine 严格限定收款方、网络、Token、报价和预算。
- x402 Transport SDK 只允许可信注册表中的服务端点。
- 所有真实结算必须验证链上交易信息。

如需进行单独测试网付款，请阅读 [x402 开发说明](docs/base-sepolia-x402-dev.md)。

## 目录

\`\`\`text
apps/
  api/                  本地 HTTP API
  agent/                最小 Agent 模拟闭环
  frontend/             官网 + 工作台
packages/
  evm/                  Base Sepolia、USDC、x402 客户端
  policy/               独立付款授权与预算账本
scripts/                 独立 x402 测试网 seller/buyer
docs/                    架构、测试指南及待办
\`\`\`

## 当前限制

- 示例模型委员会不是实际的三模型 API 并行推理。
- 示例市场数据不是实时行情。
- 网页账本当前为单进程内存状态，重启即清空。
- 真实 x402 支付尚未完成 Base Sepolia smoke test。
- 不支持真实交易或主网资金。

See [Architecture](docs/architecture.md) and [Roadmap](docs/roadmap.md).
