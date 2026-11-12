# Oasis Cloudflare 部署

当前入口为 `apps/frontend/worker.js`：Worker 提供 OpenRouter 模型目录和流式对话，静态前端负责策略与模拟订单，数据仅保存在当前浏览器。

## 构建设置

- Repository: `MRzzz-cyber/oasis-agent-market`
- Production branch: `refactor/simple-base-mvp`
- Root directory: `apps/frontend`
- Build command: 留空
- Deploy command: `npx wrangler deploy --config wrangler.jsonc`
- Worker name: `oasis-ai-demo`（以该目录内的 Wrangler 配置为准）

**先将 PR #2 的 OpenRouter 功能分支合并到生产分支，再从生产分支重新部署。** 仅在功能分支修复配置，不会改变生产分支的构建结果。根目录不要使用 `--config ../../wrangler.jsonc`。

`npx wrangler preview` 与生产部署命令不同。配置保留 `previews: {}`；Cloudflare 的生产部署命令仍应使用上面的 `wrangler deploy`。

## 必需配置

在实际部署的 Worker 的 Settings → Variables and Secrets 中配置 Secret：

- `OPENROUTER_API_KEY`
- `OASIS_DEMO_ACCESS_CODE`

不把 Key 放进前端、Git 或普通变量。网页只输入管理员设置的体验码。配置变更后重新部署。

## 部署验证

1. `/api/ai/status` 应包含 `provider: "OpenRouter"`、`openRouterConfigured: true` 和 `enabled: true`。若仍返回旧版固定模型字典，说明部署的代码尚未更新。
2. `/api/ai/models` 应返回实时目录与模型 ID。
3. 在页面选择模型、输入体验码，确认回复逐步显示，并显示实际模型 ID 和服务端返回的 Token 用量。
4. 补充策略条件，确认草案中的标的、单次上限与币种，保存并运行模拟订单。
5. 确认、跟踪和复盘后刷新页面，从“我的策略”的运行记录重新打开。

模型目录公开可读；真实推理需要体验码和 Key。主模型对话为真实 API 请求，行情、模型观点、数据采购和交易均为模拟；不计算虚构盈亏，不进行真实付款。

## 本地检查

在仓库根目录运行：

```bash
npm install --no-package-lock --ignore-scripts
npm test
npx wrangler deploy --dry-run --config apps/frontend/wrangler.jsonc
npx wrangler dev --config apps/frontend/wrangler.jsonc
```

本地 Worker 密钥放在 `apps/frontend/.dev.vars`，不要提交。`npm run dev` 仅启动 Node 模拟 API 与静态页面，不提供 Cloudflare OpenRouter 路由；验证真实对话应使用 Wrangler。

更多说明见 [OpenRouter 接入](openrouter-integration.md)。
