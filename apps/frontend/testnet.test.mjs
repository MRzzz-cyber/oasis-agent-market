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


test("wallet selection preserves EIP-6963 providers and deduplicates legacy injection",async()=>{
  const {walletChoices}=await import("./testnet.js");
  const rabby={isRabby:true,request:async()=>[]};
  const metamask={isMetaMask:true,request:async()=>[]};
  const choices=walletChoices([{name:"Rabby",provider:rabby}],{providers:[metamask,rabby]});
  assert.equal(choices.length,2);
  assert.equal(choices[0].provider,rabby);
  assert.equal(choices[1].provider,metamask);
  assert.equal(choices[1].name,"MetaMask");
  assert.deepEqual(walletChoices([],undefined),[]);
});

test("wallet refusal, pending request and authorization failures give actionable errors",async()=>{
  const {walletError}=await import("./testnet.js");
  assert.match(walletError({code:-32002}),/待处理请求/);
  assert.match(walletError({code:4001}),/取消/);
  assert.match(walletError({code:4100}),/尚未授权/);
  assert.match(walletError({code:4900}),/断开/);
  assert.equal(walletError({message:"测试网请求失败"}),"测试网请求失败");
});

test('agent approval uses current wallet chain but is bound to Hyperliquid Testnet',async()=>{
  const {approvalEnvelope}=await import('./testnet.js');
  const packet=approvalEnvelope('0x'+'12'.repeat(20),'0x1',1794486000000);
  assert.equal(packet.typed.domain.chainId,1);
  assert.equal(packet.action.signatureChainId,'0x1');
  assert.equal(packet.action.hyperliquidChain,'Testnet');
  assert.equal(packet.typed.primaryType,'HyperliquidTransaction:ApproveAgent');
  assert.equal(envelope(11137,{p:'1000',s:'0.01'},'0x'+'12'.repeat(16),Date.now()).typed.domain.chainId,1337);
});

test('local test signer produces a recoverable canonical signature once, and rejects mainnet or larger orders',async()=>{
  const {createTestnetSigner}=await import('./vendor/hl-agent.js');
  const {recoverTypedDataAddress}=await import('viem');
  const signer=createTestnetSigner();
  const packet=envelope(11137,{p:'1000',s:'0.01'},'0x'+'12'.repeat(16),Date.now());
  const signature=await signer.signOrder(packet);
  assert.equal((await recoverTypedDataAddress({...packet.typed,signature})).toLowerCase(),signer.address.toLowerCase());
  await assert.rejects(()=>signer.signOrder(packet),/已使用/);
  const mainnet=structuredClone(packet);mainnet.typed.message.source='a';
  await assert.rejects(()=>createTestnetSigner().signOrder(mainnet),/无效/);
  const large=envelope(11137,{p:'1000',s:'0.1'},'0x'+'12'.repeat(16),Date.now());
  await assert.rejects(()=>createTestnetSigner().signOrder(large),/10 USDC/);
  const tampered=structuredClone(packet);tampered.action.orders[0].a=10001;
  await assert.rejects(()=>createTestnetSigner().signOrder(tampered),/无效/);
});
