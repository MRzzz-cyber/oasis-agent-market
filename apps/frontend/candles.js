export const intervals = { "15m":900000, "1h":3600000, "4h":14400000, "1d":86400000 };
export const coins = ["BTC","ETH","XRP","HYPE"];

const stocks = new Set("TSLA NVDA AAPL MSFT AMD INTC META AMZN GOOGL GOOG ORCL PLTR COIN HOOD MU MSTR CRCL NFLX COST LLY SNDK RIVN BABA GME CRWV HIMS DKNG MRVL RKLB ZM EBAY ARM DELL IBM AVGO NOW NBIS WDC QCOM AMAT NET CRWD RDDT MRNA CVX TTWO".split(" "));
const macro = new Set("XYZ100 US500 USA500 SP500 GOLD SILVER CL COPPER NATGAS PLATINUM PALLADIUM BRENTOIL EUR JPY GBP KR200 JP225 NIFTY".split(" "));
const aliases = {BTC:"比特币",ETH:"以太坊",SOL:"索拉纳",TSLA:"特斯拉",NVDA:"英伟达",AAPL:"苹果",MSFT:"微软",GOLD:"黄金",SILVER:"白银"};
export function buildCatalog(perps, spot) {
  const markets = new Map();
  for (const meta of perps.flat()) {
    for (const asset of meta?.universe || []) {
      if (!asset.name || asset.isDelisted) continue;
      const id = asset.name, ticker = id.split(":").at(-1);
      const group = !id.includes(":") ? "加密永续" : stocks.has(ticker) ? "美股永续" : macro.has(ticker) ? "指数与宏观" : "其他永续";
      markets.set(id,{id,label:ticker,group,alias:aliases[ticker] || "",quote:"USD"});
    }
  }
  const tokens = new Map((spot.tokens || []).map(t=>[t.index,t.name]));
  for (const pair of spot.universe || []) {
    const [base,quote] = pair.tokens.map(index=>tokens.get(index));
    if (!base || !quote || !pair.name || pair.isDelisted || markets.has(pair.name)) continue;
    markets.set(pair.name,{id:pair.name,label:base+"/"+quote,group:"现货",alias:aliases[base] || "",quote});
  }
  return [...markets.values()];
}
let listing, pending;
async function loadCatalog(fetcher) {
  if (listing && Date.now()-listing.time < 300000) return listing.markets;
  if (pending) return pending;
  async function info(type) {
    const r = await fetcher("https://api.hyperliquid.xyz/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type}),signal:AbortSignal.timeout(12000)});
    if (!r.ok) throw Error("catalog");
    return r.json();
  }
  pending = Promise.all([info("allPerpMetas"),info("spotMeta")]).then(([perps,spot])=>{
    const markets = buildCatalog(perps,spot);
    if (!markets.length) throw Error("empty catalog");
    listing={markets,time:Date.now()};
    return markets;
  }).finally(()=>{pending=null;});
  return pending;
}
export async function marketCatalog() {
  try {return Response.json({markets:await loadCatalog(fetch)},{headers:{"cache-control":"public,max-age=60"}});}
  catch {return Response.json({error:"市场目录暂不可用"},{status:502});}
}

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
  if (!coin || coin.length > 100 || !Object.hasOwn(intervals,interval)) return Response.json({error:"请选择支持的币种和周期"},{status:400});
  const key = new Request(url.origin+"/api/market/candles?coin="+encodeURIComponent(coin)+"&interval="+interval);
  const cached = await cache?.match(key).catch(()=>null);
  if (cached) return cached;
  try {
    if (!coins.includes(coin) && !(await loadCatalog(fetcher)).some(m=>m.id===coin)) return Response.json({error:"市场未收录"},{status:400});
    const endTime = Date.now();
    const upstream = await fetcher("https://api.hyperliquid.xyz/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"candleSnapshot",req:{coin,interval,startTime:endTime-100*intervals[interval],endTime}}),signal:AbortSignal.timeout(12000)});
    if (!upstream.ok) throw Error();
    const candles = normalize(await upstream.json(),coin,interval);
    if (!candles.length) throw Error();
    const result = Response.json({coin,interval,candles},{headers:{"cache-control":"public, max-age=10"}});
    await cache?.put(key,result.clone()).catch(()=>{});
    return result;
  } catch { return Response.json({error:"Hyperliquid 行情暂不可用"},{status:502}); }
}
