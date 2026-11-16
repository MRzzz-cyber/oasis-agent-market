import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient,createSecureClient,production} from '@polymarket/client';
import {prepareMarketOrder,postOrder} from '@polymarket/client/actions';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {atomic,display,PUSD,FACTORY,address,canonical,purchasePreview,checkQuote,checkOrder,checkAuth,checkBatch,approvalCalls,predictionJournal} from './polymarket-purchase-core.js';
import {depositWallets} from './polymarket-identity.js';
import {validateRelay,purchaseService} from './polymarket-purchase-service.js';
import {executePurchase,assertPurchaseClear} from './polymarket-purchase-engine.js';
import {assertFundingClear} from './funding-core.js';
import {guardWalletProvider} from './account-wallet.js';
const owner='0x'+'1'.repeat(40),condition='0x'+'2'.repeat(64),maker=depositWallets(owner)[0],hash='0x'+'3'.repeat(64),signature='0x'+'1'.repeat(128)+'1b';
const identity={signer:owner,wallet:maker,walletType:3,signerType:'OWNER'};
const market={id:'123',version:'v1',question:'Fixture event',conditionId:condition,state:{active:true,acceptingOrders:true},outcomes:{yes:{tokenId:'1'},no:{tokenId:'2'}}};
const book=()=>({assetId:'1',conditionId:condition,timestamp:Date.now(),tickSize:0.01,minOrderSize:'5',negRisk:false,asks:[{price:'0.4',size:'1000'}]});
const quote=()=>({...purchasePreview({market,book:book(),feeInfo:{rate:'0.07',exponent:1},budget:'10',outcome:'yes'}),maker,balanceAtomic:'12000000',approvalNeeded:false});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const auth=(who=owner)=>({domain:{name:'ClobAuthDomain',version:'1',chainId:137},types:{ClobAuth:[{name:'address',type:'address'},{name:'timestamp',type:'string'},{name:'nonce',type:'uint256'},{name:'message',type:'string'}]},primaryType:'ClobAuth',message:{address:who,timestamp:String(Math.floor(Date.now()/1000)),nonce:'0',message:'This message attests that I control the given wallet'}});
const batch=(q,wallet=maker)=>({domain:{chainId:137,name:'DepositWallet',verifyingContract:wallet,version:'1'},types:{Batch:[{name:'wallet',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'calls',type:'Call[]'}],Call:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'}]},primaryType:'Batch',message:{wallet,nonce:'2',deadline:String(Math.floor(Date.now()/1000)+600),calls:approvalCalls(q)}});
test('buy preview caps all-in spend, validates timestamps and uses pUSD on Polygon',()=>{
 const q=quote();assert.equal(q.collateral,PUSD);assert.equal(q.chainId,137);assert.equal(q.orderType,'FOK');assert.equal(BigInt(q.netAtomic)+BigInt(q.feeReserveAtomic),10000000n);assert.equal(q.netAtomic,'9340000');checkQuote(q);
 assert.throws(()=>purchasePreview({market,book:{...book(),timestamp:1},feeInfo:{rate:'0',exponent:1},budget:'10',outcome:'yes'}),/过期/);
 for(const budget of ['0','0.1','1001','10.001','1e3'])assert.throws(()=>purchasePreview({market,book:book(),feeInfo:{rate:'0',exponent:1},budget,outcome:'yes'}));
 assert.throws(()=>purchasePreview({market,book:{...book(),assetId:'2'},feeInfo:{rate:'0',exponent:1},budget:'10',outcome:'yes'}),/不匹配/);
 assert.throws(()=>checkQuote({...q,netAtomic:'10000000',feeReserveAtomic:'0'}),/模型/);
});
test('pinned SDK order generation passes exact sign policy and posts only FOK without automatic allowance recovery',async()=>{
 const q=quote();let posts=0;
 const sdk={account:identity,environment:production,clob:{get:async path=>path.startsWith('/markets-by-token/')?condition:{feeInfo:{rate:0.07,exponent:1},negRisk:false,tickSize:0.01,tokens:[{assetId:'1'},{assetId:'2'}]}},credentials:{key:'fixture-key'},secureClob:{post:async(path,options)=>{posts++;assert.equal(path,'/order');assert.equal(options.json.orderType,'FOK');assert.equal(options.json.order.maker,maker);return {ok:true,orderId:hash,status:'matched',tradeIds:[],transactionsHashes:[]};}}};
 const flow=await prepareMarketOrder(sdk,{assetId:'1',side:'BUY',amount:display(q.netAtomic),maxSpend:'10',maxPrice:display(q.limitAtomic),orderType:'FOK'});
 const step=await flow.next();assert.equal(step.value.kind,'signOrder');const typed=JSON.parse(canonical(step.value.payload));checkOrder(typed,q,identity);
 for(const change of [t=>t.domain.chainId=1,t=>t.message.contents.tokenId='2',t=>t.message.contents.makerAmount='999999999',t=>t.message.contents.side=1,t=>t.message.contents.maker=owner,t=>t.types.Order.push({name:'extra',type:'uint256'})]){const t=structuredClone(typed);change(t);assert.throws(()=>checkOrder(t,q,identity));}
 const done=await flow.next(signature);assert.equal(done.done,true);await postOrder(sdk)(done.value);assert.equal(posts,1);
});
test('SDK recognizes deterministic existing deposit wallet as owned without deploying or using a private key',async()=>{
 let signCount=0,writes=0;
 const c=await createSecureClient({wallet:maker,signer:{getAddress:async()=>owner,signTypedData:async data=>{checkAuth(JSON.parse(canonical(data)),owner);signCount++;return signature;},signMessage:()=>assert.fail('unexpected personal signature'),sendTransaction:()=>assert.fail('unexpected wallet transaction')},fetch:async(input,init)=>{
  const req=new Request(input,init),u=new URL(req.url);if(u.pathname.includes('/auth/')){writes+=req.method==='POST'?1:0;return Response.json({apiKey:'00000000-0000-4000-8000-000000000000',secret:'ZmFrZS10ZXN0LW9ubHk=',passphrase:'fixture-only'});}
  if(u.pathname.includes('deployed'))return Response.json({deployed:true});
  throw Error('Unexpected SDK request '+u.pathname);
 }});
 assert.equal(c.account.walletType,3);assert.equal(c.account.signerType,'OWNER');assert.equal(c.account.wallet.toLowerCase(),maker);assert.equal(signCount,1);assert.ok(writes<=1);
});
test('exact pUSD approvals reject unlimited allowance, transfers and foreign makers',()=>{
 const q=quote(),t=batch(q);checkBatch(t,q,maker);const extra=structuredClone(t);extra.message.calls[0].data='0x095ea7b3'+q.exchange.slice(2).padStart(64,'0')+'f'.repeat(64);assert.throws(()=>checkBatch(extra,q,maker),/本次金额/);
 assert.throws(()=>checkBatch(t,q,owner),/合约|钱包/);t.message.calls[0].value='1';assert.throws(()=>checkBatch(t,q,maker));
});
test('account-wallet provider signs only an armed Polygon intent with a current Google identity',async()=>{
 let signs=0;const provider=guardWalletProvider({request:async p=>p.method==='eth_chainId'?'0x89':[]},{address:owner,subject:'oasis:google:fixture',isCurrent:()=>true,getSession:async()=>({id:'fixture',active:true}),signTypedData:async()=>{signs++;return signature;}});
 const typed=auth();await assert.rejects(provider.request({method:'eth_signTypedData_v4',params:[owner,canonical(typed)]}));
 provider.armPredictionSignature(typed,{kind:'auth'});assert.equal(await provider.request({method:'eth_signTypedData_v4',params:[owner,canonical(typed)]}),signature);assert.equal(signs,1);
 await assert.rejects(provider.request({method:'eth_signTypedData_v4',params:[owner,canonical(typed)]}));assert.equal(signs,1);
});
async function relayFixture(){
 const acct=privateKeyToAccount(generatePrivateKey()),who=address(acct.address),payload=auth(who),proof={payload,signature:await acct.signTypedData(payload)},q={...quote(),maker:depositWallets(who)[0]},t=batch(q,q.maker),sig=await acct.signTypedData(t);
 return {body:canonical({type:'WALLET',from:who,to:FACTORY,nonce:t.message.nonce,signature:sig,depositWalletParams:{depositWallet:q.maker,deadline:t.message.deadline,calls:t.message.calls},metadata:'Oasis exact purchase approval'}),proof,quote:q,batch:t};
}
test('relay validates cryptographic ownership and only bounded platform allowance calls',async()=>{
 const f=await relayFixture();await validateRelay(f);
 const wrong=structuredClone(f);wrong.batch.message.calls[0].data='0xa9059cbb'+'0'.repeat(128);await assert.rejects(validateRelay(wrong));
 const body=JSON.parse(f.body);body.to=owner;await assert.rejects(validateRelay({...f,body:JSON.stringify(body)}));
 await assert.rejects(validateRelay({...f,proof:{...f.proof,signature:'0x'+'0'.repeat(130)}}));
});
test('relay secrets stay server-side; auth, origin and policy failures do not forward',async()=>{
 const env={POLYMARKET_BUILDER_API_KEY:'fake-test-key',POLYMARKET_BUILDER_SECRET:'dGVzdC1zZWNyZXQ=',POLYMARKET_BUILDER_PASSPHRASE:'fake-test-passphrase'},f=await relayFixture();let posts=0;
 const options={getAccount:async()=>Response.json({id:'fixture-relay',active:true}),fetchImpl:async(url,init)=>{posts++;assert.equal(url,'https://relayer-v2.polymarket.com/submit');assert.equal(init.redirect,'manual');assert.equal(init.headers.POLY_BUILDER_API_KEY,env.POLYMARKET_BUILDER_API_KEY);assert.equal(init.body,f.body);return Response.json({transactionID:'fixture-tx',state:'STATE_NEW'});}};
 const req=(origin='https://oasis.test',body=f)=>new Request('https://oasis.test/api/predictions/relay',{method:'POST',headers:{origin,'content-type':'application/json'},body:canonical(body)});
 const ok=await purchaseService(req(),env,options);assert.equal(ok.status,200);assert.ok(!(await ok.text()).includes('fake-test'));assert.equal(posts,1);
 assert.equal((await purchaseService(req('https://other.test'),env,options)).status,403);assert.equal(posts,1);
 assert.equal((await purchaseService(req(),{},options)).status,503);assert.equal(posts,1);
 const bad=await purchaseService(req('https://oasis.test',{...f,body:'{}'}),env,options);assert.equal(bad.status,403);assert.equal((await bad.json()).submitted,false);assert.equal(posts,1);
 const unauth=await purchaseService(req(),env,{...options,getAccount:async()=>Response.json({}, {status:401})});assert.equal(unauth.status,401);assert.equal(posts,1);
 const status=await purchaseService(new Request('https://oasis.test/api/predictions/trading-status'),env,options);assert.equal((await status.json()).enabled,true);assert.equal(posts,1);
});
const locks={request:async(name,options,fn)=>{assert.equal(name,'oasis-mainnet-order:'+owner);assert.equal(options.ifAvailable,true);return fn({});}};
function harness({unknown=false,settle=true}={}){
 const storage=memory(),wallet={address:owner},q=quote();let observer=()=>{},submits=0;
 const session={identity,observe:fn=>observer=fn,preview:async()=>q,wasSubmitted:()=>unknown,async submit(){submits++;assert.equal(predictionJournal(storage,owner).load().terminal,false);observer({orderId:hash,signedAmounts:{makerAmount:q.netAtomic,takerAmount:q.minimumSharesAtomic}});if(unknown)throw Error('timeout');return {ok:true,orderId:hash,status:'matched',tradeIds:['fixture-trade']};},reconcile:async r=>settle?{...r,status:'settled',terminal:true,hashes:[hash],message:'Fixture settlement'}:{...r,status:'pending',terminal:false,message:'Fixture pending'}};
 return {storage,wallet,q,session,args:{quote:q,session,wallet,getWallet:()=>wallet,storage,locks},count:()=>submits};
}
test('buy journals before wallet signing and persists the order hash before submission',async()=>{
 const h=harness(),r=await executePurchase(h.args);assert.equal(r.status,'settled');assert.equal(r.orderId,hash);assert.equal(h.count(),1);assert.equal(predictionJournal(h.storage,owner).load().terminal,true);
 const raw=h.storage.getItem('oasis-polymarket-order-v1:'+owner);assert.ok(!raw.includes('"signature"'));assert.ok(!raw.includes('"secret"'));
});
test('unknown submission blocks prediction and ETH/funding routes across reloads',async()=>{
 const h=harness({unknown:true}),r=await executePurchase(h.args);assert.equal(r.terminal,false);assert.equal(r.orderId,hash);assert.equal(r.status,'unknown');
 await assert.rejects(executePurchase(h.args),/预测订单/);assert.throws(()=>assertFundingClear(h.storage,owner),/预测订单/);assert.equal(h.count(),1);
});
test('matched orders remain pending until settlement is verified',async()=>{
 const h=harness({settle:false}),r=await executePurchase(h.args);assert.equal(r.terminal,false);assert.equal(r.status,'pending');await assert.rejects(executePurchase(h.args));assert.equal(h.count(),1);
});
test('price movement, expired preview, changed wallet, failed storage and lock contention never submit',async()=>{
 const h=harness();h.session.preview=async()=>({...h.q,limitAtomic:'990000'});await assert.rejects(executePurchase(h.args),/价格/);assert.equal(h.count(),0);
 const x=harness();await assert.rejects(executePurchase({...x.args,now:()=>x.q.expiresAt}),/过期/);await assert.rejects(executePurchase({...x.args,getWallet:()=>null}),/钱包/);assert.equal(x.count(),0);
 const y=harness();y.storage.setItem=()=>{throw Error('storage unavailable');};await assert.rejects(executePurchase(y.args),/storage/);assert.equal(y.count(),0);
 await assert.rejects(executePurchase({...x.args,locks:{request:async(n,o,fn)=>fn(null)}}),/另一个页面/);
});
test('journal rejects nested credentials and refuses overwriting original trade intent',()=>{
 const h=harness(),j=predictionJournal(h.storage,owner),record={owner,network:'polygon-polymarket',id:'fixture',kind:'order',at:Date.now(),quote:h.q,identity,status:'pending',terminal:false,message:'fixture'};j.save(record);
 assert.throws(()=>j.save({...record,quote:{...h.q,secret:'do-not-store'}}));assert.throws(()=>j.save({...record,identity:{...identity,wallet:owner}}),/参数/);
});
