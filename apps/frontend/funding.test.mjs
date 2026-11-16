import test from 'node:test';import assert from 'node:assert/strict';
import {ARBITRUM,USDC,BRIDGE,usd,depositTransaction,fundingPacket,prepareFunding,submitFunding,reconcileFunding,fundingJournal} from './funding-core.js';
import {guardWalletProvider} from './account-wallet.js';
const user='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),sig='0x'+'1'.repeat(128)+'1b',hash='0x'+'a'.repeat(64);
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
const locks={request:async(_,__,fn)=>fn({})};
function fixture({mode='disabled',submit='ok',change=false}={}){
 let selected,chain=ARBITRUM,posts=0,signatures=0,transactions=0;const records=[];
 const wallet={address:user,provider:{request:async p=>{switch(p.method){case 'eth_accounts':return [user];case 'eth_chainId':return chain;case 'eth_call':return '0x'+(100000000n).toString(16).padStart(64,'0');case 'eth_getBalance':return '0x100000000000000';case 'eth_getCode':return '0x60006000';case 'eth_estimateGas':return '0x10000';case 'eth_gasPrice':return '0x1';case 'eth_signTypedData_v4':signatures++;if(change)selected=null;return sig;case 'eth_sendTransaction':transactions++;return hash;case 'eth_getTransactionReceipt':return null;default:assert.fail('unexpected RPC '+p.method);}}}};selected=wallet;
 const fetchImpl=async(url,options)=>{assert.ok(url.startsWith('https://api.hyperliquid.xyz/'));assert.equal(options.redirect,'manual');const b=JSON.parse(options.body);records.push(b);if(url.endsWith('/exchange')){posts++;if(submit==='timeout')throw Error('timeout');if(submit==='err')return Response.json({status:'err',response:'insufficient funds'});return Response.json({status:'ok',response:{type:'default'}});}switch(b.type){case 'userAbstraction':return Response.json(mode);case 'spotClearinghouseState':return Response.json({balances:[{token:0,coin:'USDC',total:'50',hold:'1'}]});case 'clearinghouseState':return Response.json({withdrawable:'20',assetPositions:[]});case 'allDexsClearinghouseState':return Response.json([['',{assetPositions:[]}]]);case 'openOrders':return Response.json([]);case 'userNonFundingLedgerUpdates':return Response.json([]);default:assert.fail('unexpected info '+b.type);}};
 return {wallet,getWallet:()=>selected,fetchImpl,records,get posts(){return posts;},get signatures(){return signatures;},get transactions(){return transactions;},changeChain(c){chain=c;}};
}
test('funding amounts are exact strings; deposits pin native USDC, Arbitrum and bridge without approvals',()=>{
 assert.equal(usd('10.000001'),'10.000001');for(const v of ['0','-1','1e2','1.0000001',1,'NaN'])assert.throws(()=>usd(v));
 const tx=depositTransaction(user,'10.000001');assert.equal(tx.to,USDC);assert.equal(tx.chainId,ARBITRUM);assert.equal(tx.value,'0x0');assert.equal(tx.data.slice(10,74),'0'.repeat(24)+BRIDGE.slice(2));assert.equal(BigInt('0x'+tx.data.slice(74)),10000001n);assert.throws(()=>depositTransaction(user,'9.99'));
});
test('withdraw and class-transfer signatures match official user-signed schemas and always return to signer',()=>{
 const p=fundingPacket('withdraw',user,'12.5',ARBITRUM,1000);assert.equal(p.action.type,'withdraw3');assert.equal(p.action.destination,user);assert.equal(p.typed.primaryType,'HyperliquidTransaction:Withdraw');assert.deepEqual(p.typed.types[p.typed.primaryType],[{name:'hyperliquidChain',type:'string'},{name:'destination',type:'string'},{name:'amount',type:'string'},{name:'time',type:'uint64'}]);assert.equal(p.typed.domain.chainId,42161);
 assert.equal(fundingPacket('toSpot',user,'5',ARBITRUM,1000).action.toPerp,false);assert.equal(fundingPacket('toPerp',user,'5',ARBITRUM,1000).action.toPerp,true);assert.equal(fundingPacket('standardize',user,'',ARBITRUM,1000).action.abstraction,'disabled');assert.throws(()=>fundingPacket('withdraw',user,'5','0x66eee',1000));
});
test('preview reads balances but never signs or submits; unknown account modes and excessive amounts fail closed',async()=>{
 const f=fixture();const p=await prepareFunding({...f,kind:'toSpot',amount:'5'});assert.equal(p.amount,'5');assert.equal(f.posts,0);assert.equal(f.signatures,0);assert.equal(f.transactions,0);await assert.rejects(prepareFunding({...f,kind:'toSpot',amount:'20.000001'}),/余额不足/);await assert.rejects(prepareFunding({...fixture({mode:'unifiedAccount'}),kind:'toSpot',amount:'5'}),/先预览/);
});
test('mode conversion is explicit, checks all dex positions and orders, and pins current wallet',async()=>{
 const f=fixture({mode:'unifiedAccount'});const p=await prepareFunding({...f,kind:'standardize',amount:''});assert.equal(p.packet.action.user,user);assert.equal(f.posts,0);assert.ok(f.records.some(r=>r.type==='allDexsClearinghouseState'));
 const risk=async(url,opts)=>{const b=JSON.parse(opts.body);if(b.type==='allDexsClearinghouseState')return Response.json([['',{assetPositions:[{position:{szi:'1'}}]}]]);return f.fetchImpl(url,opts);};await assert.rejects(prepareFunding({...f,fetchImpl:risk,kind:'standardize',amount:''}),/仓位/);
});
test('confirmed funding posts once, stores no signature, and does not claim withdrawal arrival',async()=>{
 const f=fixture(),storage=memory(),p=await prepareFunding({...f,kind:'withdraw',amount:'5'});const r=await submitFunding({...f,prepared:p,storage,locks});assert.equal(f.posts,1);assert.equal(f.signatures,1);assert.equal(r.status,'withdrawal-requested');assert.match(r.message,/到账待核对/);assert.ok(!JSON.stringify([...storage.data]).includes(sig));assert.equal(f.records.at(-1).action.destination,user);
});
test('timeout holds original request across reload and blocks any second signature or submission',async()=>{
 const f=fixture({submit:'timeout'}),storage=memory(),p=await prepareFunding({...f,kind:'toSpot',amount:'5'});await assert.rejects(submitFunding({...f,prepared:p,storage,locks}),/待核对/);const r=fundingJournal(storage,user).load();assert.equal(r.terminal,false);assert.equal(r.nonce,p.nonce);await assert.rejects(submitFunding({...f,prepared:p,storage,locks}),/待核对/);assert.equal(f.posts,1);assert.equal(f.signatures,1);const checked=await reconcileFunding({...f,record:r,storage});assert.equal(checked.terminal,false);
});
test('wallet or chain change, storage failure, expired preview and lock contention prevent funding post',async()=>{
 for(const kind of ['change','storage','expired','lock','chain']){
  const f=fixture({change:kind==='change'}),p=await prepareFunding({...f,kind:'toSpot',amount:'5'}),storage=kind==='storage'?{getItem:()=>null,setItem:()=>{throw Error('quota');}}:memory();if(kind==='chain')f.changeChain('0x1');
  await assert.rejects(submitFunding({...f,prepared:p,storage,now:kind==='expired'?()=>p.expiresAt:Date.now,locks:kind==='lock'?{request:async(_,__,fn)=>fn(null)}:locks}));assert.equal(f.posts,0);
 }
});
test('deposit waits for wallet transaction and durable receipt; preview cannot silently switch network',async()=>{
 const f=fixture(),storage=memory(),p=await prepareFunding({...f,kind:'deposit',amount:'10'});assert.equal(f.transactions,0);const r=await submitFunding({...f,prepared:p,storage,locks});assert.equal(r.hash,hash);assert.equal(r.terminal,false);assert.equal(f.transactions,1);assert.equal(f.posts,0);f.changeChain('0x1');await assert.rejects(prepareFunding({...f,kind:'deposit',amount:'10'}),/切换/);
});
test('embedded wallet only signs a one-use exact armed funding intent; arbitrary recipient or transaction stays blocked',async()=>{
 let signed=0,sent=0;const raw={request:async p=>{if(p.method==='eth_chainId')return ARBITRUM;if(p.method==='eth_sendTransaction'){sent++;return hash;}throw Error('unexpected');}},provider=guardWalletProvider(raw,{address:user,subject:'oasis:google:u',isCurrent:()=>true,getSession:async()=>({id:'u',active:true}),signTypedData:async()=>{signed++;return sig;}}),p=fundingPacket('withdraw',user,'5',ARBITRUM,Date.now()),request={method:'eth_signTypedData_v4',params:[user,JSON.stringify(p.typed)]};
 await assert.rejects(provider.request(request));const bad=structuredClone(p);bad.action.destination=other;await assert.rejects(async()=>provider.armMainnetFunding(bad));provider.armMainnetFunding(p);assert.equal(await provider.request(request),sig);await assert.rejects(provider.request(request));assert.equal(signed,1);
 const tx=depositTransaction(user,'10');await assert.rejects(provider.request({method:'eth_sendTransaction',params:[tx]}));provider.armMainnetDeposit(tx);assert.equal(await provider.request({method:'eth_sendTransaction',params:[tx]}),hash);await assert.rejects(provider.request({method:'eth_sendTransaction',params:[tx]}));assert.equal(sent,1);await assert.rejects(async()=>provider.armMainnetDeposit({...tx,to:other}));
});
