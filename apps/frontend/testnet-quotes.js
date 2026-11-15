// Read-only same-origin quote proxy. Exchange freshness uses server time, not the user's clock.
export async function testnetBook(request,fetcher=fetch,now=Date.now) {
  const coin=new URL(request.url).searchParams.get("coin");
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
  if(!/^@\d{1,6}$/.test(coin || ""))return json({error:"无效测试网现货交易对"},400);
  try {
    const response=await fetcher("https://api.hyperliquid-testnet.xyz/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"l2Book",coin}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)return json({error:"测试网报价接口返回 "+response.status},502);
    const book=await response.json();
    if(book?.coin!==coin || !Array.isArray(book.levels) || !Number.isFinite(book.time))return json({error:"测试网盘口数据或时间戳异常"},502);
    return json({...book,checkedAt:now()});
  }catch{return json({error:"测试网报价暂时无法连接，请稍后重试"},502);}
}
