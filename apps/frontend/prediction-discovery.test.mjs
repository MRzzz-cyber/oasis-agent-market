import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDiscoveryMarket,discoverPredictions,comparePredictions,predictionRoute} from './prediction-markets.js';
import {matchAssessment,relatedScore,shuffledMarkets,searchTerms,discoveryQuery} from './prediction-discovery.js';
const reply=p=>Response.json(p);
const raw={id:'123',question:'Will Bitcoin reach $100000 by December?',active:true,acceptingOrders:true,closed:false,archived:false,outcomes:'["Yes","No"]',outcomePrices:'["0.4","0.6"]',volume24hr:123,endDate:'2026-12-31T00:00:00Z',description:'Use the daily closing price.'};
const poly={id:'123',version:'v1',question:raw.question,description:raw.description,slug:'btc',conditionId:'cond',state:{active:true,acceptingOrders:true,endDate:raw.endDate},outcomes:{yes:{label:'Yes',price:'0.4',tokenId:'1'},no:{label:'No',price:'0.6',tokenId:'2'}}};
const kal={ticker:'KXBTC-100K',event_ticker:'KXBTC',status:'active',title:raw.question,yes_ask_dollars:'0.42',no_ask_dollars:'0.6',close_time:'2027-01-01T00:00:00Z',rules_primary:'Use a different price source.'};
test('discovery preserves public event identity and never invents nonbinary outcome mappings',()=>{
 const m=normalizeDiscoveryMarket(raw,{id:'event',title:'Bitcoin in December',slug:'bitcoin'});
 assert.equal(m.id,'123');assert.equal(m.eventId,'event');assert.equal(m.outcomes[0].key,'yes');assert.equal(m.outcomes[0].price,'0.4');assert.equal(m.url,'https://polymarket.com/event/bitcoin');
 for(const overrides of [{closed:true},{acceptingOrders:false},{outcomes:'["No","Yes"]'},{outcomes:'["A","B","C"]'},{outcomes:'invalid'}])assert.equal(normalizeDiscoveryMarket({...raw,...overrides}),null);
});
test('feed excludes closed events, deduplicates and takes one active binary market per event',async()=>{
 let requests=0;const p=await discoverPredictions({now:1000,fetchImpl:async(u,init)=>{requests++;const url=new URL(u);assert.equal(url.hostname,'gamma-api.polymarket.com');assert.equal(url.searchParams.get('closed'),'false');assert.equal(url.searchParams.get('order'),'volume24hr');assert.equal(init.redirect,'manual');return reply([{id:'e',markets:[raw,{...raw,id:'124',volume24hr:1}]},{id:'duplicate',markets:[raw]},{id:'closed',closed:true,markets:[{...raw,id:'125'}]}]);}});
 assert.equal(requests,1);assert.equal(p.markets.length,1);assert.equal(p.refreshAfterSeconds,60);assert.equal(p.at,new Date(1000).toISOString());assert.match(p.coverage,/不是全站/);
});
test('malformed feeds fail without fabricated fixtures',async()=>{await assert.rejects(discoverPredictions({fetchImpl:async()=>reply({markets:[]})}));});
test('related titles and equal metadata never imply verified settlement equivalence',()=>{
 const source={provider:'polymarket',id:'1',question:'Bitcoin',description:'Rule A',endDate:'2027-01-01',outcomes:[{label:'Yes'}]};
 const m=matchAssessment(source,{...source,provider:'kalshi',id:'2'});
 assert.equal(m.status,'related');assert.notEqual(m.status,'verified');
 assert.equal(matchAssessment(source,source).status,'source');
 assert.ok(matchAssessment(source,{...source,id:'2',description:'Rule B',endDate:null}).differences.length>=2);
});
test('automatic comparison searches bounded Kalshi series and exposes candidate rules differences',async()=>{
 const calls=[];const payload=await comparePredictions({provider:'polymarket',id:'123',outcome:'no',shares:'10'},{client:{fetchMarket:async()=>poly},fetchImpl:async(u,init)=>{const url=new URL(u);calls.push(url.pathname);assert.ok(!init.method||init.method==='GET');assert.equal(init.redirect,'manual');return reply(url.pathname.endsWith('/series')?{series:[{ticker:'KXBTC',title:'Bitcoin price',tags:[]},{ticker:'OTHER',title:'Concerts'}]}:{markets:[kal],cursor:'more'});}});
 assert.equal(calls.length,2);assert.equal(payload.equivalenceVerified,false);assert.equal(payload.outcome,'no');assert.equal(payload.providers[1].markets[0].match.status,'related');assert.ok(payload.providers[1].markets[0].match.differences.some(s=>s.includes('截止')));
 assert.equal(payload.providers[1].partial,true);
});
test('counterparty outages keep the selected source and never claim platform has no markets',async()=>{
 const payload=await comparePredictions({provider:'polymarket',id:'123'},{client:{fetchMarket:async()=>poly},fetchImpl:async()=>{throw new DOMException('private-secret','TimeoutError');}});
 assert.equal(payload.providers[0].markets[0].id,'123');assert.equal(payload.providers[1].errorCode,'timeout');assert.ok(!JSON.stringify(payload).includes('private-secret'));
});
test('Kalshi source discovers Polymarket alternatives without signing or placing orders',async()=>{
 const payload=await comparePredictions({provider:'kalshi',id:kal.ticker},{client:{search:()=>({firstPage:async()=>({items:{events:[{markets:[poly]}]}})})},fetchImpl:async()=>reply({market:kal})});
 assert.equal(payload.source.provider,'kalshi');assert.equal(payload.providers[1].markets[0].provider,'polymarket');
});
test('comparison rejects mismatched source and invalid inputs before remote quote work',async()=>{
 await assert.rejects(comparePredictions({provider:'polymarket',id:'999'},{client:{fetchMarket:async()=>poly}}),/请选择/);
 const options={fetchImpl:()=>assert.fail('unexpected public fetch')};
 for(const path of ['/api/predictions/compare?provider=x&id=123','/api/predictions/compare?provider=polymarket&id=..%2F&shares=10']){
  assert.equal((await predictionRoute(new Request('https://test.invalid'+path),options)).status,400);
 }
 assert.equal((await predictionRoute(new Request('https://test.invalid/api/predictions/discover',{method:'POST'}),options)).status,405);
});
test('shuffling is bounded, nonmutating and deduplicates real IDs',()=>{
 const rows=[{provider:'polymarket',id:'1'},{provider:'polymarket',id:'2'},{provider:'polymarket',id:'1'}],result=shuffledMarkets(rows,()=>0);
 assert.equal(result.length,2);assert.equal(rows.length,3);assert.notEqual(result[0].id,result[1].id);assert.equal(relatedScore('the Bitcoin price','bitcoin closing price'),1);
 assert.ok(searchTerms('我想找比特币').includes('bitcoin'));assert.ok(discoveryQuery({question:'Will Bitcoin reach 100000?'}).length<=120);
});
