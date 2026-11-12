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
