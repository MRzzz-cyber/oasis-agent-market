# 技术选型

Node.js 22 (ESM) + 原生 HTTP + Vanilla JS。

支付：Base Sepolia USDC + x402 v2 官方 SDK / viem。

Agent：最小模拟工作流，真实多模型委员会后续接入。

权限：独立的 \`packages/policy/src/usdc.mjs\`；只有显式 CLI 可以触发测试网付费。

持久化：暂时单进程内存；没有 SQLite、PostgreSQL、ORM、Redis 或 LangGraph。

当前 UI 和 API 在不设置模型 Key 或钱包 Key 的情况下应当可启动与端到端测试。
