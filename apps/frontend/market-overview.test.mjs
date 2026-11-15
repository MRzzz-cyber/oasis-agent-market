import test from 'node:test';
import assert from 'node:assert/strict';
import {marketRows,overview} from './market-overview.js';
import {priceUpdate,marketPrompt} from './workbench.js';

test('market rows keep venue identity and calculate genuine changes without fabricated market caps',()=>{
 const data=[{universe:[{name:'ETH'},{name:'OLD',isDelisted:true},{name:'BROKEN'}]},[{midPx:'2000',prevDayPx:'2500',dayNtlVlm:'12345'},{midPx:'1'},{midPx:'NaN'}]];
 const rows=marketRows(data);assert.equal(rows.length,1);assert.equal(rows[0].id,'ETH');assert.ok(Math.abs(rows[0].change+20)<1e-9);assert.equal(rows[0].volume,12345);assert.equal(rows[0].marketCap,undefined);
 const stocks=marketRows([{universe:[{name:'xyz:NVDA'}]},[{markPx:'180',prevDayPx:'0'}]],'xyz');assert.equal(stocks[0].id,'xyz:NVDA');assert.equal(stocks[0].group,'stocks');assert.equal(stocks[0].change,null);
});
test('live prices ignore unrelated and invalid payloads, preserving per-asset freshness',()=>{
 const rows=[{id:'ETH',ticker:'ETH',price:2000,previous:2500,observedAt:1},{id:'BTC',price:80000,previous:79000,observedAt:2}];
 const next=priceUpdate(rows,{ETH:'2100',BTC:'invalid',OTHER:'99'});assert.equal(next[0].price,2100);assert.ok(next[0].observedAt>1);assert.equal(next[1],rows[1]);assert.equal(rows[0].price,2000);
});
test('guided prompts distinguish perpetual references from spot execution and reject stale snapshots',()=>{
 const quote={id:'ETH',ticker:'ETH',price:2000,change:-2,volume:1000,observedAt:Date.now()};
 assert.match(marketPrompt('plan',quote,Date.now()),/不是现货成交报价/);
 assert.match(marketPrompt('risk',{...quote,observedAt:Date.now()-120000},Date.now()),/没有有效的实时行情/);
});
test('overview handles one unavailable venue without erasing the available market',async()=>{
 const r=await overview(async(url,options)=>{const q=JSON.parse(options.body);if(q.dex)throw Error('unavailable');return Response.json([{universe:[{name:'ETH'}]},[{midPx:'2000',prevDayPx:'1900'}]]);},()=>100000);
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.partial,true);assert.equal(body.markets[0].id,'ETH');assert.equal(body.observedAt,100000);
});
