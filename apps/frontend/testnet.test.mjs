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

test("10U preview preserves the actual ask and blocks rounding or reference-price shortfalls",async()=>{
  const {tenOrder,checkTenMinimum}=await import("./testnet.js");
  assert.deepEqual(tenOrder("1000","10",4,"1000"),{p:"1000",s:"0.01",cost:"10"});
  for(const ask of ["500","1250","2000"])assert.equal(tenOrder(ask,"999",4,ask).p,ask);
  assert.throws(()=>tenOrder("950","999",4,"950"),/至少需要 10.07/);
  assert.throws(()=>tenOrder("1000","999",4,"950"),/10 USDC|10 测试 USDC/);
  assert.throws(()=>tenOrder("950","9.99",4,"950"),/余额不足/);
  assert.throws(()=>tenOrder("1000","999",4,undefined),/格式无效/);
  assert.throws(()=>tenOrder("0","999",4,"1"),/价格无效/);
  assert.throws(()=>tenOrder("1000","999",9,"1000"),/精度/);
  assert.throws(()=>checkTenMinimum({p:"1000",s:"0.01"},"950","950"),/不足最低 10/);
  assert.throws(()=>checkTenMinimum({p:"1000",s:"0.01"},"1001","1000"),/高于预览限价/);
  assert.throws(()=>checkTenMinimum({p:"1000",s:"0.011"},"1000","1000"),/超过 10/);
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
  const legacyProxy={isMetaMask:true,request:async()=>[]};
  const modern=walletChoices([{name:"MetaMask",provider:metamask}],{providers:[legacyProxy,rabby]});
  assert.equal(modern.length,2);
  assert.equal(modern[0].provider,metamask);
  assert.equal(modern[1].provider,rabby);
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
  assert.ok(packet.action.agentName.length<=16);
  assert.equal(packet.action.agentName,'OasisTest');
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


test('agent verification accepts explicit no-expiry entries and rejects expired, missing or unrelated agents',async()=>{
  const {isActiveAgent}=await import('./testnet.js');
  const address='0x'+'12'.repeat(20),now=1000;
  assert.equal(isActiveAgent([{address,validUntil:null}],address,now),true);
  assert.equal(isActiveAgent([{address,validUntil:1001}],address,now),true);
  assert.equal(isActiveAgent([{address,validUntil:1000}],address,now),false);
  assert.equal(isActiveAgent([{address}],address,now),false);
  assert.equal(isActiveAgent([{address:'0x'+'34'.repeat(20),validUntil:null}],address,now),false);
  assert.equal(isActiveAgent([],address,now),false);
});

test('quote check distinguishes stale, missing, mismatched and clock-skewed data',async()=>{
  const {checkBook}=await import('./testnet.js');const now=Date.now();
  const book={coin:'@1137',markPx:'950',time:now-100,checkedAt:now,levels:[[{px:'46'}],[{px:'950'}]]};
  assert.equal(checkBook(book,'@1137'),'950');
  assert.throws(()=>checkBook({...book,time:now-45000},'@1137'),/过期 45 秒/);
  assert.throws(()=>checkBook({...book,levels:[[],[]]},'@1137'),/暂无卖单/);
  assert.throws(()=>checkBook({...book,coin:'@1'},'@1137'),/交易对不匹配/);
  assert.throws(()=>checkBook({...book,checkedAt:undefined},'@1137'),/时间信息异常/);
  assert.throws(()=>checkBook({...book,time:now-120000,checkedAt:now-120000},'@1137'),/同步系统时间/);
});


test('explicit 10.10 cap permits a 10.07 order at the real 950 ask without changing legacy caps',async()=>{
  const {tenOrder,checkTenMinimum}=await import('./testnet.js');
  const order=tenOrder('950','999',4,'950','10.10');
  assert.deepEqual(order,{p:'950',s:'0.0106',cost:'10.07'});
  assert.throws(()=>tenOrder('950','999',4,'950'),/至少需要 10.07/);
  assert.throws(()=>checkTenMinimum(order,'950','950'),/超过 10/);
  checkTenMinimum(order,'950','950','10.10');
  assert.throws(()=>checkTenMinimum(order,'950','940','10.10'),/不足最低/);
  assert.throws(()=>tenOrder('950','999',4,'950','1001'),/测试金额需/);
});

test('signer binds the explicit cap and rejects larger notional or an implicit budget increase',async()=>{
  const {createTestnetSigner}=await import('./vendor/hl-agent.js');
  const {recoverTypedDataAddress}=await import('viem');
  const packet=envelope(11137,{p:'950',s:'0.0106'},'0x'+'12'.repeat(16),Date.now());
  await assert.rejects(()=>createTestnetSigner().signOrder(packet),/上限/);
  const signer=createTestnetSigner('10.10');
  const signature=await signer.signOrder(packet);
  assert.equal((await recoverTypedDataAddress({...packet.typed,signature})).toLowerCase(),signer.address.toLowerCase());
  await assert.rejects(()=>signer.signOrder(packet),/已使用/);
  const tooLarge=envelope(11137,{p:'950',s:'0.0107'},'0x'+'12'.repeat(16),Date.now());
  await assert.rejects(()=>createTestnetSigner('10.10').signOrder(tooLarge),/上限/);
  assert.throws(()=>createTestnetSigner('1001'),/测试金额需/);
});


test('custom 20 USDC test order uses real ask and satisfies minimum notional',async()=>{
  const {tenOrder,checkTenMinimum}=await import('./testnet.js');
  assert.deepEqual(tenOrder('950','999',4,'950','20'),{p:'950',s:'0.021',cost:'19.95'});
  const order=tenOrder('950','999',4,'950','35');
  assert.ok(Number(order.cost)<=35);checkTenMinimum(order,'950','950','35');
  assert.throws(()=>tenOrder('950','19',4,'950','20'),/余额不足/);
  const {createTestnetSigner}=await import('./vendor/hl-agent.js');
  const packet=envelope(11137,{p:'950',s:'0.021'},'0x'+'12'.repeat(16),Date.now());
  await createTestnetSigner('20').signOrder(packet);
  await assert.rejects(()=>createTestnetSigner('10.10').signOrder(packet),/上限/);
});
