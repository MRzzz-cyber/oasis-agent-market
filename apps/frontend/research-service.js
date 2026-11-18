import historicalCandles from "../../data/snapshots/eth-usd-daily-2025-h1.mjs";
import { runResearchDemo } from "../agent/src/strategy/ResearchPlanner.mjs";
import { replayResearch } from "../agent/src/strategy/ResearchReplay.mjs";

export async function researchRoute(request) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET" } });
  }
  if (pathname === "/api/research/demo") {
    return Response.json(runResearchDemo(), { headers: { "cache-control": "no-store" } });
  }
  if (pathname !== "/api/research/replay") return Response.json({ error: "not_found" }, { status: 404 });
  const result = replayResearch(historicalCandles.map(([timestamp, close]) => ({ timestamp, close })));
  return Response.json(result, { headers: { "cache-control": "public, max-age=3600" } });
}
