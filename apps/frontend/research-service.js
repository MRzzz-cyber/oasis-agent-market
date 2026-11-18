import { runResearchDemo } from "../agent/src/strategy/ResearchPlanner.mjs";
import { fetchHistoricalCandles, replayResearch } from "../agent/src/strategy/ResearchReplay.mjs";

export async function researchRoute(request, { fetchImpl = fetch } = {}) {
  const pathname = new URL(request.url).pathname;
  if (request.method !== "GET") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { allow: "GET" } });
  }
  if (pathname === "/api/research/demo") {
    return Response.json(runResearchDemo(), { headers: { "cache-control": "no-store" } });
  }
  if (pathname !== "/api/research/replay") return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const result = replayResearch(await fetchHistoricalCandles(fetchImpl));
    return Response.json(result, { headers: { "cache-control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "historical_replay_unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
