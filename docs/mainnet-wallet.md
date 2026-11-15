# 正式网钱包与资产视图

默认钱包抽屉使用主网资产，入口顺序为：Oasis 账号钱包（登录创建/恢复）→ Rabby / MetaMask / 其他已安装钱包 → 当前选中地址 → 链上原生币与 Hyperliquid 账户。连接外部钱包用于读资产，不等于使用钱包登录 Oasis 的 Google 账号。

链上钱包显示当前支持的主网原生币和 Circle 官方原生 USDC，不声称已汇总用户所有链或所有代币，不计入 USDC.e。USDC 通过 eth_call balanceOf 只读查询；Privy 适配器只允许官方合约、当前用户地址和 latest 区块。支持 Ethereum、Arbitrum、Base、Optimism 的 ETH 与 HyperEVM 的 HYPE。测试链或未知网络不显示为主网余额。余额请求前后核对地址和 chainId；账户切换清空旧值，网络切换重新读取。

Hyperliquid 只请求 https://api.hyperliquid.xyz/info。现货可用 USDC 为 total - hold，以十进制整数计算；现货持币直接使用 API 返回的主网资产，不复用测试网 UETH token ID。永续账户单独显示 withdrawable，不与现货或链上余额加总。单项接口错误显示 —，不能作为零余额；确认返回空现货列表才显示暂无资产。

本轮没有开放 Oasis 正式网下单、转账或充值自动执行。钱包面板移除测试币水龙头和测试交易 CTA，提供官方账户查看入口。旧测试交易仍是独立流程；主网余额带 network 标签，不能满足测试网订单预算。Privy provider 新增的权限仅为读取自己的 eth_getBalance 和固定官方 USDC 合约 balanceOf；主网签名和转账仍被拒绝。

后续正式网下单必须独立实现主网元数据/精度/最小金额校验、主网报价预览、明确用户授权范围、逐单确认、订单幂等与成交对账，才能向用户展示真实的提交入口。不能仅替换测试网 API 域名或拿主网资产为未开放能力引导入金。

参考：
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
- https://hyperliquid.gitbook.io/hyperliquid-docs/onboarding/how-to-start-trading
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm
- https://developers.circle.com/stablecoins/usdc-contract-addresses
