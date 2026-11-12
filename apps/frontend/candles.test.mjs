import test from "node:test";
import assert from "node:assert/strict";
import {snapshot,normalize} from "./candles.js";
test("same candle is replaced and unrelated assets cannot appear on the chart",()=>{
  const r={s:"HYPE",i:"1h",t:1000,o:"12",c:"14",h:"15",l:"10",v:"55"};
  assert.deepEqual(normalize([r,{...r,c:"13"},{...r,s:"BTC"},{...r,l:"16"}],"HYPE","1h"),[{t:1000,o:12,c:13,h:15,l:10,v:55}]);
});
test("market endpoint limits upstream requests to supported markets",async()=>{
  assert.equal((await snapshot(new Request("https://oasis.test/api/market/candles?coin=FAKE&interval=1h"),async (_,init)=>Response.json(JSON.parse(init.body).type==="allPerpMetas"?[{universe:[{name:"BTC"}]}]:{tokens:[],universe:[]}))).status,400);
});

test("catalog preserves separate venues, resolves spot token indices and excludes delisted contracts",async()=>{
  const {buildCatalog}=await import("./candles.js");
  const catalog=buildCatalog([{universe:[{name:"BTC"},{name:"OLD",isDelisted:true}]},{universe:[{name:"xyz:TSLA"},{name:"flx:TSLA"}]}],{tokens:[{index:2,name:"HYPE"},{index:0,name:"USDC"}],universe:[{name:"@107",tokens:[2,0]}]});
  assert.deepEqual(catalog.map(m=>m.id),["BTC","xyz:TSLA","flx:TSLA","@107"]);
  assert.equal(catalog[1].group,"美股永续");
  assert.equal(catalog[3].label,"HYPE/USDC");
});

test("market indicators exclude forming candles and compare volume to preceding bars",async()=>{
  const {indicators}=await import("./market.js");
  const bars=Array.from({length:22},(_,i)=>({t:i*1000,o:100,c:110,h:120,l:90,v:i===20?20:10}));
  bars[21].h=1000;
  const m=indicators(bars,1000,21500);
  assert.equal(m.high,120);
  assert.equal(m.sma,110);
  assert.equal(m.volumeRatio,2);
  assert.ok(Math.abs(m.change-10)<1e-9);
  assert.equal(indicators(bars.slice(0,10),1000,21500),null);
});
