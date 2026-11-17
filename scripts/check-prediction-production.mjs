// Read-only production acceptance: never logs in or touches wallet/order endpoints.
import assert from 'node:assert/strict';
const origin='https://oasistrade.app';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=Date.now()+600000;
let release,search,last='release pending';
while(Date.now()<deadline){
 try{
  const r=await fetch(origin+'/api/release',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  release=await r.json();
  if(r.ok&&release.predictionResearch==='prediction-v2'&&release.predictionPurchase==='polymarket-purchase-v1'&&release.predictionDiscovery==='prediction-discovery-v1'){
   const result=await fetch(origin+'/api/predictions/search?q=Bitcoin',{cache:'no-store',signal:AbortSignal.timeout(20000)});
   search=await result.json();
   console.log('Production providers',JSON.stringify(search.providers?.map(p=>({provider:p.provider,count:p.markets.length,errorCode:p.errorCode}))));
   if(result.ok&&search.providers?.some(p=>p.markets.length))break;
   last='new release found; search still unavailable';
  }else last='waiting for prediction-v2 release';
 }catch(error){last=error.name;}
 await wait(10000);
}
assert.equal(release?.predictionResearch,'prediction-v2',last);
assert.ok(search?.providers?.some(p=>p.markets.length),'No live Bitcoin results after deployment');
assert.equal(release.predictionPurchase,'polymarket-purchase-v1');
assert.equal(release.predictionDiscovery,'prediction-discovery-v1');
const feedResponse=await fetch(origin+'/api/predictions/discover',{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(feedResponse.status,200);const feed=await feedResponse.json();assert.ok(feed.markets?.length);assert.equal(feed.version,'prediction-discovery-v1');
const source=feed.markets[0];const compareResponse=await fetch(origin+'/api/predictions/compare?'+new URLSearchParams({provider:source.provider,id:source.id,outcome:'yes',shares:'10'}),{cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(compareResponse.status,200);const compare=await compareResponse.json();assert.equal(compare.source.id,source.id);assert.equal(compare.equivalenceVerified,false);assert.equal(compare.providers.length,2);
console.log('Production discovery',JSON.stringify({count:feed.markets.length,providers:compare.providers.map(p=>({provider:p.provider,count:p.markets.length,error:p.errorCode}))}));
const ui=await fetch(origin+'/prediction-cards.js?v=discovery-v1',{signal:AbortSignal.timeout(15000)});assert.equal(ui.status,200);assert.match(await ui.text(),/prediction-discovery\.js/);
const trading=await fetch(origin+'/api/predictions/trading-status',{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(trading.status,200);const readiness=await trading.json();assert.equal(readiness.version,'polymarket-purchase-v1');assert.equal(readiness.chainId,137);assert.equal(readiness.asset,'pUSD');assert.equal(readiness.enabled,release.predictionTrading);
console.log('Production purchase readiness',JSON.stringify({configured:readiness.enabled,chainId:readiness.chainId,version:readiness.version}));
assert.equal(release.execution,'arbitrum-uniswap-v3');
assert.equal(release.inputBalance,'wallet');
assert.equal(release.observability,'harness-metrics-v1');
const admin=await fetch(origin+'/admin',{signal:AbortSignal.timeout(15000)});
assert.equal(admin.status,200);assert.match(await admin.text(),/admin-metrics\.js/);
const metrics=await fetch(origin+'/api/admin/metrics',{signal:AbortSignal.timeout(15000)});
assert.equal(metrics.status,401,'Unauthenticated metrics must not be public');
console.log('PASS production prediction-v2, purchase readiness, live search, /admin and metrics authentication; no wallet operations');
