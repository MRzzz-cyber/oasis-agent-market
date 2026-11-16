// Apply only known source anchors, then validate identity configuration before writing.
import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const workerPath='apps/frontend/worker.js',swapPath='apps/frontend/arbitrum-swap.js',configPath='apps/frontend/wrangler.jsonc',metricsPath='apps/frontend/harness-metrics.js',telemetryPath='apps/frontend/harness-telemetry.js';
let worker=await readFile(workerPath,'utf8'),swap=await readFile(swapPath,'utf8'),config=JSON.parse(await readFile(configPath,'utf8')),metrics=await readFile(metricsPath,'utf8'),telemetry=await readFile(telemetryPath,'utf8');
const originalVars=JSON.stringify(config.vars),originalAccounts=config.durable_objects.bindings.find(b=>b.name==='ACCOUNTS');
function replace(value,before,after){assert.equal(value.split(before).length-1,1,'Observability anchor changed: '+before.slice(0,90));return value.replace(before,after);}
if(!worker.includes("from './harness-metrics.js'")){
 worker=replace(worker,"import {mainnetQuote} from './mainnet-quote.js';","import {mainnetQuote} from './mainnet-quote.js';\nimport {harnessMetricsRoute,observeHarnessRequest} from './harness-metrics.js';\nexport {HarnessMetricsStore} from './harness-metrics.js';");
 worker=replace(worker,"export default {async fetch(request,env){const url=new URL(request.url);","export default {async fetch(request,env,ctx){const url=new URL(request.url);\n if(['/api/harness/events','/api/admin/metrics','/api/admin/metrics/prometheus'].includes(url.pathname))return harnessMetricsRoute(request,env);\n if(['/admin','/admin/','/admin.html'].includes(url.pathname)){if(request.method!=='GET')return respond({error:'后台页面只支持 GET'},405);const asset=await env.ASSETS.fetch(new Request(new URL('/admin.html',url),request)),headers=new Headers(asset.headers);headers.set('cache-control','no-store');headers.set('x-frame-options','DENY');headers.set('referrer-policy','no-referrer');headers.set('content-security-policy',\"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'\");return new Response(asset.body,{status:asset.status,headers});}");
 worker=replace(worker,"if(url.pathname.startsWith('/api/predictions/'))return predictionRoute(request);","if(url.pathname.startsWith('/api/predictions/'))return observeHarnessRequest(request,env,ctx,url.pathname.endsWith('/quote')?'prediction_quote':'prediction_search',()=>predictionRoute(request));");
 worker=replace(worker,"return streamOpenRouterChat({...payload,env});","return observeHarnessRequest(request,env,ctx,'advisor',()=>streamOpenRouterChat({...payload,env}));");
 worker=replace(worker,"predictionTrading:false,execution:","predictionTrading:false,observability:'harness-metrics-v1',execution:");
}
if(!swap.includes("from './harness-telemetry.js'")){
 swap=replace(swap,"import {walletFundingCard} from './funding-card.js';","import {walletFundingCard} from './funding-card.js';\nimport {swapMetrics} from './harness-telemetry.js';");
 swap=replace(swap,"export function nativeTrade({budget=10,getWallet,pickWallet,onBudget,onReceipt}){","export function nativeTrade({budget=10,getWallet,pickWallet,onBudget,onReceipt}){\n const metrics=swapMetrics();");
 swap=replace(swap,"const record=await executeSwap(","metrics.start();const record=await executeSwap(");
 swap=replace(swap,"onStage:r=>{if(!alive(target))return;","onStage:r=>{metrics.observe(r);if(!alive(target))return;");
 swap=replace(swap,"function showRecord(r,issue=''){lastRecord=r;","function showRecord(r,issue=''){metrics.observe(r);lastRecord=r;");
 swap=replace(swap,"}if(held?.terminal===false){showRecord(held,message);","}metrics.failure(e,held);if(held?.terminal===false){showRecord(held,message);");
}
if(!metrics.includes('async function readLimitedBody')){
 metrics=replace(metrics,"method:'POST',body:JSON.stringify({op:'append',owner,events,source})","method:'POST',signal:AbortSignal.timeout(2000),body:JSON.stringify({op:'append',owner,events,source})");
 metrics=replace(metrics,"export async function harnessMetricsRoute(request,env){","async function readLimitedBody(request){if(!request.body)return '';const reader=request.body.getReader(),decoder=new TextDecoder();let size=0,text='';try{for(;;){const r=await reader.read();if(r.done)return text+decoder.decode();size+=r.value.byteLength;if(size>16384){await reader.cancel();throw Object.assign(Error('事件批次过大'),{status:413});}text+=decoder.decode(r.value,{stream:true});}}finally{reader.releaseLock();}}\nexport async function harnessMetricsRoute(request,env){");
 metrics=replace(metrics,"const raw=await request.text();","const raw=await readLimitedBody(request);");
 metrics=replace(metrics,"catch{return json({error:'事件格式无效'},400);}","catch(error){return json({error:error.status===413?'事件批次过大':'事件格式无效'},error.status===413?413:400);}");
 metrics=replace(metrics,"return append(env,await hash('oasis-harness:'+current.id),payload.events,'client');","try{return await append(env,await hash('oasis-harness:'+current.id),payload.events,'client');}catch{return json({error:'采集暂不可用'},503);}");
 metrics=replace(metrics,"let result;try{metricFilters(url);const r=","try{metricFilters(url);}catch{return json({error:'筛选条件无效'},400);}let result;try{const r=");
 metrics=replace(metrics,"if(ctx?.waitUntil)ctx.waitUntil(pending);await pending;}","if(ctx?.waitUntil)ctx.waitUntil(pending);else await pending;}");
 metrics=replace(metrics,"if(type!=='advisor'||!result.ok||!result.body){const promise=finish(result.ok?'task.succeeded':'task.failed',result.ok?'none':'http_error');","if(type!=='advisor'||!result.ok||!result.body){let ok=result.ok;if(ok&&type==='prediction_search'){try{const payload=await result.clone().json();ok=Array.isArray(payload.providers)&&payload.providers.some(p=>!p.error);}catch{ok=false;}}const promise=finish(ok?'task.succeeded':'task.failed',ok?'none':'http_error');");
}
if(!config.durable_objects.bindings.some(b=>b.name==='HARNESS_METRICS')){config.durable_objects.bindings.push({name:'HARNESS_METRICS',class_name:'HarnessMetricsStore'});config.migrations.push({tag:'v2-harness-metrics',new_sqlite_classes:['HarnessMetricsStore']});}
assert.equal(JSON.stringify(config.vars),originalVars,'Existing identity variables must not change');assert.deepEqual(config.durable_objects.bindings.find(b=>b.name==='ACCOUNTS'),originalAccounts);assert.equal(config.vars.OASIS_AUTH_ISSUER,'https://oasistrade.app');
await writeFile(workerPath,worker);await writeFile(swapPath,swap);await writeFile(configPath,JSON.stringify(config,null,2)+'\n');await writeFile(metricsPath,metrics);await writeFile(telemetryPath,telemetry);console.log('Integrated private metrics without changing identity or transaction policy.');
