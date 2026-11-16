// Apply only known source anchors, then validate identity configuration before writing.
import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const workerPath='apps/frontend/worker.js',swapPath='apps/frontend/arbitrum-swap.js',configPath='apps/frontend/wrangler.jsonc';
let worker=await readFile(workerPath,'utf8'),swap=await readFile(swapPath,'utf8'),config=JSON.parse(await readFile(configPath,'utf8'));
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
if(!config.durable_objects.bindings.some(b=>b.name==='HARNESS_METRICS')){config.durable_objects.bindings.push({name:'HARNESS_METRICS',class_name:'HarnessMetricsStore'});config.migrations.push({tag:'v2-harness-metrics',new_sqlite_classes:['HarnessMetricsStore']});}
assert.equal(JSON.stringify(config.vars),originalVars,'Existing identity variables must not change');assert.deepEqual(config.durable_objects.bindings.find(b=>b.name==='ACCOUNTS'),originalAccounts);assert.equal(config.vars.OASIS_AUTH_ISSUER,'https://oasistrade.app');
await writeFile(workerPath,worker);await writeFile(swapPath,swap);await writeFile(configPath,JSON.stringify(config,null,2)+'\n');console.log('Integrated private metrics without changing identity or transaction policy.');
