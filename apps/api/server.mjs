import { snapshot, marketCatalog } from "../frontend/candles.js";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStrategy, prepareRun, approveRun, rejectRun, SAMPLE_SERVICES } from "../agent/core.mjs";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../frontend");
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/market.js", ["market.js", "text/javascript; charset=utf-8"]],
  ["/candles.js", ["candles.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

async function jsonBody(req) {
  let input = "";
  for await (const chunk of req) {
    input += chunk.toString();
    if (input.length > 20000) throw Object.assign(new Error("请求过大"), { status: 413 });
  }
  try { return JSON.parse(input || "{}"); }
  catch { throw Object.assign(new Error("JSON 格式错误"), { status: 400 }); }
}
function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(data));
}
export function createAppServer() {
  const strategies = new Map();
  const runs = new Map();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && ["/api/market/candles","/api/market/catalog"].includes(url.pathname)) {
        const result = url.pathname.endsWith("/catalog") ? await marketCatalog() : await snapshot(new Request(url));
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(await result.text()); return;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "GET" && url.pathname === "/api/status") {
        send(res, 200, { ok: true, app: "Oasis", network: "Base Sepolia", mode: "simulation", realPaymentsEnabled: false, services: SAMPLE_SERVICES });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/strategies") {
        const strategy = createStrategy(await jsonBody(req));
        strategies.set(strategy.id, strategy);
        send(res, 201, strategy);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/strategies") {
        send(res, 200, [...strategies.values()]);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/runs") {
        const { strategyId } = await jsonBody(req);
        const strategy = strategies.get(strategyId);
        if (!strategy) return send(res, 404, { error: "策略不存在" });
        const run = prepareRun(strategy);
        runs.set(run.id, run);
        strategy.status = "active";
        send(res, 201, run);
        return;
      }
      if (parts[0] === "api" && parts[1] === "runs" && parts[2]) {
        const run = runs.get(parts[2]);
        if (!run) return send(res, 404, { error: "运行不存在" });
        if (req.method === "GET" && parts.length === 3) return send(res, 200, run);
        if (req.method === "POST" && parts.length === 4 && parts[3] === "approve") return send(res, 200, approveRun(run));
        if (req.method === "POST" && parts.length === 4 && parts[3] === "reject") return send(res, 200, rejectRun(run));
      }
      if (req.method === "GET" && routes.has(url.pathname)) {
        const [filename, type] = routes.get(url.pathname);
        const bytes = await readFile(path.join(webDir, filename));
        res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff", "cache-control": "no-store" });
        res.end(bytes);
        return;
      }
      send(res, 404, { error: "未找到对应接口" });
    } catch (error) {
      send(res, error.status || (/不存在|已处理/.test(error.message) ? 409 : 400), { error: error.message || "请求失败" });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log("Oasis MVP http://127.0.0.1:" + port + " (simulation-only)");
  });
}
