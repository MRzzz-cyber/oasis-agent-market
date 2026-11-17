import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,constants} from 'node:crypto';
import {kalshiPreview,kalshiOrder,checkKalshiOrder,receiptState,recoverKalshiFills,kalshiJournal,assertKalshiClear} from './kalshi-core.js';
import {importKalshiKey,executeKalshi,createKalshiSession} from './kalshi-client.js';
import {kalshiService} from './kalshi-service.js';
const owner='0x'+'1'.repeat(40),keyId='00000000-0000-4000-8000-000000000001',accountHash='a'.repeat(64),clientId='00000000-0000-4000-8000-000000000002';
const market={ticker:'KXEVENT-YES',event_ticker:'KXEVENT',title:'Fixture: event?',status:'active',close_time:'2027-01-01T00:00:00Z',exchange_index:0};
const quote=(patch={})=>({...kalshiPreview({market,estimate:{requested:'10',depthEnough:true,minimumMet:true,worstPrice:'0.4'},series:{fee_type:'quadratic',fee_multiplier:1},outcome:'yes',count:'10'}),...patch});
const storage=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const auth=()=>({keyId,timestamp:String(Date.now()),signature:'A'.repeat(86)+'=='});
const packet=(body)=>new Request('https://oasis.test/api/kalshi/account',{method:'POST',headers:{origin:'https://oasis.test','content-type':'application/json'},body:JSON.stringify(body)});
const user=async()=>Response.json({id:'fixture-google',active:true});
test('Kalshi FOK previews preserve integer caps and NO uses complementary YES ask',()=>{
 const q=quote();assert.equal(q.maxSpendAtomic,'4190000');assert.equal(q.feeReserveAtomic,'190000');assert.equal(kalshiOrder(q,clientId).side,'bid');
 const no=quote({outcome:'no'}),order=kalshiOrder(no,clientId);assert.equal(order.side,'ask');assert.equal(order.price,'0.6');assert.equal(order.time_in_force,'fill_or_kill');
 assert.throws(()=>checkKalshiOrder({...order,price:'0.59'},no));assert.throws(()=>checkKalshiOrder({...order,time_in_force:'good_till_canceled'},no));
});
test('unknown fees, deadlines, exchange shards and incomplete depth fail closed',()=>{
 const base={market,estimate:{requested:'10',depthEnough:true,minimumMet:true,worstPrice:'0.4'},series:{fee_type:'quadratic',fee_multiplier:1},outcome:'yes',count:'10'};
 for(const p of [{series:{fee_type:'flat',fee_multiplier:1}},{series:{fee_type:'quadratic',fee_multiplier:2}},{market:{...market,exchange_index:null}},{market:{...market,close_time:'2020-01-01'}},{estimate:{...base.estimate,depthEnough:false}},{count:'1.2'},{count:'1001'}])assert.throws(()=>kalshiPreview({...base,...p}));
});
test('accepted or mismatched receipts never imply a fill',()=>{const q=quote(),r={client_order_id:clientId,order_id:clientId,fill_count:'10.00',remaining_count:'0.00',average_fill_price:'0.4',average_fee_paid:'0.0168'};
 assert.equal(receiptState(r,q,clientId).status,'filled');assert.equal(receiptState({...r,client_order_id:keyId},q,clientId),null);assert.equal(receiptState({...r,average_fill_price:'0.5'},q,clientId),null);assert.equal(receiptState({...r,remaining_count:'1.00'},q,clientId),null);assert.equal(receiptState({order_id:clientId},q,clientId),null);
 assert.equal(receiptState({...r,fill_count:'0.00'},q,clientId).status,'unfilled');
});
test('Ed25519, PKCS8 RSA and PKCS1 RSA sign only fixed Kalshi method paths',async()=>{
 for(const [algorithm,format]of [['ed25519','pkcs8'],['rsa','pkcs8'],['rsa','pkcs1']]){
  const {privateKey,publicKey}=generateKeyPairSync(algorithm,algorithm==='rsa'?{modulusLength:2048}:{}),pem=privateKey.export({type:format,format:'pem'}),signer=await importKalshiKey(pem);
  const timestamp=String(Date.now()),path='/trade-api/v2/portfolio/balance',sig=await signer.sign(timestamp,'GET',path),data=Buffer.from(timestamp+'GET'+path);
  const valid=algorithm==='rsa'?verify('sha256',data,{key:publicKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(sig,'base64')):verify(null,data,publicKey,Buffer.from(sig,'base64'));assert.equal(valid,true);
  await assert.rejects(signer.sign(timestamp,'DELETE','/trade-api/v2/portfolio/balance'));await assert.rejects(signer.sign(timestamp,'POST','/trade-api/v2/portfolio/transfer'));signer.close();await assert.rejects(signer.sign(timestamp,'GET',path));
 }
});
test('private keys remain local and authenticated sessions stop for Google account changes',async()=>{
 const {privateKey}=generateKeyPairSync('ed25519'),pem=privateKey.export({format:'pem',type:'pkcs8'});let identity='fixture-google',privateRequests=0;
 const session=await createKalshiSession({keyId,pem,mode:'demo',fetchImpl:async(url,init)=>{if(url==='/api/auth/me')return Response.json({id:identity,active:true});assert.equal(url,'/api/kalshi/account');privateRequests++;const body=JSON.parse(init.body);assert.equal(body.environment,'demo');assert.equal(body.resource,'balance');assert.ok(!init.body.includes('PRIVATE KEY'));return Response.json({balance:1200});}});
 assert.equal((await session.balance()).balance,1200);identity='other-user';await assert.rejects(session.balance(),/账户已变化/);assert.equal(privateRequests,1);
});
test('pending records precede signing and unknown sends block all spending after reload',async()=>{
 const s=storage(),wallet={address:owner},q=quote();let posts=0;const session={accountHash,current:async()=>{},submit:async(q,id,sending)=>{assert.equal(kalshiJournal(s,accountHash).load().terminal,false);sending();posts++;throw Error('fixture timeout');}};
 const locks={request:async(n,o,fn)=>{assert.equal(n,'oasis-mainnet-order:'+owner);return fn({});}};
 const result=await executeKalshi({quote:q,session,wallet,getWallet:()=>wallet,storage:s,locks});assert.equal(result.terminal,false);assert.equal(posts,1);assert.throws(()=>assertKalshiClear(s,owner));
 await assert.rejects(executeKalshi({quote:q,session,wallet,getWallet:()=>wallet,storage:s,locks}));assert.equal(posts,1);assert.ok(!JSON.stringify(result).includes('signature'));
});
test('storage failures prevent requests, while definitive rejection records no submission',async()=>{
 const wallet={address:owner},q=quote(),locks={request:async(n,o,f)=>f({})};let submits=0;
 const session={accountHash,current:async()=>{},submit:async()=>{submits++;return {ok:false,submitted:false,error:'fixture rejected'};}};
 await assert.rejects(executeKalshi({quote:q,session,wallet,getWallet:()=>wallet,storage:{length:0,getItem:()=>null,setItem:()=>{throw Error('fixture quota');}},locks}));assert.equal(submits,0);
 const result=await executeKalshi({quote:q,session,wallet,getWallet:()=>wallet,storage:storage(),locks});assert.equal(result.terminal,true);assert.equal(result.status,'rejected');
});
function upstream(counters={}){return async(url,init={})=>{
 const u=new URL(url);assert.ok(['external-api.kalshi.com','external-api.demo.kalshi.co','api.elections.kalshi.com'].includes(u.hostname));assert.equal(init.redirect,'manual');
 if(u.pathname.endsWith('/exchange/status'))return Response.json({exchange_active:true,trading_active:true});
 if(u.pathname.endsWith('/events/KXEVENT'))return Response.json({event:{series_ticker:'KXEVENT'}});
 if(u.pathname.endsWith('/series/KXEVENT'))return Response.json({series:{ticker:'KXEVENT',fee_type:'quadratic',fee_multiplier:1}});
 if(u.pathname.endsWith('/orderbook'))return Response.json({orderbook_fp:{yes_dollars:[['0.4','100']],no_dollars:[['0.6','100']]}});
 if(u.pathname.includes('/markets/'))return Response.json({market:{...market,yes_ask_dollars:'0.4',no_ask_dollars:'0.6'}});
 if(u.pathname.endsWith('/portfolio/balance'))return Response.json({balance:1200});
 if(u.pathname.endsWith('/portfolio/events/orders')){counters.posts=(counters.posts||0)+1;const p=JSON.parse(init.body);return Response.json({client_order_id:p.client_order_id,order_id:clientId,fill_count:p.count,remaining_count:'0',average_fill_price:'0.4',average_fee_paid:'0.0168'},{status:201});}
 throw Error('unexpected fixture URL '+u.pathname);
};}
test('secure service sends one exact V2 order after balance, public preflight and durable reservation',async()=>{
 const q=quote(),body=kalshiOrder(q,clientId),counts={};let reserved=0;const r=await kalshiService(packet({environment:'production',resource:'submit',auth:auth(),balanceAuth:auth(),review:q,order:body}),{}, {getAccount:user,fetchImpl:upstream(counts),reserve:async()=>{reserved++;return new Response('{}',{status:200});}});
 assert.equal(r.status,201);assert.equal(counts.posts,1);assert.equal(reserved,1);assert.equal((await r.json()).receipt.client_order_id,clientId);
});
test('replayed reservation stays unknown and is never forwarded again',async()=>{
 const q=quote(),counts={};const r=await kalshiService(packet({environment:'production',resource:'submit',auth:auth(),balanceAuth:auth(),review:q,order:kalshiOrder(q,clientId)}),{}, {getAccount:user,fetchImpl:upstream(counts),reserve:async()=>new Response('{}',{status:409})});
 assert.equal(r.status,409);assert.equal((await r.json()).submitted,true);assert.equal(counts.posts,undefined);
});
test('private service rejects origin, inactive users, arbitrary routes and wrong order caps',async()=>{
 const deps={getAccount:user,fetchImpl:()=>assert.fail('unexpected upstream')};
 const foreign=new Request('https://oasis.test/api/kalshi/account',{method:'POST',headers:{origin:'https://evil.invalid'},body:'{}'});assert.equal((await kalshiService(foreign,{},deps)).status,403);
 const inactive=await kalshiService(packet({}),{}, {...deps,getAccount:async()=>Response.json({id:'fixture',active:false})});assert.equal(inactive.status,403);
 const arbitrary=await kalshiService(packet({environment:'production',resource:'transfer',auth:auth()}),{},deps);assert.equal(arbitrary.status,400);
 const q=quote(),wrong=await kalshiService(packet({environment:'production',resource:'submit',auth:auth(),balanceAuth:auth(),review:q,order:{...kalshiOrder(q,clientId),count:'100'}}),{},deps);assert.equal(wrong.status,400);assert.equal((await wrong.json()).submitted,false);
});
test('streamed bodies are capped before decode and oversized requests never forward',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(17000));},cancel(){cancelled=true;}});const r=await kalshiService(new Request('https://oasis.test/api/kalshi/account',{method:'POST',headers:{origin:'https://oasis.test'},body:stream,duplex:'half'}),{}, {getAccount:user,fetchImpl:()=>assert.fail('unexpected forwarding')});
 assert.equal(r.status,400);assert.equal(cancelled,true);
});

test('modern order recovery verifies every fill, NO complement, fees and original identity',()=>{
 const q=quote(),order={order_id:clientId,client_order_id:clientId,ticker:q.ticker,exchange_index:0,subaccount_number:0,outcome_side:'yes',book_side:'bid',initial_count_fp:'10.00',fill_count_fp:'10.00',remaining_count_fp:'0.00',status:'executed'};
 const fill={fill_id:'fixture-fill',order_id:clientId,ticker:q.ticker,exchange_index:0,subaccount_number:0,outcome_side:'yes',book_side:'bid',count_fp:'10.00',yes_price_dollars:'0.4',no_price_dollars:'0.6',fee_cost:'0.168',is_taker:true};
 assert.equal(recoverKalshiFills(order,[fill],q,clientId).status,'filled');
 for(const f of [{...fill,fee_cost:'10'},{...fill,order_id:keyId},{...fill,no_price_dollars:'0.5'},{...fill,count_fp:'9'},{...fill,is_taker:false}])assert.equal(recoverKalshiFills(order,[f],q,clientId),null);
 assert.equal(recoverKalshiFills(order,[fill,fill],q,clientId),null);assert.equal(recoverKalshiFills({...order,status:'resting'},[fill],q,clientId),null);
 const no=quote({outcome:'no'});assert.equal(recoverKalshiFills({...order,outcome_side:'no',book_side:'ask'},[{...fill,outcome_side:'no',book_side:'ask',yes_price_dollars:'0.6',no_price_dollars:'0.4'}],no,clientId).spent,'4.168');
});
