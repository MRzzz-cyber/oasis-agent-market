import test from 'node:test';
import assert from 'node:assert/strict';
import {publicMarketFetch,predictionRoute,searchPredictions} from './prediction-markets.js';
const reply=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const emptyClient={search:()=>({firstPage:async()=>({items:{events:[]},hasMore:false})})};
test('public reads use Workers-compatible manual redirects while retaining signals',async()=>{
 const signal=AbortSignal.timeout(1000);
 const read=publicMarketFetch(async(url,init)=>{assert.equal(init.redirect,'manual');assert.equal(init.signal,signal);assert.equal(init.headers.accept,'application/json');return reply({ok:true});});
 assert.equal((await read('https://gamma-api.polymarket.com/public-search',{redirect:'error',headers:{accept:'application/json'},signal})).status,200);
});
test('a redirect is rejected without a second request or leaked destination',async()=>{
 let requests=0;const read=publicMarketFetch(async()=>{requests++;return new Response(null,{status:302,headers:{location:'https://other.invalid/private'}});});
 await assert.rejects(read('https://api.elections.kalshi.com/trade-api/v2/markets'),error=>error.code==='redirect'&&!error.message.includes('private'));
 assert.equal(requests,1);
});
test('direct Kalshi reads use the same redirect policy',async()=>{
 let calls=0;const result=await searchPredictions('event',{client:emptyClient,fetchImpl:async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return reply({markets:[],cursor:''});}});
 assert.equal(calls,1);assert.equal(result.providers[1].error,undefined);
});
test('both unavailable providers return 502 with safe per-provider details',async()=>{
 const timeout=()=>new DOMException('internal-secret','TimeoutError');
 const response=await predictionRoute(new Request('https://oasis.test/api/predictions/search?q=Bitcoin'),{client:{search:()=>({firstPage:async()=>{throw timeout();}})},fetchImpl:async()=>{throw timeout();}});
 assert.equal(response.status,502);const payload=await response.json();
 assert.ok(payload.providers.every(p=>p.errorCode==='timeout'));assert.ok(payload.providers.every(p=>p.markets.length===0));
 assert.ok(!JSON.stringify(payload).includes('internal-secret'));
});
test('partial results stay successful and expose bounded status codes',async()=>{
 const response=await predictionRoute(new Request('https://oasis.test/api/predictions/search?q=Bitcoin'),{client:emptyClient,fetchImpl:async()=>new Response('private detail',{status:429})});
 assert.equal(response.status,200);const payload=await response.json();
 assert.equal(payload.providers[0].error,undefined);assert.equal(payload.providers[1].errorCode,'rate_limit');assert.equal(payload.providers[1].upstreamStatus,429);assert.ok(!JSON.stringify(payload).includes('private detail'));
});
test('invalid JSON and redirects have distinct safe failure states',async()=>{
 for(const [response,code] of [[new Response('not json'),'format'],[new Response(null,{status:301}),'redirect']]){
 const payload=await searchPredictions('event',{client:emptyClient,fetchImpl:async()=>response});assert.equal(payload.providers[1].errorCode,code);
 }
});
