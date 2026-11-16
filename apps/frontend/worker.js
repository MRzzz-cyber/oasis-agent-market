import {mainnetQuote} from './mainnet-quote.js';
import {harnessMetricsRoute,observeHarnessRequest} from './harness-metrics.js';
export {HarnessMetricsStore} from './harness-metrics.js';
import {predictionRoute} from './prediction-markets.js';
import {privyRoute} from './privy-auth.js';
import {overview} from './market-overview.js';
import {testnetBook} from './testnet-quotes.js';
import {snapshot,marketCatalog} from './candles.js';
import {account,authRoute,googleMode} from './auth.js';
import {advisorRequest,normalizeAdvisorStream} from './advisor-stream.js';
export {AccountStore} from './auth.js';
const SYSTEM_PROMPT=[
 '预测市场已接入独立的盘口研究卡片。用户提到预测市场、Polymarket 或 Kalshi 时引导查看该卡片；目前只开放公共盘口搜索和相同份额卖盘成本估计，不支持站内签名买入。没有实时工具结果不能编造盘口或推荐胜率。不能把相似标题认定为相同事件；必须核对结算规则、截止时间和结果定义。手续费和跨链费未知时，不能声称总成本最低。不要把预测盘口购买解释为 ETH 兑换，也不能将 Arbitrum USDC 当成其他平台可用余额。',
 '你是 Oasis 中文 AI 交易助手。当前真实购买入口是 Arbitrum One 钱包直接兑换：使用当前 Rabby、MetaMask 或已有 Oasis 钱包中的原生 USDC，通过 Uniswap V3 直连 USDC/WETH 池兑换并解包为 ETH，ETH 回到同一个钱包。',
 '购买流程：选择金额，核对网络与价格，点击购买，在钱包确认，查看回执。只需要钱包余额和用于网络费的少量 ETH，不需要 Hyperliquid 余额、充值、划转、API 会话或交易代理。不把旧 Hyperliquid UETH 报价当作当前兑换报价。',
 '首次如果 USDC 额度不足，需要用户在钱包确认两笔交易：仅授权本次金额，再确认兑换。已有足够额度就只确认兑换。不能承诺首次只有一个钱包弹窗，不申请无限额度。界面固定 0.5% 滑点保护，展示预计 ETH、最低 ETH、网络费和同钱包收款地址。',
 '用户想买 ETH 时减少追问，有明确金额就进入站内钱包报价；可选 1 USDC 小额交易、10 USDC 或自定义金额。不要反复要求周期、数据服务预算或先保存策略。不要增加预算。金额变化需要重新报价与用户确认。',
 '余额不足指钱包原生 USDC 或网络费 ETH 不足。没有工具数据不能编造余额、连接状态或成交。不要再引导用户先转入 Hyperliquid；不要要求打开资金管理、勾选复选框或单独授权会话。',
 '报价过期、网络或钱包变化、价格低于最低到账要求时停止提交，让用户重新核对。模型不能代点购买或签名。只根据链上回执说明成交，纯对话不能宣称已执行订单；不能把旧测试资金、签名或记录转换为主网交易。',
 '用户只研究行情或概念时直接回答并注明数据来源、市场类型与时间，区分事实和推测；永续价格不能当作钱包现货成交价。用户取消或暂不买入时停止引导交易。回答简洁，每次最多追问一个必要信息，不编造报价、收益、投票或回执，不索要私钥或 API Key，不承诺收益。'
].join('\n');
const OPENROUTER_MODELS_URL='https://openrouter.ai/api/v1/models',OPENROUTER_CHAT_URL='https://openrouter.ai/api/v1/chat/completions',MODEL_CACHE_TTL_MS=5*60*1000;
let modelCache=null,modelCacheAt=0;
function respond(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});}
export function validateChatInput(value){if(!value||typeof value!=='object'||!Array.isArray(value.messages))throw Error('请输入有效对话');if(typeof value.model!=='string'||!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i.test(value.model)||value.model.length>180)throw Error('请选择有效的 OpenRouter 模型');if(value.messages.length<1||value.messages.length>12)throw Error('一次最多发送 12 条历史消息');const messages=value.messages.map(item=>{if(!item||!['user','assistant'].includes(item.role)||typeof item.content!=='string')throw Error('对话格式无效');const content=item.content.trim(),limit=item.role==='assistant'?12000:2000;if(!content||content.length>limit)throw Error('消息过长：用户最多 2000 字，模型回复最多 12000 字');return {role:item.role,content};});if(messages.reduce((sum,item)=>sum+item.content.length,0)>20000)throw Error('对话历史过长，请开始新对话');if(messages.at(-1).role!=='user')throw Error('最后一条必须是用户消息');return {model:value.model,messages};}
function pricePerMillion(value){if(value==null||value==='')return null;const price=Number(value);return Number.isFinite(price)&&price>=0?price*1000000:null;}
export function normalizeOpenRouterModels(payload){const rows=Array.isArray(payload?.data)?payload.data:[];return rows.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string').filter(item=>{const inputs=item.architecture?.input_modalities,outputs=item.architecture?.output_modalities;return (!Array.isArray(inputs)||inputs.includes('text'))&&(!Array.isArray(outputs)||outputs.includes('text'));}).map(item=>({id:item.id,name:item.name,description:typeof item.description==='string'?item.description.slice(0,240):'',contextLength:Number.isFinite(item.context_length)?item.context_length:null,inputPricePerMillion:pricePerMillion(item.pricing?.prompt),outputPricePerMillion:pricePerMillion(item.pricing?.completion),isFree:pricePerMillion(item.pricing?.prompt)===0&&pricePerMillion(item.pricing?.completion)===0,created:Number.isFinite(item.created)?item.created:0,provider:item.id.split('/')[0]})).sort((a,b)=>b.created-a.created||a.name.localeCompare(b.name)).slice(0,2000);}
export async function fetchOpenRouterModels({fetchImpl=fetch,forceRefresh=false}={}){if(!forceRefresh&&modelCache&&Date.now()-modelCacheAt<MODEL_CACHE_TTL_MS)return modelCache;const response=await fetchImpl(OPENROUTER_MODELS_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('OpenRouter 模型目录暂时不可用（HTTP '+response.status+'）');const models=normalizeOpenRouterModels(await response.json());if(!models.length)throw Error('OpenRouter 暂未返回可用的文本模型');modelCache=models;modelCacheAt=Date.now();return models;}
export async function streamOpenRouterChat({model,messages,env,fetchImpl=fetch}){
 const key=env.OPENROUTER_API_KEY;if(!key)return respond({error:'OpenRouter API Key 未配置，请在 Cloudflare Workers 的 Secrets 中添加 OPENROUTER_API_KEY'},503);
 let upstream;try{upstream=await fetchImpl(OPENROUTER_CHAT_URL,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json','HTTP-Referer':'https://oasis-agent-market.zqsanjingshou.workers.dev','X-Title':'Oasis AI'},body:JSON.stringify(advisorRequest({model,messages,system:SYSTEM_PROMPT})),signal:AbortSignal.timeout(90000)});}catch(error){return respond({error:error?.name==='TimeoutError'?'OpenRouter 模型响应超时':'OpenRouter 连接失败，请稍后重试'},502);}
 if(!upstream.ok){let detail='HTTP '+upstream.status;try{const payload=await upstream.json();detail=payload?.error?.message||detail;}catch{}const safeDetail=upstream.status===401?'API Key 不正确或已失效':upstream.status===402?'OpenRouter 账户余额不足':upstream.status===404?'模型暂不可用，请重新选择模型':upstream.status===429?'请求频率或模型额度已达上限':upstream.status>=500?'模型供应商暂时不可用':detail.slice(0,180);return respond({error:'OpenRouter 调用失败：'+safeDetail},upstream.status===429?429:502);}
 if(!upstream.body)return respond({error:'OpenRouter 未返回流式响应'},502);return new Response(normalizeAdvisorStream(upstream),{status:200,headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform',connection:'keep-alive','x-accel-buffering':'no'}});
}
async function secureEqual(a,b){const encoder=new TextEncoder(),[x,y]=await Promise.all([a,b].map(v=>crypto.subtle.digest('SHA-256',encoder.encode(v)))),left=new Uint8Array(x),right=new Uint8Array(y);let mismatch=0;for(let i=0;i<left.length;i++)mismatch|=left[i]^right[i];return mismatch===0;}
export default {async fetch(request,env,ctx){const url=new URL(request.url);
 if(['/api/harness/events','/api/admin/metrics','/api/admin/metrics/prometheus'].includes(url.pathname))return harnessMetricsRoute(request,env);
 if(['/admin','/admin/','/admin.html'].includes(url.pathname)){if(request.method!=='GET')return respond({error:'后台页面只支持 GET'},405);const asset=await env.ASSETS.fetch(new Request(new URL('/admin.html',url),request)),headers=new Headers(asset.headers);headers.set('cache-control','no-store');headers.set('x-frame-options','DENY');headers.set('referrer-policy','no-referrer');headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");return new Response(asset.body,{status:asset.status,headers});}
 if(url.pathname==='/api/release'&&request.method==='GET')return respond({version:'native-mainnet-v15-20261116',purchaseFlow:'arbitrum-wallet-swap-v17',purchaseUI:'wallet-card-v18',predictionResearch:'prediction-v1',predictionTrading:false,observability:'harness-metrics-v1',execution:'arbitrum-uniswap-v3',inputBalance:'wallet',defaultTestBudget:'20'});
 if(url.pathname.startsWith('/api/predictions/'))return observeHarnessRequest(request,env,ctx,url.pathname.endsWith('/quote')?'prediction_quote':'prediction_search',()=>predictionRoute(request));
 if(url.pathname==='/api/mainnet/quote')return mainnetQuote(request);
 if(url.pathname==='/api/testnet/book'&&request.method==='GET')return testnetBook(request);
 if(url.pathname==='/api/market/overview'&&request.method==='GET')return overview();
 if(url.pathname==='/api/market/catalog'&&request.method==='GET')return marketCatalog();
 if(url.pathname==='/api/market/candles'&&request.method==='GET')return snapshot(request);
 if(url.pathname.startsWith('/api/wallet/')||url.pathname==='/.well-known/jwks.json')return privyRoute(request,env);
 if(url.pathname.startsWith('/api/auth/'))return authRoute(request,env);
 if(!url.pathname.startsWith('/api/')){const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);headers.set('cache-control','no-store');headers.set('x-oasis-release','native-mainnet-v15-20261116');headers.set('x-oasis-purchase-flow','arbitrum-wallet-swap-v17');if(url.pathname.startsWith('/privy-setup')){headers.set('referrer-policy','no-referrer');headers.set('x-frame-options','DENY');headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");}return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});}
 if(request.method==='GET'&&url.pathname==='/api/ai/status')return respond({googleLogin:googleMode(env),enabled:Boolean(env.OASIS_DEMO_ACCESS_CODE),openRouterConfigured:Boolean(env.OPENROUTER_API_KEY),provider:'OpenRouter'});
 if(request.method==='GET'&&url.pathname==='/api/ai/models'){try{const models=await fetchOpenRouterModels();return respond({provider:'OpenRouter',count:models.length,models},200,{'cache-control':'public, max-age=300'});}catch(error){return respond({error:error.message||'无法获取 OpenRouter 模型目录'},502);}}
 if(request.method!=='POST'||url.pathname!=='/api/ai/chat')return respond({error:'接口不存在'},404);
 if(!env.OASIS_DEMO_ACCESS_CODE)return respond({error:'模型 API 尚未开放：管理员需先配置 OASIS_DEMO_ACCESS_CODE'},503);
 const origin=request.headers.get('origin');if(!origin||origin!==url.origin)return respond({error:'只允许从 Oasis 页面调用'},403);
 if(googleMode(env)){if(!env.ACCOUNTS)return respond({error:'账号服务尚未配置'},503);const current=await account(request,env);if(!current.ok)return current;if(!(await current.json()).active)return respond({error:'请先激活账号'},403);}else if(!(await secureEqual(request.headers.get('x-oasis-access-code')||'',env.OASIS_DEMO_ACCESS_CODE)))return respond({error:'体验码不正确'},401);
 if(Number(request.headers.get('content-length')||0)>25000)return respond({error:'请求内容过大'},413);let payload;try{payload=validateChatInput(await request.json());}catch(error){return respond({error:error.message||'无效请求'},400);}return observeHarnessRequest(request,env,ctx,'advisor',()=>streamOpenRouterChat({...payload,env}));}};
