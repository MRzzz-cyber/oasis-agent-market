import test from "node:test";
import assert from "node:assert/strict";
import {replay} from "./replay.js";
const h=3600000;
test("falling prices can profit only for an active short; long stays flat",()=>{
 const bars=Array.from({length:44},(_,i)=>({t:i*h,o:101-i,c:100-i}));
 const short=replay(bars,-1,44*h);
 assert.ok(short.gain>0 && short.gain<100*(bars[20].o-bars[43].c)/bars[20].o);
 assert.equal(short.trades,1);assert.equal(replay(bars,1,44*h).gain,0);
 assert.equal(replay(bars,-1,43*h),null);
});
