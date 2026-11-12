import test from "node:test";
import assert from "node:assert/strict";
import {snapshot,normalize} from "./candles.js";
test("same candle is replaced and unrelated assets cannot appear on the chart",()=>{
  const r={s:"HYPE",i:"1h",t:1000,o:"12",c:"14",h:"15",l:"10",v:"55"};
  assert.deepEqual(normalize([r,{...r,c:"13"},{...r,s:"BTC"},{...r,l:"16"}],"HYPE","1h"),[{t:1000,o:12,c:13,h:15,l:10,v:55}]);
});
test("market endpoint limits upstream requests to supported markets",async()=>{
  assert.equal((await snapshot(new Request("https://oasis.test/api/market/candles?coin=FAKE&interval=1h"),()=>assert.fail())).status,400);
});
