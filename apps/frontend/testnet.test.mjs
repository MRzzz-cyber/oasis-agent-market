import test from "node:test";
import assert from "node:assert/strict";
import {sizeOrder,envelope,spotMarket} from "./testnet.js";

test("spot limit buy rounds down to lot size and rejects insufficient funds or invalid ticks",()=>{
  assert.deepEqual(sizeOrder("80","950.0","80",4),{p:"950",s:"0.0842",cost:"79.99"});
  for(const [amount,px,balance] of [["80","950","79"],["3","950","80"],["80","950.123","80"],["80","0","80"]])
    assert.throws(()=>sizeOrder(amount,px,balance,4));
});
test("spot ID is obtained from pair metadata and pinned UETH token ID",()=>{
  const meta={tokens:[{name:"USDC",index:0},{name:"UETH",index:1242,szDecimals:4,tokenId:"0xe4371d8166f362d6578725f11e0a14f3"}],universe:[{tokens:[1242,0],index:1137,name:"@1137"}]};
  assert.equal(spotMarket(meta).asset,11137);
  meta.tokens[1].tokenId="wrong";
  assert.throws(()=>spotMarket(meta));
});
test("typed signature binds testnet, IOC, spot pair, cloid, nonce and expiry",()=>{
  const packet=envelope(11137,{p:"950",s:"0.0842"},"0x"+"12".repeat(16),1794486000000);
  assert.equal(packet.typed.message.source,"b");
  assert.equal(packet.typed.domain.chainId,1337);
  assert.equal(packet.typed.message.connectionId,"0xb31c71c656a73c7dccabef85d44a285375b98ce93c186e96df5b2070f3805a6f");
});

test("10U preview produces an exact, valid notional at the observed 950 ask",async()=>{
  const {tenOrder}=await import("./testnet.js");
  const order=tenOrder("950","10",4);
  assert.deepEqual(order,{p:"1000",s:"0.01",cost:"10"});
  for(const ask of ["950.12","3033.5","55","2020.9"]) {
    const q=tenOrder(ask,"10",4);
    assert.equal(q.cost,"10");
    assert.ok(Number(q.p)<=Number(ask)*1.1);
  }
  assert.throws(()=>tenOrder("950","9.99",4),/余额不足/);
});
