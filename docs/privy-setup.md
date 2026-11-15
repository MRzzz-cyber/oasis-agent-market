# Privy 账号钱包接入

## 已实现的链路

保留现有 Google OAuth + 一次性体验码激活。激活后，由 Oasis 已验证的用户 ID 签发五分钟有效的 RS256 JWT。官方 Privy React SDK 通过 JWT 登录，在确认 custom_auth 身份匹配后创建或恢复用户自己的 EVM 钱包。钱包出现在资金面板和测试网交易的钱包选择中。

SDK 是独立的 React 组件，其他界面仍为原有 HTML/JS。SDK 从 npm 锁定版本构建，浏览器不从第三方 CDN 动态导入代码。钱包生成与密钥处理由 Privy 完成；Oasis 不存钱包私钥，不持有服务端代签密钥。

当前账号钱包只暴露账户查询与 Hyperliquid Testnet 的 ApproveAgent 签名。签名前重新核对 Oasis 登录账户，并通过 Privy 的签名确认界面展示请求。拒绝 eth_sendTransaction、personal_sign 和主网授权。创建钱包不自动授予 Agent 权限；沿用已有的测试助手授权和逐单确认。退出或切换账号立即清除账号钱包和内存助手，旧 provider 不能继续使用。

**尚未进行：真实 Privy 应用建钱包、恢复和签名验收。没有供应商 App ID/配置时，保持关闭，已有 Rabby/MetaMask 测试交易继续可用。不能宣称已创建钱包或已充值。**

## 1. Privy Dashboard

创建应用，在 Settings / Clients 获取公开的 App ID 和 Client ID。把生产域名加入允许来源：

`https://oasis-agent-market.zqsanjingshou.workers.dev`

本实现复用 Google 登录，不需要把 Google Client Secret 再放进前端。需要在 Privy 开通 **JWT / Custom authentication**（官方文档提示可能需申请访问），选择允许客户端 SDK 认证，配置：

- JWKS URL：`https://oasis-agent-market.zqsanjingshou.workers.dev/.well-known/jwks.json`
- 用户 ID Claim：`sub`
- 若提供 issuer/audience 限制，issuer 必须为上述网站 origin，audience 为 Privy App ID。
- 钱包权限保持用户控制；不要给 Oasis 添加服务端 signer/delegation。
- 应用条款、恢复和多因素设置必须在真实用户入金前配置和验收；不能在代码中自动接受条款。

Privy 自带的 createOnLogin 不覆盖自定义 JWT 登录，所以组件在身份同步后调用 createWallet。先查已有钱包，当前会话内去重；失败由用户重试，不循环创建。

## 2. 生成 Oasis 身份签名密钥

无需命令行时，可以在自己浏览器打开 `/privy-setup.html`，本地生成密钥并复制到 Cloudflare。该页面不上传或持久化私钥，线上已有公钥时不允许重新生成。请保持页面打开并先下载私钥备份，公钥发布匹配后再在 Privy 保存。

也可在本地项目根目录运行：

```sh
npm run setup:privy
```

脚本输出文件名，不输出私钥；文件存于被 Git 忽略的 `.privy-setup`，私钥权限 0600。不会覆盖已有密钥。已有线上用户后不得随意更换 issuer/sub 规则或 Privy 应用，否则会建立不同的钱包身份。密钥轮换需保留旧 JWKS，当前单公钥版本应先停发旧 token 并等五分钟过期后切换。

## 3. Cloudflare 配置

在 **Settings → Runtime variables and secrets → Production** 添加：

| 名称 | 类型 | 内容 |
| --- | --- | --- |
| PRIVY_APP_ID | Text | Privy 公开 App ID |
| PRIVY_CLIENT_ID | Text | Privy 公开 Client ID（建议配置） |
| OASIS_AUTH_ISSUER | Text | 上述网站 origin，不带结尾斜杠 |
| OASIS_AUTH_KEY_ID | Text | oasis-auth-v1 |
| OASIS_AUTH_PUBLIC_JWK | Text | `.privy-setup/public-jwk.json` 文件完整 JSON |
| OASIS_AUTH_PRIVATE_KEY | Secret | `.privy-setup/private-key.pem` 完整内容 |
| PRIVY_ENABLED | Text | 先设 false，完成 Privy JWKS 设置后改 true |

不需要 Privy App Secret。不要把身份私钥发到聊天、提交 Git，或填进浏览器前端。

通过 Wrangler 写入私钥可使用：

```sh
npx wrangler secret put OASIS_AUTH_PRIVATE_KEY --config apps/frontend/wrangler.jsonc < .privy-setup/private-key.pem
```

私钥是用于证明 Oasis 用户身份的 JWT 密钥，**不是用户钱包私钥**。

## 4. 构建与部署

```sh
npm ci
npm run build:wallet
npm test
```

Wrangler 的 custom build 会从仓库根目录运行 npm ci（含构建依赖）和 build:wallet。Cloudflare 原部署命令保持 `npx wrangler deploy --config wrangler.jsonc`（根目录仍 apps/frontend）。生成文件位于 `apps/frontend/vendor/privy`，由部署时构建，不提交 Git。未配置的应用不会下载 SDK 或发起 Privy 请求。

本地 Node 演示服务不启用真实身份认证；`/api/wallet/config` 明确返回 disabled。

## 5. 真正启用前验收

1. 配置未齐全：不出现假地址、假余额；外部钱包可用。
2. 新 Google 用户激活：仅创建一个钱包；取消条款或创建失败可重试。
3. 同一账号退出后重登、换设备恢复：同一地址；不同 Google sub 不共用钱包。
4. 不接受 A 账号遗留的 Privy 会话为 B 钱包；切换账号立即使旧 provider 失效。
5. 新地址需自行领取测试币；旧钱包的 999 测试 USDC 不会自动转到新钱包。
6. 核对 Hyperliquid Testnet Spot 余额，预览一笔测试订单。Privy 弹出用户签名确认，拒绝能恢复；确认后仍须单独提交订单。
7. 订单结果不明先查原订单；不自动重试；不进行主网入金测试。

## 官方资料

- https://docs.privy.io/authentication/user-authentication/jwt-based-auth/setup
- https://docs.privy.io/authentication/user-authentication/jwt-based-auth/usage
- https://docs.privy.io/basics/react/advanced/automatic-wallet-creation
- https://docs.privy.io/wallets/wallets/create/create-a-wallet
