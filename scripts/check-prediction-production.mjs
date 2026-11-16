// Read-only production acceptance: never logs in or touches wallet/order endpoints.
import assert from 'node:assert/strict';
const origin='https://oasistrade.app';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deadline=Date.now()+300000;
let release,search,last='release pending';
while(Date.now()<deadline){
 try{
  const r=await fetch(origin+'/api/release',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  release=await r.json();
  if(r.ok&&release.predictionResearch==='prediction-v2'){
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
assert.equal(release.predictionTrading,false);
assert.equal(release.execution,'arbitrum-uniswap-v3');
assert.equal(release.inputBalance,'wallet');
assert.equal(release.observability,'harness-metrics-v1');
const admin=await fetch(origin+'/admin',{signal:AbortSignal.timeout(15000)});
assert.equal(admin.status,200);assert.match(await admin.text(),/admin-metrics\.js/);
const metrics=await fetch(origin+'/api/admin/metrics',{signal:AbortSignal.timeout(15000)});
assert.equal(metrics.status,401,'Unauthenticated metrics must not be public');
console.log('PASS production prediction-v2, live search, /admin and metrics authentication; no wallet operations');
