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
