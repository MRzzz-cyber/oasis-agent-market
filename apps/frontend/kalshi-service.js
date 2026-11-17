import {account,reserveKalshiSubmission} from './auth.js';
import {predictionQuote} from './prediction-markets.js';
import {KALSHI_HOSTS,KALSHI_PATH,environment,marketId,quantity,kalshiPreview,checkKalshiQuote,checkKalshiOrder} from './kalshi-core.js';
const send=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const allowed={balance:'/portfolio/balance',positions:'/portfolio/positions',orders:'/portfolio/orders',fills:'/portfolio/fills',submit:'/portfolio/events/orders'};
const fail=(condition,message)=>{if(!condition)throw Error(message);};
async function boundedBody(request){const reader=request.body?.getReader();fail(reader,'请求内容为空');let size=0,chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw Error('请求内容过大');}chunks.push(value);}}finally{reader.releaseLock();}const joined=new Uint8Array(size);let offset=0;for(const value of chunks){joined.set(value,offset);offset+=value.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}
function authHeaders(auth,now=Date.now()){
 fail(auth&&Object.keys(auth).length===3&&/^[0-9a-f-]{36}$/i.test(auth.keyId||'')&&/^\d{13}$/.test(auth.timestamp||'')&&Math.abs(now-Number(auth.timestamp))<15000&&typeof auth.signature==='string'&&auth.signature.length<=800&&/^[A-Za-z0-9+/]+={0,2}$/.test(auth.signature),'Kalshi 认证无效或已过期');
 return {'KALSHI-ACCESS-KEY':auth.keyId,'KALSHI-ACCESS-TIMESTAMP':auth.timestamp,'KALSHI-ACCESS-SIGNATURE':auth.signature};
}
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function publicJSON(url,fetchImpl){const r=await fetchImpl(url,{headers:{accept:'application/json','accept-encoding':'gzip'},redirect:'manual',signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw Error('Kalshi 公共接口暂不可用');return r.json();}
export async function prepareKalshi({ticker,outcome,count,mode='production'},{fetchImpl=fetch,now=Date.now()}={}){
 environment(mode);marketId(ticker);quantity(count);const base=KALSHI_HOSTS[mode]+KALSHI_PATH;
 const market=(await publicJSON(base+'/markets/'+encodeURIComponent(ticker),fetchImpl)).market;
 fail(market?.ticker===ticker&&/^[A-Za-z0-9_-]{1,180}$/.test(market.event_ticker||''),'Kalshi 盘口身份未匹配');
 const [event,status,estimate]=await Promise.all([
 publicJSON(base+'/events/'+encodeURIComponent(market.event_ticker),fetchImpl),
 publicJSON(base+'/exchange/status',fetchImpl),
 predictionQuote({provider:'kalshi',id:ticker,outcome,shares:count},{fetchImpl:(input,init)=>{const url=new URL(input);fail(['api.elections.kalshi.com','external-api.kalshi.com'].includes(url.hostname),'平台地址无效');return fetchImpl(KALSHI_HOSTS[mode]+url.pathname+url.search,{...init,cache:'no-store'});}})
 ]);
 fail(status.exchange_active===true&&status.trading_active===true,'Kalshi 当前暂停交易');
 const seriesId=event.event?.series_ticker;marketId(seriesId);const series=(await publicJSON(base+'/series/'+encodeURIComponent(seriesId),fetchImpl)).series;fail(series?.ticker===seriesId,'Kalshi 系列身份未匹配');
 return kalshiPreview({market,estimate,series,outcome,count,mode,now});
}
export async function kalshiService(request,env,{fetchImpl=fetch,getAccount=account,reserve=reserveKalshiSubmission,now=Date.now}={}){
 const url=new URL(request.url);if(url.pathname==='/api/kalshi/status'&&request.method==='GET')return send({version:'kalshi-api-v1',credentials:'per-user-browser-session',keyTypes:['Ed25519','RSA-PSS'],walletBalance:false,orderType:'fill_or_kill',maximumSpend:'1000 USD',configured:!!env.ACCOUNTS});
 if(url.pathname==='/api/kalshi/preview'&&request.method==='GET'){try{return send(await prepareKalshi({ticker:url.searchParams.get('ticker'),outcome:url.searchParams.get('outcome'),count:url.searchParams.get('count'),mode:url.searchParams.get('environment')||'production'},{fetchImpl,now:now()}));}catch(error){return send({error:error.message||'Kalshi 报价暂不可用'},400);}}
 if(url.pathname!=='/api/kalshi/account'||request.method!=='POST')return send({error:'接口不存在',submitted:false},404);
 if(request.headers.get('origin')!==url.origin)return send({error:'只允许同源请求',submitted:false},403);
 let user;try{const current=await getAccount(request,env);if(!current.ok)return current;user=await current.json();if(!user.active)return send({error:'请先激活账号',submitted:false},403);}catch{return send({error:'请先使用 Google 登录',submitted:false},401);}
 let packet;try{packet=await boundedBody(request);fail(packet&&['environment','resource','auth','query','review','order','balanceAuth'].every(k=>Object.hasOwn(packet,k)||!['environment','resource','auth'].includes(k))&&Object.keys(packet).every(k=>['environment','resource','auth','query','review','order','balanceAuth'].includes(k)),'请求字段无效');environment(packet.environment);fail(Object.hasOwn(allowed,packet.resource),'Kalshi 接口未开放');authHeaders(packet.auth,now());}catch{return send({error:'Kalshi 请求格式或认证无效',submitted:false},400);}
 const {resource,environment:mode,auth}=packet,base=KALSHI_HOSTS[mode]+KALSHI_PATH,path=allowed[resource],method=resource==='submit'?'POST':'GET';let body,submitted=false;
 try{
  const headers={...authHeaders(auth,now()),accept:'application/json'};
  let query=new URLSearchParams();
  if(resource!=='submit'){
   fail(!packet.review&&!packet.order&&!packet.balanceAuth,'只读请求不能包含订单');
   const q=packet.query||{};fail(Object.keys(q).every(k=>['exchange_index','ticker','cursor','limit','order_id'].includes(k)),'查询字段未开放');
   if(q.exchange_index!=null){fail(Number.isInteger(q.exchange_index)&&q.exchange_index>=0&&q.exchange_index<=1024,'交易分区无效');query.set('exchange_index',q.exchange_index);}
   if(q.ticker)query.set('ticker',marketId(q.ticker));if(q.order_id){fail(resource==='fills'&&/^[0-9a-f-]{36}$/i.test(q.order_id),'成交查询订单号无效');query.set('order_id',q.order_id);}
   if(q.cursor){fail(typeof q.cursor==='string'&&q.cursor.length<=500,'游标无效');query.set('cursor',q.cursor);}
   query.set('subaccount','0');if(resource!=='balance')query.set('limit',resource==='fills'?'1000':'100');
  }else{
   fail(!packet.query,'交易请求不能覆盖查询参数');checkKalshiQuote(packet.review,now());fail(packet.review.environment===mode,'Kalshi 环境已变化');body=checkKalshiOrder(packet.order,packet.review,now());
   const fresh=await prepareKalshi({ticker:packet.review.ticker,outcome:packet.review.outcome,count:packet.review.count,mode},{fetchImpl,now:now()});
   fail(fresh.exchangeIndex===packet.review.exchangeIndex&&BigInt(fresh.limitAtomic)<=BigInt(packet.review.limitAtomic)&&BigInt(fresh.feeReserveAtomic)===BigInt(packet.review.feeReserveAtomic),'价格或费率已变化，请重新确认');
   fail(packet.balanceAuth?.keyId===auth.keyId,'余额和交易账号不匹配');
   const b=await fetchImpl(base+allowed.balance+'?'+new URLSearchParams({exchange_index:String(packet.review.exchangeIndex),subaccount:'0'}),{headers:authHeaders(packet.balanceAuth,now()),redirect:'manual',signal:AbortSignal.timeout(10000),cache:'no-store'});
   fail(b.ok,'Kalshi 余额认证未通过');const balance=await b.json();fail(Number.isSafeInteger(balance.balance)&&balance.balance>=0&&BigInt(balance.balance)*10000n>=BigInt(packet.review.maxSpendAtomic),'Kalshi 交易分区的 USD 余额不足');
   const result=await reserve(request,env,{fingerprint:await hash(mode+auth.keyId+auth.signature),clientKey:await hash(mode+auth.keyId+body.client_order_id),bodyHash:await hash(JSON.stringify(body))});
   if(!result.ok)return send({error:'原请求已保留，请核对订单，不能重复提交',submitted:true},409);headers['content-type']='application/json';
  }
  if(resource==='submit'){checkKalshiQuote(packet.review,now());authHeaders(auth,now());submitted=true;}
  let upstream;try{upstream=await fetchImpl(base+path+(query.size?'?'+query:''),{method,headers,body:body?JSON.stringify(body):undefined,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{return send({error:'Kalshi 响应中断，请核对原订单',submitted},502);}
  if(upstream.status>=300&&upstream.status<400)return send({error:'Kalshi 返回重定向，请核对原请求',submitted},502);
  let payload;try{payload=await upstream.json();}catch{return send({error:'Kalshi 返回格式异常，请核对原请求',submitted},502);}
  if(!upstream.ok){const definitive=[400,401,403,404].includes(upstream.status);return send({error:'Kalshi 请求未通过，请核对权限、余额或盘口',code:typeof payload?.code==='string'?payload.code.slice(0,80):'upstream_error',submitted:submitted&&!definitive},upstream.status>=500?502:upstream.status);}
  if(resource==='balance')return send({balance:payload.balance,portfolio_value:payload.portfolio_value,environment:mode,currency:'USD',exchangeIndex:packet.query?.exchange_index??null});
  if(resource==='positions')return send({market_positions:Array.isArray(payload.market_positions)?payload.market_positions.slice(0,100):[],cursor:payload.cursor||null});
  if(resource==='fills')return send({fills:Array.isArray(payload.fills)?payload.fills.slice(0,1000):[],cursor:payload.cursor||null});
  if(resource==='orders')return send({orders:Array.isArray(payload.orders)?payload.orders.slice(0,100):[],cursor:payload.cursor||null});
  return send({receipt:payload,submitted:true},201);
 }catch(error){return send({error:error.message||'Kalshi 请求未完成',submitted},400);}
}
