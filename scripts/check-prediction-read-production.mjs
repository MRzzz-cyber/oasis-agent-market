// Public GET-only acceptance. Never signs in, opens a wallet or submits transactions.
import assert from 'node:assert/strict';
const origin='https://oasistrade.app',deadline=Date.now()+600000;let release;
while(Date.now()<deadline){try{const r=await fetch(origin+'/api/release',{cache:'no-store',signal:AbortSignal.timeout(15000)}),p=await r.json();if(r.ok&&p.predictionReads==='prediction-read-v3'){release=p;break;}}catch{}await new Promise(r=>setTimeout(r,10000));}
assert.equal(release?.predictionReads,'prediction-read-v3','Recovery release not deployed');
for(let round=0;round<3;round++)for(const path of ['/api/predictions/discover','/api/predictions/search?q=Bitcoin','/api/predictions/search?q=NBA','/api/predictions/search?q=Fed']){
 const r=await fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,path);assert.match(r.headers.get('content-type'),/application\/json/);const p=await r.json(),rows=p.markets||p.providers?.find(v=>v.provider==='polymarket')?.markets;assert.ok(rows?.length,path);assert.ok(rows.every(m=>m.provider==='polymarket'));assert.equal(p.stale,undefined,'Live acceptance unexpectedly used a stale snapshot');console.log('PASS production public read',round,path,rows.length,r.headers.get('cf-ray'));
}
const ui=await(await fetch(origin+'/prediction-cards.js',{cache:'no-store'})).text(),helper=await(await fetch(origin+'/prediction-read.js',{cache:'no-store'})).text();assert.ok(ui.includes('prediction-retry')&&ui.includes('prediction-read.js'));assert.ok(helper.includes('SNAPSHOT_MAX_AGE')&&helper.includes("method:'GET'"));
for(const path of ['/api/predictions/trading-status','/api/predictions/bridge/config']){const r=await fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(15000)}),p=await r.json();assert.equal(r.status,200);assert.equal(p.enabled,true);}
console.log('PASS production prediction-read-v3: three rounds of feed/Bitcoin/NBA/Fed, published recovery UI and unchanged purchase/bridge readiness; no wallet operations');
