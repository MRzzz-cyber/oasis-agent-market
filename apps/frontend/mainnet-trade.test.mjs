import test from 'node:test';import assert from 'node:assert/strict';
import {nativeTrade} from './mainnet-trade.js';
import {makeQuote,UETH_ID,journal} from './mainnet-order-core.js';
import {createMainnetSigner} from '../wallet-ui/mainnet-signer.js';
// Minimal DOM implements only this card's standard element operations. All API calls below are fixtures.
class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.isConnected=true;this.textContent='';}append(...values){this.children.push(...values);}replaceChildren(...values){this.children=values;}setAttribute(){}querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);} }
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<25;i++)await tick();}
const master='0x'+'1'.repeat(40),market={coin:'@151',asset:10151,decimals:4,tokenId:UETH_ID};
const buttons=root=>root.querySelectorAll('button');const find=(root,label)=>buttons(root).find(b=>b.textContent.startsWith(label));
async function harness({orderReply='timeout',storageFails=false,lockAvailable=true}={}){
 const previous={};for(const k of ['document','window','MutationObserver','localStorage','fetch','navigator'])previous[k]=Object.getOwnPropertyDescriptor(globalThis,k);
 const items=new Map(),storage={getItem:key=>items.get(key)??null,setItem:(key,value)=>{if(storageFails)throw Error('storage unavailable');items.set(key,value);}};
 let exchangeOrders=0,approvals=0,active=null,selected=null,accountChecks=0;const events=new EventTarget();const wallet={address:master,name:'Fixture wallet',kind:'external',provider:{request:async p=>{if(p.method==='eth_accounts'){accountChecks++;return [master];}if(p.method==='eth_chainId')return '0x1';if(p.method==='eth_signTypedData_v4')return '0x'+'1'.repeat(128)+'1b';throw Error('unexpected method');}}};selected=wallet;
 const setup={document:{createElement:tag=>new Element(tag),getElementById:()=>new Element('div')},window:events,MutationObserver:class{observe(){}disconnect(){}},localStorage:storage,navigator:{locks:{request:async(_,__,fn)=>fn(lockAvailable?{}:null)}},fetch:async(url,options)=>{
  if(url.startsWith('/api/mainnet/quote')){const budget=new URL(url,'https://test').searchParams.get('budget'),time=Date.now();return Response.json({...makeQuote({market,book:{coin:'@151',time,levels:[[{px:'1800'}],[{px:'1801'}]]},markPx:'1801',available:'100',budget,checkedAt:time}),address:master});}
  assert.ok(url.startsWith('https://api.hyperliquid.xyz/'));const body=JSON.parse(options.body);
  if(body.type==='extraAgents')return Response.json(active?[{address:active,validUntil:Date.now()+60000}]:[]);
  if(body.action?.type==='approveAgent'){approvals++;active=body.action.agentAddress;return Response.json({status:'ok'});}
  if(body.action?.type==='order'){exchangeOrders++;assert.equal(journal(storage,master).load().cloid,body.action.orders[0].c);assert.equal(body.action.orders.length,1);if(orderReply==='timeout')throw Error('upstream timeout');return Response.json({status:'ok',response:{type:'order',data:{statuses:[{filled:{oid:6,totalSz:body.action.orders[0].s,avgPx:'1801'}}]}}});}
  if(body.type==='orderStatus')return Response.json({status:'unknownOid'});throw Error('unexpected request '+body.type);
 }};
 for(const [k,v]of Object.entries(setup))Object.defineProperty(globalThis,k,{configurable:true,value:v});
 const root=nativeTrade({budget:20,getWallet:()=>selected,pickWallet:()=>{},openDeposit:()=>{},createSigner:async q=>createMainnetSigner(q)});await settle();
 async function authorize(){root.querySelectorAll('input').find(i=>i.type==='checkbox').checked=true;await find(root,'授权主网交易会话').onclick();await settle();assert.equal(approvals,1);}
 return {root,storage,authorize,get orders(){return exchangeOrders;},get approvals(){return approvals;},get checks(){return accountChecks;},changeWallet(){selected=null;events.dispatchEvent(new Event('oasis:funds-updated'));},restore(){for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
}
test('conversation order card requires separate consent, wallet approval and final buy; timeout holds cloid and never resubmits',async()=>{const h=await harness();try{assert.equal(h.orders,0);await find(h.root,'授权主网交易会话').onclick();assert.equal(h.approvals,0);assert.equal(h.orders,0);await h.authorize();assert.equal(h.orders,0);const buy=find(h.root,'确认买入');assert.equal(buy.disabled,false);const a=buy.onclick(),b=buy.onclick();await Promise.all([a,b]);assert.equal(h.orders,1);const saved=journal(h.storage,master).load();assert.equal(saved.terminal,false);await find(h.root,'预览 / 刷新订单').onclick();await find(h.root,'核对原订单').onclick();assert.equal(journal(h.storage,master).load().cloid,saved.cloid);assert.equal(h.orders,1);assert.ok(!find(h.root,'确认买入'));}finally{h.restore();}});
test('failed durable reservation prevents exchange submit even after local signing',async()=>{const h=await harness({storageFails:true});try{await h.authorize();await find(h.root,'确认买入').onclick();assert.equal(h.orders,0);assert.equal(journal(h.storage,master).load(),null);}finally{h.restore();}});
test('cross-tab lock contention prevents signing/submission',async()=>{const h=await harness({lockAvailable:false});try{await h.authorize();await find(h.root,'确认买入').onclick();assert.equal(h.orders,0);}finally{h.restore();}});
test('filled receipt is persisted as mainnet only after real-shaped exchange result; wallet change invalidates card',async()=>{const h=await harness({orderReply:'filled'});try{await h.authorize();await find(h.root,'确认买入').onclick();assert.equal(h.orders,1);const r=journal(h.storage,master).load();assert.equal(r.status,'filled');assert.equal(r.oid,6);assert.equal(r.terminal,true);assert.ok(h.checks>=5);h.changeWallet();assert.ok(!find(h.root,'确认买入'));assert.equal(journal(h.storage,master).load().oid,6);}finally{h.restore();}});

test('ten USDC option displays required minimum without increasing amount or preparing a signer',async()=>{const h=await harness();try{await find(h.root,'10 USDC').onclick();await settle();const amount=h.root.querySelectorAll('input').find(i=>i.type==='number');assert.equal(amount.value,'10');assert.ok(find(h.root,'改为最低可预览金额'));assert.ok(!find(h.root,'确认买入'));assert.equal(h.orders,0);assert.equal(h.approvals,0);}finally{h.restore();}});
