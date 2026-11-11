# Oasis MVP 迭代计划

## 已完成
- [x] 删除 Hedera 运行时、依赖与专用脚本。
- [x] 官网 → AI 工作台 → 创建策略 → 运行记录 → 用户确认模拟交易。
- [x] Base Sepolia / USDC Policy + 单进程预算预留账本。
- [x] x402 SDK 客户端/卖方的代码与 mock 级测试。
- [x] API 级别集成测试、CI。

## 下一阶段
- [ ] 确认 SDK 真实 server + client 在 Base Sepolia 的兼容性与 facilitator 支持。
- [ ] 真实测试 USDC 付款交易，保存 explorer 哈希。
- [ ] 支付账本持久化及重启后的 reconciliation。
- [ ] 接入真实的链上/行情数据提供商。
- [ ] 接入真实 OpenAI、Claude、Gemini 模型调用和统计。
- [ ] 三模型并行委员会，用同一份 Market Snapshot，记录分歧与成本。
- [ ] Agent 自主服务采购选择（固定白名单），不改变签名授权边界。
- [ ] 登录、用户身份和服务器存储（如果需公网部署）。

## 禁止
- 主网和真实交易。
- 让 HTTP 客户端调用钱包私钥。
- 让 LLM 生成可执行的付款政策。
- 将示例模型结果伪装成真实市场观点。
