import {relatedScore,discoveryQuery,matchAssessment,marketTopic} from './prediction-discovery.js';
import {estimateDepth,sharesInput} from './prediction-core.js';
const KALSHI='https://api.elections.kalshi.com/trade-api/v2';
const noStore={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:noStore});
const text=(v,max=160)=>typeof v==='string'?v.slice(0,max):'';
const opts=()=>({retries:0,timeout:10000,signal:AbortSignal.timeout(12000)});
const idPattern=/^[a-zA-Z0-9_-]{1,180}$/;
// Workers rejects redirect:'error' before sending a request. Use manual mode
// for the SDK and direct reads alike, and reject 3xx without following them.
class ProviderDataError extends Error {constructor(code,status=null){super(code);this.code=code;this.status=status;}}
export function publicMarketFetch(fetchImpl){return async(input,init)=>{const result=await fetchImpl(input,{...init,redirect:'manual'});if(result.status>=300&&result.status<400)throw new ProviderDataError('redirect');return result;};}
async function publicClient(fetchImpl){const {createPublicClient}=await import('@polymarket/client');return createPublicClient({fetch:publicMarketFetch(fetchImpl)});}
async function json(url,fetchImpl){const r=await publicMarketFetch(fetchImpl)(url,{headers:{accept:'application/json',...(String(url).startsWith('https://gamma-api.polymarket.com/')?{'accept-encoding':'gzip'}:{})},signal:AbortSignal.timeout(4000)});if(!r.ok)throw new ProviderDataError('http',r.status);try{return await r.json();}catch(error){if(['TimeoutError','AbortError'].includes(error?.name))throw error;throw new ProviderDataError('format');}}
function safePrice(value){if(value==null||value==='')return null;const v=Number(value);return Number.isFinite(v)&&v>0&&v<1?String(value):null;}
function activePoly(m){return m?.state?.closed!==true&&m?.state?.archived!==true&&m?.state?.active!==false&&m?.state?.acceptingOrders===true;}
export function normalizePolymarket(m){if(!idPattern.test(String(m?.id||''))||!activePoly(m))return null;return {provider:'polymarket',id:String(m.id),question:text(m.question,400),description:text(m.description,8000),endDate:m.state.endDate||null,resolutionSource:text(m.resolution?.source,1000),volume:text(String(m.metrics?.volume24hr??''),40),volumeLabel:'24 小时成交量',currency:'平台抵押资产',network:'Polygon · 资产需按市场协议核验',chainId:137,protocol:m.version||'unknown',outcomes:['yes','no'].map(key=>({key,label:text(m.outcomes?.[key]?.label,100)||key.toUpperCase(),price:safePrice(m.outcomes?.[key]?.price)})),url:m.slug?'https://polymarket.com/event/'+encodeURIComponent(m.slug):'https://polymarket.com',execution:{enabled:false,reason:'选择结果后可在交易卡片核对网络、价格及买入条件'}};}
export function normalizeKalshi(m){if(!idPattern.test(String(m?.ticker||''))||m.status!=='active')return null;const price=(side)=>safePrice(m[side+'_ask_dollars']??(typeof m[side+'_ask']==='number'?String(m[side+'_ask']/100):null));return {provider:'kalshi',id:m.ticker,question:text(m.title,400),subtitle:text(m.yes_sub_title,300),description:[text(m.rules_primary,6000),text(m.rules_secondary,2000)].filter(Boolean).join('\n'),endDate:m.close_time||null,resolutionSource:'以该市场的结算规则为准',volume:text(String(m.volume_24h_fp??m.volume_24h??''),40),volumeLabel:'24 小时成交合约数',currency:'USD · Kalshi 账户',network:'平台账户，非链上钱包余额',chainId:null,protocol:'kalshi',outcomes:['yes','no'].map(key=>({key,label:key==='yes'?(text(m.yes_sub_title,100)||'YES'):'NO',price:price(key)})),url:'https://kalshi.com/markets/'+encodeURIComponent((m.event_ticker||m.ticker).toLowerCase()),execution:{enabled:false,reason:'需要 Kalshi 账户与交易授权；当前只接公共市场数据'}};}
async function searchPoly(query,client){const page=await client.search({q:query,pageSize:6,eventsStatus:'active',keepClosedMarkets:0,searchProfiles:false,searchTags:false},opts()).firstPage();const seen=new Set(),markets=[];for(const event of page.items.events||[])for(const raw of event.markets||[]){const m=normalizePolymarket(raw);if(m&&!seen.has(m.id)){seen.add(m.id);markets.push(m);}}return {provider:'polymarket',markets:markets.slice(0,12),coverage:page.hasMore?'关键词搜索首批结果，仍有更多盘口':'关键词搜索返回结果',partial:!!page.hasMore};}
async function searchKalshi(query,fetchImpl){let cursor='',scanned=0,rows=[];for(let i=0;i<3;i++){const params=new URLSearchParams({status:'open',limit:'100',mve_filter:'exclude'});if(cursor)params.set('cursor',cursor);const payload=await json(KALSHI+'/markets?'+params,fetchImpl);if(!Array.isArray(payload.markets))throw Error('平台返回的市场格式无效');scanned+=payload.markets.length;rows.push(...payload.markets);cursor=typeof payload.cursor==='string'?payload.cursor:'';if(!cursor)break;}const terms=query.toLowerCase().split(/\s+/).filter(Boolean);const seen=new Set(),markets=[];for(const raw of rows){const hay=[raw.ticker,raw.title,raw.subtitle,raw.yes_sub_title].join(' ').toLowerCase();if(!terms.every(word=>hay.includes(word)))continue;const m=normalizeKalshi(raw);if(m&&!seen.has(m.id)){seen.add(m.id);markets.push(m);}}return {provider:'kalshi',markets:markets.slice(0,12),coverage:'已检索 '+scanned+' 个开放盘口'+(cursor?'，不是全站搜索':''),partial:!!cursor||markets.length>12};}
function providerFailure(error){
 const status=Number(error?.status??error?.statusCode),timedOut=[error,error?.cause].some(e=>['TimeoutError','AbortError'].includes(e?.name)),code=timedOut?'timeout':error?.code==='redirect'?'redirect':status===429?'rate_limit':status>=400&&status<=599?'http':error?.code==='format'||error?.name==='SyntaxError'?'format':'connection';
 const message={timeout:'平台响应超时，请重试',redirect:'平台接口地址异常，请稍后重试',rate_limit:'平台请求过于频繁，请稍后重试',http:'平台接口暂不可用'+(Number.isInteger(status)?'（HTTP '+status+'）':''),format:'平台返回的数据格式异常，请稍后重试',connection:'平台连接失败，请重试'}[code];
 return {error:message,errorCode:code,...(Number.isInteger(status)&&status>=400&&status<=599?{upstreamStatus:status}:{})};
}
export async function searchPredictions(query,{fetchImpl=fetch,client,legacyProviders=false}={}){if(typeof query!=='string'||!query.trim()||query.length>120)throw Error('请输入 1–120 字的事件关键词');query=query.trim();const tasks=[async()=>searchPoly(query,client||await publicClient(fetchImpl))];if(legacyProviders)tasks.push(()=>searchKalshi(query,fetchImpl));const result=await Promise.allSettled(tasks.map(task=>task()));return {query,at:new Date().toISOString(),executionEnabled:false,scope:legacyProviders?'legacy-research':'polymarket-only',providers:result.map((r,i)=>r.status==='fulfilled'?r.value:{provider:i?'kalshi':'polymarket',markets:[],...providerFailure(r.reason),coverage:'本次未获取到数据',partial:true})};}
export async function predictionQuote({provider,id,outcome,shares},{fetchImpl=fetch,client}={}){
 if(!['polymarket','kalshi'].includes(provider)||!idPattern.test(id||'')||!['yes','no'].includes(outcome))throw Error('请选择有效的市场和结果');sharesInput(shares);
 let market,levels,minimum='0',sourceTime=null;
 if(provider==='polymarket'){client ||=await publicClient(fetchImpl);const raw=await client.fetchMarket({id},opts());market=normalizePolymarket(raw);if(!market||market.id!==id)throw Error('市场已关闭或不可报价');const result=raw.outcomes[outcome],assetId=raw.version==='v2'?result.positionId:raw.version==='v1'?result.tokenId:null;if(!assetId)throw Error('市场协议或交易资产尚未识别，无法安全报价');const book=await client.fetchOrderBook({assetId},opts());if(String(book.assetId)!==String(assetId)||!raw.conditionId||String(book.conditionId).toLowerCase()!==String(raw.conditionId).toLowerCase())throw Error('盘口资产与所选市场不匹配');levels=book.asks;minimum=String(book.minOrderSize);sourceTime=book.timestamp==null?null:Number(book.timestamp);
 }else{const raw=(await json(KALSHI+'/markets/'+encodeURIComponent(id),fetchImpl)).market;market=normalizeKalshi(raw);if(!market||market.id!==id)throw Error('市场已关闭或不可报价');const payload=await json(KALSHI+'/markets/'+encodeURIComponent(id)+'/orderbook?depth=100',fetchImpl);const opposite=outcome==='yes'?'no':'yes',decimalBook=payload.orderbook_fp?.[opposite+'_dollars'],legacy=payload.orderbook?.[opposite];if(!Array.isArray(decimalBook)&&!Array.isArray(legacy))throw Error('平台返回的盘口格式无效');levels=Array.isArray(decimalBook)?decimalBook.map(([price,size])=>({price:complement(price),size:String(size)})):legacy.map(([cents,size])=>{if(!Number.isInteger(cents)||cents<=0||cents>=100)throw Error('盘口价格无效');return {price:String((100-cents)/100),size:String(size)};});minimum='1';}
 const at=Date.now(),estimate=estimateDepth(levels,shares,{minimum,wholeContracts:provider==='kalshi'}),stale=sourceTime==null||!Number.isFinite(sourceTime)||sourceTime>at+5000||sourceTime<at-30000;
 return {market,outcome,...estimate,currency:market.currency,sourceTime,receivedAt:at,expiresAt:at+30000,sourceStale:stale,quoteType:'depth-subtotal',executionEnabled:false,reason:stale?'盘口时间未核实或较旧；仅供研究，未生成订单':estimate.reason};
}
function complement(value){const s=String(value);if(!/^0\.\d{1,6}$/.test(s))throw Error('盘口价格无效');const v=BigInt(s.slice(2).padEnd(6,'0'));if(v<=0n||v>=1000000n)throw Error('盘口价格无效');const n=1000000n-v;return '0.'+n.toString().padStart(6,'0');}

const GAMMA='https://gamma-api.polymarket.com';
export function normalizeDiscoveryMarket(raw,event={}){
 const parse=v=>{try{return Array.isArray(v)?v:JSON.parse(v);}catch{return [];}};
 const labels=parse(raw.outcomes),prices=parse(raw.outcomePrices);
 if(labels.length!==2||String(labels[0]).toLowerCase()!=='yes'||String(labels[1]).toLowerCase()!=='no')return null;
 const market=normalizePolymarket({id:raw.id,question:raw.question,description:raw.description,slug:event.slug||raw.slug,version:raw.version,
  state:{active:raw.active,closed:raw.closed,archived:raw.archived,acceptingOrders:raw.acceptingOrders,endDate:raw.endDate},
  metrics:{volume24hr:raw.volume24hr},outcomes:{yes:{label:labels[0],price:prices[0]},no:{label:labels[1],price:prices[1]}},resolution:{source:raw.resolutionSource}});
 return market?{...market,eventTitle:text(event.title,400),eventId:String(event.id||raw.id),topic:marketTopic([event.title,raw.question,...(Array.isArray(event.tags)?event.tags.map(t=>t.label):[])].join(' '))}:null;
}
let discoveryCache=null,discoveryAt=0;
export async function discoverPredictions({fetchImpl=fetch,now=Date.now()}={}){
 if(fetchImpl===fetch&&discoveryCache&&now-discoveryAt<45000)return discoveryCache;
 const events=await json(GAMMA+'/events?'+new URLSearchParams({active:'true',closed:'false',archived:'false',order:'volume24hr',ascending:'false',limit:'100'}),fetchImpl);
 if(!Array.isArray(events))throw new ProviderDataError('format');
 const markets=[],seen=new Set();
 for(const event of events){if(event.closed||event.archived||event.active===false)continue;
  const candidates=(event.markets||[]).filter(raw=>Number(raw.bestAsk)>0&&Number(raw.bestAsk)<1&&raw.enableOrderBook!==false&&!/:.*\bO\/U\b/i.test(raw.question||'')).map(raw=>normalizeDiscoveryMarket(raw,event)).filter(m=>m&&Number.isFinite(Date.parse(m.endDate))&&Date.parse(m.endDate)>now).sort((a,b)=>Number(b.volume||0)-Number(a.volume||0));
  const m=candidates[0];if(m&&!seen.has(m.id)){seen.add(m.id);markets.push(m);}
 }
 const groups=new Map();for(const m of markets){const group=groups.get(m.topic)||[];if(group.length<6)group.push(m);groups.set(m.topic,group);}const diverse=[];for(let i=0;i<6;i++)for(const group of groups.values())if(group[i])diverse.push(group[i]);
 const payload={version:'prediction-discovery-v1',at:new Date(now).toISOString(),refreshAfterSeconds:60,source:'Polymarket',coverage:'按 24 小时活跃度读取前 100 个事件，每事件一个开放二元盘口，排除已到期、无卖价及球员大小分盘口；不是全站或投资推荐',markets:diverse.slice(0,24)};
 if(fetchImpl===fetch){discoveryCache=payload;discoveryAt=now;}return payload;
}
async function kalshiRelated(source,fetchImpl){
 const query=discoveryQuery(source);
 const catalog=await json(KALSHI+'/series',fetchImpl);
 if(!Array.isArray(catalog.series))throw new ProviderDataError('format');
 const series=catalog.series.filter(s=>idPattern.test(s.ticker||'')).map(s=>({s,score:relatedScore(query,[s.title,s.ticker,...(Array.isArray(s.tags)?s.tags:[])].join(' '))})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
 if(!series.length)return searchKalshi(query.split(' ')[0],fetchImpl);
 const settled=await Promise.allSettled(series.map(async({s})=>{const p=await json(KALSHI+'/markets?'+new URLSearchParams({status:'open',limit:'100',series_ticker:s.ticker,mve_filter:'exclude'}),fetchImpl);if(!Array.isArray(p.markets))throw new ProviderDataError('format');return p;}));
 const good=settled.filter(r=>r.status==='fulfilled').map(r=>r.value);
 if(!good.length)throw settled[0].reason;
 const markets=[...new Map(good.flatMap(p=>p.markets).map(normalizeKalshi).filter(Boolean).map(m=>[m.id,m])).values()].map(m=>({m,score:relatedScore(source.question+' '+(source.eventTitle||''),m.question+' '+m.subtitle)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(r=>r.m);
 return {provider:'kalshi',markets,partial:true,coverage:'检索最多 3 个相关系列、每系列前 100 个开放盘口；未匹配不代表全站没有'};
}
export async function comparePredictions({provider,id,outcome='yes',shares='10'},{fetchImpl=fetch,client}={}){
 if(!['polymarket','kalshi'].includes(provider)||!idPattern.test(id||'')||!['yes','no'].includes(outcome))throw Error('请选择有效的市场和结果');sharesInput(shares);
 let source;
 if(provider==='polymarket'){client ||=await publicClient(fetchImpl);source=normalizePolymarket(await client.fetchMarket({id},opts()));}
 else source=normalizeKalshi((await json(KALSHI+'/markets/'+encodeURIComponent(id),fetchImpl)).market);
 if(!source||source.id!==id)throw Error('请选择仍在开放的盘口');
 const other=provider==='polymarket'?'kalshi':'polymarket';let result;
 try{result=other==='kalshi'?await kalshiRelated(source,fetchImpl):await searchPoly(discoveryQuery(source),client||await publicClient(fetchImpl));}
 catch(error){result={provider:other,markets:[],partial:true,coverage:'本次未获取到数据',...providerFailure(error)};}
 result.markets=result.markets.map(m=>({...m,match:matchAssessment(source,m)})).sort((a,b)=>relatedScore(source.question,b.question)-relatedScore(source.question,a.question)).slice(0,3);
 return {version:'prediction-discovery-v1',at:new Date().toISOString(),source:{...source,match:matchAssessment(source,source)},outcome,shares,
  equivalenceVerified:false,providers:[{provider,markets:[{...source,match:matchAssessment(source,source)}],coverage:'所选原始盘口'},result]};
}

export async function predictionRoute(request,options={}){const url=new URL(request.url);if(request.method!=='GET')return response({error:'此接口只读取市场数据，不接受订单'},405);try{if(url.pathname==='/api/predictions/discover')return response(await discoverPredictions(options));if(url.pathname==='/api/predictions/compare')return response({error:'当前版本仅支持 Polymarket，请直接选择事件买入',scope:'polymarket-only'},410);if(url.pathname==='/api/predictions/search'){const payload=await searchPredictions(url.searchParams.get('q'),{...options,legacyProviders:false});return response(payload,payload.providers.every(p=>p.error)?502:200);}if(url.pathname==='/api/predictions/quote'){if(url.searchParams.get('provider')==='kalshi')return response({error:'当前版本仅支持 Polymarket'},410);return response(await predictionQuote(Object.fromEntries(url.searchParams),options));}return response({error:'预测市场接口不存在'},404);}catch(error){if(url.pathname==='/api/predictions/discover')return response({...providerFailure(error),markets:[]},502);return response({error:/请输入|请选择|金额格式|整数合约/.test(error.message)?error.message:'盘口暂不可用，请刷新或选择其他市场'},400);}}
