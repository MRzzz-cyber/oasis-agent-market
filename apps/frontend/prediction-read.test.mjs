import test from 'node:test';
import assert from 'node:assert/strict';
import {readPredictionJSON,predictionSnapshotCache,SNAPSHOT_MAX_AGE} from './prediction-read.js';
import {searchPredictions,discoverPredictions,predictionRoute,normalizeDiscoveryMarket} from './prediction-markets.js';
const raw={id:'123',question:'Will Bitcoin reach a new high?',active:true,acceptingOrders:true,closed:false,archived:false,outcomes:'["Yes","No"]',outcomePrices:'["0.4","0.6"]',volume24hr:123,bestAsk:0.4,endDate:'2030-12-31T00:00:00Z',description:'Official resolution rule.'};
const events=[{id:'event',slug:'bitcoin-event',title:'Bitcoin',markets:[raw]}];
const noWait=async()=>{};
test('HTML gateway responses retry only the same public GET and recover with JSON',async()=>{
 let calls=0;const value=await readPredictionJSON('/api/predictions/search?q=Bitcoin',{wait:noWait,fetchImpl:async(url,init)=>{calls++;assert.equal(url,'/api/predictions/search?q=Bitcoin');assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.body,undefined);return calls===1?new Response('<html>Gateway error</html>',{status:503}):Response.json({ok:true});}});
 assert.equal(calls,2);assert.equal(value.ok,true);
});
test('persistent HTML errors are bounded and never surface HTML as user copy',async()=>{
 let calls=0;await assert.rejects(readPredictionJSON('/api/predictions/discover',{wait:noWait,fetchImpl:async()=>{calls++;return new Response('<html>private-stack</html>',{status:502});}}),e=>e.code==='format'&&!e.message.includes('private-stack'));assert.equal(calls,2);
});
test('rate limits and redirects do not retry or follow a different destination',async()=>{
 for(const status of [429,403,302]){let calls=0;await assert.rejects(readPredictionJSON('/api/predictions/discover',{wait:noWait,fetchImpl:async()=>{calls++;return status===302?new Response(null,{status,headers:{location:'https://untrusted.invalid'}}):Response.json({error:'Unavailable'},{status});}}));assert.equal(calls,1);}
});
test('user cancellation stops a pending retry before another request',async()=>{
 const c=new AbortController();let calls=0;await assert.rejects(readPredictionJSON('/api/predictions/discover',{signal:c.signal,wait:async()=>c.abort(),fetchImpl:async()=>{calls++;throw TypeError('offline');}}),e=>e.name==='AbortError');assert.equal(calls,1);
});
test('snapshots coalesce reads, preserve source timestamps, isolate terms and expire without extension',async()=>{
 let tick=1000,calls=0,resolve;const cache=predictionSnapshotCache({freshMs:20,maxAge:100,limit:2}),now=()=>tick;
 const options={now},payload={at:'source-time',markets:[{id:'123'}]},load=()=>{calls++;return new Promise(r=>resolve=r);};
 const a=cache.read('Bitcoin',load,options),b=cache.read('Bitcoin',load,options);resolve(payload);assert.deepEqual(await a,payload);assert.deepEqual(await b,payload);assert.equal(calls,1);
 await cache.read('Bitcoin',()=>assert.fail('fresh snapshot refetched'),options);
 tick=1030;const stale=await cache.read('Bitcoin',()=>{throw Error('upstream');},options);assert.equal(stale.stale,true);assert.equal(stale.at,'source-time');assert.equal(payload.stale,undefined);
 await assert.rejects(cache.read('NBA',()=>{throw Error('unavailable');},options));
 tick=1101;await assert.rejects(cache.read('Bitcoin',()=>{throw Error('unavailable');},options));
 assert.equal(SNAPSHOT_MAX_AGE,300000);
});
test('snapshot capacity bounds concurrent work and evicts the oldest successful key',async()=>{
 const cache=predictionSnapshotCache({limit:1});let resolve;const held=cache.read('first',()=>new Promise(r=>resolve=r));await assert.rejects(cache.read('second',()=>assert.fail('capacity bypassed')));resolve({id:1});await held;await cache.read('second',async()=>({id:2}));let loads=0;await cache.read('first',async()=>{loads++;return {id:3};});assert.equal(loads,1);
});
test('public search reads complete official Gamma metadata without the trading SDK and filters invalid markets',async()=>{
 let calls=0;const p=await searchPredictions('Bitcoin',{fetchImpl:async(url,init)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://gamma-api.polymarket.com');assert.equal(u.pathname,'/public-search');assert.equal(u.searchParams.get('optimized'),'false');assert.equal(u.searchParams.get('q'),'Bitcoin');assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');
 return Response.json({events:[...events,{id:'mixed',markets:[raw,{...raw,id:'2',closed:true},{...raw,id:'3',outcomes:null},{...raw,id:'4',bestAsk:0},{...raw,id:'5',endDate:'2000-01-01'},null]},null],pagination:{hasMore:true}});}});
 assert.equal(calls,1);assert.deepEqual(p.providers[0].markets.map(m=>m.id),['123']);assert.equal(p.providers[0].markets[0].eventId,'event');assert.equal(p.providers[0].markets[0].execution.enabled,false);assert.equal(p.executionEnabled,false);
 assert.equal(normalizeDiscoveryMarket({...raw,outcomes:null}),null);
});
test('failed searches return only a recent same-query snapshot and never redate it',async()=>{
 const cache=predictionSnapshotCache(),start=Date.parse('2026-11-18T00:00:00Z');
 const good=await searchPredictions('Bitcoin',{cache,now:start,fetchImpl:async()=>Response.json({events})});
 const bad={cache,now:start+21000,fetchImpl:async()=>Response.json({error:'provider down'},{status:503})};
 const stale=await searchPredictions('bitcoin',bad);assert.equal(stale.stale,true);assert.equal(stale.at,good.at);assert.equal(stale.query,'bitcoin');assert.deepEqual(stale.providers[0].markets,good.providers[0].markets);
 const other=await searchPredictions('NBA',bad);assert.ok(other.providers[0].error);assert.equal(other.stale,undefined);assert.equal(other.providers[0].markets.length,0);
 const expired=await searchPredictions('Bitcoin',{...bad,now:start+300001});assert.ok(expired.providers[0].error);assert.equal(expired.stale,undefined);
});
test('discovery uses the same bounded snapshot fallback while an uncached outage stays 502',async()=>{
 const cache=predictionSnapshotCache(),start=Date.parse('2026-11-18T00:00:00Z');
 const good=await discoverPredictions({cache,now:start,fetchImpl:async()=>Response.json(events)});
 const stale=await discoverPredictions({cache,now:start+21000,fetchImpl:async()=>new Response('gateway',{status:503})});assert.equal(stale.stale,true);assert.equal(stale.at,good.at);
 const r=await predictionRoute(new Request('https://fixture.invalid/api/predictions/search?q=Bitcoin'),{fetchImpl:async()=>new Response('gateway',{status:503})});assert.equal(r.status,502);const p=await r.json();assert.equal(p.providers[0].markets.length,0);assert.equal(p.providers[0].errorCode,'http');
});

test('a sparse provider payload cannot masquerade as a successful empty search',async()=>{
 const {acceptingOrders,...sparse}=raw;const p=await searchPredictions('Bitcoin',{fetchImpl:async()=>Response.json({events:[{markets:[sparse]}]})});
 assert.equal(p.providers[0].errorCode,'format');assert.equal(p.providers[0].markets.length,0);
});
