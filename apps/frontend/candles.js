export const intervals = { "15m":900000, "1h":3600000, "4h":14400000, "1d":86400000 };
export const coins = ["BTC","ETH","XRP","HYPE"];

export function normalize(rows, coin, interval) {
  const byTime = new Map();
  for (const row of rows) {
    if (!row || row.s !== coin || row.i !== interval) continue;
    const values = [row.t,row.o,row.h,row.l,row.c,row.v];
    if (!values.every(x => x != null && x !== "" && Number.isFinite(Number(x)))) continue;
    const [t,o,h,l,c,v] = values.map(Number);
    if (!Number.isSafeInteger(t) || t <= 0 || l <= 0 || l > Math.min(o,c) || h < Math.max(o,c) || v < 0) continue;
    byTime.set(t,{t,o,h,l,c,v});
  }
  return [...byTime.values()].sort((a,b)=>a.t-b.t).slice(-100);
}
export async function snapshot(request, fetcher=fetch, cache=globalThis.caches?.default) {
  const url = new URL(request.url);
  const coin = url.searchParams.get("coin"), interval = url.searchParams.get("interval");
  if (!coins.includes(coin) || !Object.hasOwn(intervals,interval)) return Response.json({error:"请选择支持的币种和周期"},{status:400});
  const key = new Request(url.origin+"/api/market/candles?coin="+coin+"&interval="+interval);
  const cached = await cache?.match(key);
  if (cached) return cached;
  try {
    const endTime = Date.now();
    const upstream = await fetcher("https://api.hyperliquid.xyz/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"candleSnapshot",req:{coin,interval,startTime:endTime-100*intervals[interval],endTime}}),signal:AbortSignal.timeout(12000)});
    if (!upstream.ok) throw Error();
    const candles = normalize(await upstream.json(),coin,interval);
    if (!candles.length) throw Error();
    const result = Response.json({coin,interval,candles},{headers:{"cache-control":"public, max-age=10"}});
    await cache?.put(key,result.clone());
    return result;
  } catch { return Response.json({error:"Hyperliquid 行情暂不可用"},{status:502}); }
}
