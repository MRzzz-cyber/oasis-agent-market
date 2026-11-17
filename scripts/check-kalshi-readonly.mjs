// Public GETs only. No user credential, financial account or order requests.
import assert from 'node:assert/strict';import {prepareKalshi} from '../apps/frontend/kalshi-service.js';
const base='https://external-api.kalshi.com/trade-api/v2';
let checked=0,good=0;
for(const series of ['KXFEDDECISION','KXBTC','KXNBA']){
 try{const r=await fetch(base+'/markets?'+new URLSearchParams({series_ticker:series,status:'open',mve_filter:'exclude',limit:'20'}),{signal:AbortSignal.timeout(12000)});if(!r.ok){console.log('PUBLIC CATALOG',series,r.status);continue;}const data=await r.json();for(const market of (data.markets||[]).slice(0,4)){checked++;try{const q=await prepareKalshi({ticker:market.ticker,outcome:'yes',count:'1',mode:'production'});assert.equal(q.currency,'USD');assert.ok(q.exchangeIndex>=0);console.log('PASS live Kalshi public preview',JSON.stringify({ticker:q.ticker,outcome:q.outcome,count:q.count,maxSpendAtomic:q.maxSpendAtomic,exchangeIndex:q.exchangeIndex}));good++;break;}catch(e){console.log('PUBLIC PREVIEW not enabled',market.ticker,e.message);}}if(good)break;}catch(e){console.log('PUBLIC READ unavailable',series,e.name);}
}
console.log('PUBLIC PROBE',JSON.stringify({checked,supportedPreviews:good,authenticated:false,ordersSent:0}));if(!good)throw Error('No supported public Kalshi preflight completed; inspect coverage before release');
