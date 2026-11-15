// Read-only same-origin quote proxy. Exchange freshness uses server time, not the user's clock.
export async function testnetBook(request,fetcher=fetch,now=Date.now) {
  const coin=new URL(request.url).searchParams.get("coin");
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
  if(!/^@\d{1,6}$/.test(coin || ""))return json({error:"无效测试网现货交易对"},400);
  try {
    const info=async(body)=>{
      const response=await fetcher("https://api.hyperliquid-testnet.xyz/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error("upstream "+response.status);
      return response.json();
    };
    const [book,context]=await Promise.all([info({type:"l2Book",coin}),info({type:"spotMetaAndAssetCtxs"})]);
    // Contexts may have sparse IDs; find by coin rather than metadata position.
    const markPx=Array.isArray(context?.[1])?context[1].find(item=>item.coin===coin)?.markPx:null;
    if(!/^\d+(?:\.\d{1,8})?$/.test(String(markPx)) || Number(markPx)<=0)return json({error:"测试网参考价格不可用，无法核对最低交易金额"},502);
    if(book?.coin!==coin || !Array.isArray(book.levels) || !Number.isFinite(book.time))return json({error:"测试网盘口数据或时间戳异常"},502);
    return json({...book,markPx,checkedAt:now()});
  }catch{return json({error:"测试网报价暂时无法连接，请稍后重试"},502);}
}
