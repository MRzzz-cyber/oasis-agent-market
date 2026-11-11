# Oasis Cloudflare 公网 Demo 部署

当前 Cloudflare Workers Builds 项目采用 monorepo 子项目配置：**Root directory 必须指向 `apps/frontend`，该目录内有自己的 `wrangler.jsonc`**。

## Dashboard 设置

- Git repository: `MRzzz-cyber/oasis-agent-market`
- Production branch: `refactor/simple-base-mvp`
- Root directory: `apps/frontend`
- Build command: 留空
- Deploy command: `npx wrangler deploy`
- Preview command: 留空或默认
- Worker name: 由 `apps/frontend/wrangler.jsonc` 指定为 `oasis-ai-demo`

不要再使用 `--config ../../wrangler.jsonc`。Wrangler 配置现在位于子项目根目录。

## 部署步骤

1. 在 Settings > Builds 中保存上述配置。
2. 打开 Deployments。
3. 选择最新 `refactor/simple-base-mvp` commit 的 Preview/Production build，或推送该分支的新 commit 触发部署。
4. 等待 Build 和 Deploy 都显示 Ready。
5. 打开 Cloudflare 提供的 `workers.dev` 地址。

## 本地预览

在仓库根目录运行：

```bash
npx wrangler dev --config apps/frontend/wrangler.jsonc
```

## Demo 能力与边界

- 纯静态前端；策略与模拟记录保存在访客自己的浏览器 localStorage。
- 不需要钱包、API Key、数据库或 Node 后端。
- 不会调用真实模型、真实行情、真实 x402 付款或真实交易。
- 本地完整 Node API 仍通过 `npm run dev` 启动，不能直接作为 Workers 静态资产 API 使用。

## 为什么配置放在 apps/frontend？

Cloudflare Workers Builds 的 Root directory 决定命令执行位置。对于 monorepo，Cloudflare 推荐 Root directory 指向包含该 Worker 自身 Wrangler 配置的子项目目录。把 Wrangler 配置放在 `apps/frontend` 后，Wrangler 可以直接在项目目录执行 `npx wrangler deploy`，避免从 workspace 根目录运行自动项目检测。

参考：
- https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/wrangler/configuration/
