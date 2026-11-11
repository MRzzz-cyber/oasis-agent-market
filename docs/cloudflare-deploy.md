# Oasis Cloudflare 公网 Demo 部署

这个版本采用 **Cloudflare Workers Static Assets**，不需要服务端钱包、Node.js 常驻服务器或数据库。

**网站使用浏览器 localStorage 存储演示策略和模拟交易记录。** 不共享到其他访客，不连接真实行情或大模型，不支付测试 USDC，也不连接主网钱包。请勿用于真实资金。

## 最简单的部署方式：Cloudflare + GitHub

1. 打开 https://dash.cloudflare.com/ → Workers & Pages → Create application。
2. 选择 GitHub，授权并选中 `MRzzz-cyber/oasis-agent-market` 仓库。
3. 选择分支 `refactor/simple-base-mvp`（尚未合并前），或后续合并后选择 `main`。
4. Worker 名称填写 **oasis-ai-demo**，需要与仓库 `wrangler.jsonc` 的 `name` 保持一致。
5. 设置部署命令为 `npx wrangler deploy`。本项目是纯静态资源，不需要构建命令。
6. 点击 Deploy，成功后 Cloudflare 会提供 `*.workers.dev` 公网地址。
7. 浏览器访问地址：官网 → 开始使用 → 输入投资目标 → 创建策略 → 我的策略 → 运行策略 → 确认模拟交易。

如果界面显示的 Git 集成配置步骤有所不同，以 Cloudflare Dashboard 当前提示为准。

### 本地使用 Wrangler 测试 Cloudflare 静态版本

```bash
git checkout refactor/simple-base-mvp
npm install
npx wrangler dev
```

按照终端显示的预览地址访问（一般为 `http://localhost:8787`）。

**重要区别：** 这份 Worker 只托管前端静态文件，使用浏览器端模拟数据。原来 `npm run dev` 则运行 Node.js API 与前端；两种模式共用界面，但模拟数据存储位置不同。

### 手动部署

```bash
npx wrangler login
npx wrangler deploy
```

需要拥有 Cloudflare 账户，并在登录浏览器完成授权。

## 为什么不将现有 Node API 直接放进 Workers？

Node.js `http.createServer` 不适合直接作为 Workers 入口。为了快速给用户提供稳定的公开演示，本轮选择 Cloudflare 静态资源托管 + 浏览器 localStorage 模拟策略流程。这意味着无需 D1、KV、Durable Objects 或钱包私钥即可体验完整前端流程。

以后加入真实 Agent 服务、账户、多人共享数据时，再把 API 迁移成 Workers Fetch handler，并配置 D1 / Durable Objects 或单独部署后端。

## 部署前检查

- [ ] GitHub CI 通过。
- [ ] Worker 名与 `wrangler.jsonc` 一致。
- [ ] 网站首页可打开。
- [ ] 可以创建策略。
- [ ] 可以启动模拟 Agent 运行。
- [ ] 可以看到模型投票和费用演示说明。
- [ ] 确认模拟订单不会执行真实交易。
- [ ] 重新打开页面后浏览器中的策略仍在（同浏览器同域名）。
- [ ] 没有在 Cloudflare 环境配置真实付款私钥。

## 常见问题

- `127.0.0.1:3000` 只能在本地 Node 服务器已启动时访问；并非公网网址。
- GitHub 仓库本身不能自动提供正在运行的 Node API。
- Cloudflare 使用 `*.workers.dev` 公网地址，不需要你一直打开 PowerShell。
- 不要将“网页 Demo 可用”误认为“真实 Base Sepolia 付款已经验收通过”。

官方文档：
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
