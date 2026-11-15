const STOCKS=new Set('TSLA NVDA AAPL MSFT AMD META AMZN GOOGL COIN HOOD MSTR PLTR RKLB INTC'.split(' '));
const MACRO=new Set('XYZ100 GOLD SILVER CL COPPER NATGAS EUR JPY US500 SP500'.split(' '));
export function marketRows(payload,dex='') {
  if(!Array.isArray(payload?.[0]?.universe) || !Array.isArray(payload?.[1]))return [];
  return payload[0].universe.flatMap((asset,index)=>{
    const ctx=payload[1][index],price=Number(ctx?.midPx ?? ctx?.markPx),previous=Number(ctx?.prevDayPx);
    if(asset.isDelisted || !/^[a-z0-9:._/-]{1,64}$/i.test(asset.name || '') || !Number.isFinite(price) || price<=0)return [];
    const id=asset.name.includes(':')?asset.name:dex?dex+':'+asset.name:asset.name,ticker=id.split(':').at(-1);
    return [{id,ticker,group:!dex?'crypto':STOCKS.has(ticker)?'stocks':MACRO.has(ticker)?'macro':'other',price,previous:Number.isFinite(previous)&&previous>0?previous:null,change:previous>0?(price/previous-1)*100:null,volume:Number.isFinite(Number(ctx.dayNtlVlm))?Number(ctx.dayNtlVlm):null}];
  });
}
let cached,pending;
export async function overview(fetcher=fetch,now=Date.now) {
  if(cached && now()-cached.at<10000)return Response.json(cached.data,{headers:{'cache-control':'public,max-age=5'}});
  if(pending)return pending.then(data=>Response.json(data,{headers:{'cache-control':'public,max-age=5'}}));
  pending=(async()=>{
    const results=await Promise.allSettled(['','xyz'].map(async dex=>{
      const r=await fetcher('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'metaAndAssetCtxs',...(dex?{dex}:{})}),signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw Error('market upstream');return marketRows(await r.json(),dex);
    }));
    const markets=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
    if(!markets.length)throw Error('empty markets');
    const data={markets,observedAt:now(),source:'Hyperliquid mainnet perpetuals',partial:results.some(r=>r.status==='rejected')};
    cached={at:now(),data};return data;
  })();
  try{return Response.json(await pending,{headers:{'cache-control':'public,max-age=5'}});}
  catch{return Response.json({error:'实时行情暂不可用，请稍后刷新'},{status:502,headers:{'cache-control':'no-store'}});}
  finally{pending=null;}
}
