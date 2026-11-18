// Public GET-only diagnostics. Never signs in or accesses a wallet.
const origin='https://oasistrade.app';
async function read(url){
 const start=Date.now();
 try{const r=await fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(25000)}),body=await r.text();let data;try{data=JSON.parse(body);}catch{}
 console.log(JSON.stringify({url,status:r.status,type:r.headers.get('content-type'),ray:r.headers.get('cf-ray'),ms:Date.now()-start,bytes:body.length,...(data?.providers?{providers:data.providers.map(p=>({provider:p.provider,count:p.markets?.length,error:p.error,errorCode:p.errorCode,upstreamStatus:p.upstreamStatus}))}:Array.isArray(data?.markets)?{markets:data.markets.length,at:data.at}:data?{body:JSON.stringify(data).slice(0,1000)}:{body:body.slice(0,1000)})}));
 }catch(e){console.log(JSON.stringify({url,error:e.name,message:e.message,ms:Date.now()-start}));}
}
for(let i=0;i<3;i++)for(const path of ['/api/release','/api/predictions/discover','/api/predictions/search?q=Bitcoin','/api/predictions/search?q=NBA','/api/predictions/search?q=Fed'])await read(origin+path);
await read('https://gamma-api.polymarket.com/public-search?'+new URLSearchParams({q:'Bitcoin',limit_per_type:'6',events_status:'active',keep_closed_markets:'0',search_profiles:'false',search_tags:'false'}));
