# Base Sepolia x402 测试网验证

这份说明只适用于单独的测试付款 CLI。**Oasis 网页 Demo 永远不会发起真实付款。** 测试代码仍未经真实链上结算验收，不建议将它用于主网或实际资产。

## 先测试产品本身（不需要钱包）

在 Windows PowerShell 或 macOS Terminal 中执行：

\`\`\`bash
git checkout refactor/simple-base-mvp
npm install
npm run dev
\`\`\`

浏览器打开 http://127.0.0.1:3000 ，按如下路径操作：

官网 → 开始使用 → 输入投资目标 → 创建策略 → 我的策略 → 运行策略 → 查看 Agent Activity → 确认模拟交易。

运行自动化测试：

\`\`\`bash
npm test
\`\`\`

成功标准：创建策略、生成模拟研究事件、用户确认、显示模拟订单；**实际支付金额始终为零**，前端不会接触钱包私钥。

## 可选：单独测试 Base Sepolia x402（可能消耗测试 USDC）

开发者另需准备两个隔离钱包：
- Payer：仅有少量 Base Sepolia 测试 USDC 的独立 Agent 钱包。
- Payee：独立测试商户钱包；只需要接收地址。
- 私钥只能保存在本地环境变量，不能粘贴到网页、聊天或提交到 Git。

Base Sepolia：\`eip155:84532\`，USDC：\`0x036CbD53842c5426634e7929541eC2318f3dCF7e\`。

环境变量：
\`\`\`text
OASIS_TEST_SERVICE_RECIPIENT=0xYourSeparateTestMerchantAddress
OASIS_AGENT_WALLET_PRIVATE_KEY=0xYourDedicatedTestWalletPrivateKey
OASIS_TEST_FACILITATOR_URL=https://x402.org/facilitator
OASIS_TEST_SERVICE_URL=http://127.0.0.1:8787/market-signal
OASIS_ALLOW_LOCALHOST_X402_SERVICE=YES_LOCAL_TEST
OASIS_ENABLE_TESTNET_PAYMENTS=YES_I_AUTHORIZE_TEST_USDC_SPEND
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
\`\`\`

在 PowerShell 中可以按示例设置**非敏感**环境变量：
\`\`\`powershell
$env:OASIS_TEST_SERVICE_URL="http://127.0.0.1:8787/market-signal"
$env:OASIS_ALLOW_LOCALHOST_X402_SERVICE="YES_LOCAL_TEST"
\`\`\`

不要把私钥写在 shell 历史、终端截图或聊天中。建议使用临时、隔离的 shell 环境，并在测试后清除环境变量。

两个终端分别运行：
\`\`\`bash
npm run seller:x402
npm run smoke:x402
\`\`\`

测试脚本只有在明确授权开关存在时才会尝试付款；支付上限固定为 **0.10 测试 USDC**。任何错误或无法验证的支付都不能直接算作已完成结算。

## 当前代码安全边界

- Agent 仅提出采购意图；支付收款方和 API URL 来自可信服务目录。
- Policy Engine 检查网络、Token、白名单、支付额度、任务预算。
- SDK 只能选择与授权报价匹配的 HTTP 402 支付要求。
- 验证链上 USDC Transfer 金额、收款人和付款人后才登记已结算。
- 无法确认支付时预留资金进入待对账状态，不自动再次扣款。
- CLI 所用账本是**单进程内存账本**，不可当作重启安全的真实钱包预算系统。

## 仍需要进一步实现

- 真正跑通并记录 Base Sepolia 付款交易哈希。
- 持久化预算账本和跨重启对账。
- 绑定 EIP-3009 授权 nonce 与链上结算，补足双花/重放保护。
- 加入真实行情、真实大模型委员会与交易回测。

参考：
- https://github.com/x402-foundation/x402
- https://developers.circle.com/stablecoins/usdc-contract-addresses
