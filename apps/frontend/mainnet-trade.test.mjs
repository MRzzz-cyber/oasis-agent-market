import test from 'node:test';import assert from 'node:assert/strict';
import {nativeTrade} from './mainnet-trade.js';
import * as C from './arbitrum-swap-core.js';
class Element{constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.isConnected=true;this.textContent='';}append(...values){this.children.push(...values);}replaceChildren(...values){this.children=values;}setAttribute(){}querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);} }
const USER='0x'+'1'.repeat(40),POOL='0x'+'2'.repeat(40),tick=()=>new Promise(r=>setImmediate(r));
async function settle(){for(let i=0;i<60;i++)await tick();}
const find=(root,label)=>root.querySelectorAll('button').find(b=>b.textContent.startsWith(label));
async function harness({balance=12159122n,quoteFails=false,chain=C.CHAIN}={}){
 const names=['document','window','MutationObserver','localStorage','fetch','navigator'],previous=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),items=new Map();let selected,sendCount=0;
 const wallet={address:USER,name:'Rabby Wallet',provider:{request:async p=>{
  if(p.method==='eth_accounts')return [USER];if(p.method==='eth_chainId')return chain;if(p.method==='wallet_switchEthereumChain'){chain=p.params[0].chainId;return null;}
  if(p.method==='eth_getCode')return '0x6000';if(p.method==='eth_getBlockByNumber')return {timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};if(p.method==='eth_getBalance')return '0x'+220370000000000n.toString(16);if(p.method==='eth_gasPrice')return '0x989680';if(p.method==='eth_estimateGas')return '0x186a0';
  if(p.method==='eth_call'){const d=p.params[0].data;if(d===C.balanceData(USER))return '0x'+C.word(balance);if(d===C.allowanceData(USER))return '0x'+C.word(10000000);if(d==='0xc45a0155')return '0x'+C.aw(C.FACTORY);if(d==='0x4aa4a4fc')return '0x'+C.aw(C.WETH);if(d.startsWith('0x1698ee82'))return '0x'+C.aw(POOL);if(d.startsWith('0xf7729d43')){if(quoteFails)throw Error('quote unavailable');return '0x'+C.word(5000000000000000n);}if(p.params[0].to===C.ROUTER)return '0x';assert.fail('unexpected call');}
  if(p.method==='eth_sendTransaction'){sendCount++;throw Object.assign(Error('user cancelled'),{code:4001});}
  assert.fail('unexpected RPC '+p.method);
 }}};selected=wallet;
 const setup={document:{createElement:t=>new Element(t),getElementById:()=>new Element('div')},window:new EventTarget(),MutationObserver:class{observe(){}disconnect(){}},localStorage:{getItem:k=>items.get(k)??null,setItem:(k,v)=>items.set(k,v)},fetch:()=>assert.fail('wallet purchase must not query Hyperliquid or server quote'),navigator:{locks:{request:async(_,__,fn)=>fn({})}}};
 for(const[k,v]of Object.entries(setup))Object.defineProperty(globalThis,k,{configurable:true,value:v});const root=nativeTrade({budget:10,getWallet:()=>selected,pickWallet:()=>{}});await settle();
 return {root,get sends(){return sendCount;},restore(){for(const[k,v]of Object.entries(previous)){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}};
}
test('actual production entry displays wallet 12.159122 USDC, ETH minimum output and enables purchase without venue funds',async()=>{const h=await harness();try{const all=[h.root,...h.root.querySelectorAll('p'),...h.root.querySelectorAll('span'),...h.root.querySelectorAll('dd')].map(e=>e.textContent).join(' ');assert.ok(all.includes('12.159122 USDC'));assert.ok(all.includes('Uniswap'));assert.ok(!all.includes('Hyperliquid'));assert.ok(!all.includes('UETH'));assert.equal(find(h.root,'购买 ETH · 支付 10').disabled,false);assert.equal(h.root.querySelectorAll('details').length,0);assert.equal(h.sends,0);}finally{h.restore();}});
test('clicking the purchase action opens the wallet transaction and cancellation never retries',async()=>{const h=await harness();try{const buy=find(h.root,'购买 ETH · 支付');await Promise.all([buy.onclick(),buy.onclick()]);assert.equal(h.sends,1);assert.ok(h.root.querySelectorAll('strong').some(e=>e.textContent.includes('取消')));}finally{h.restore();}});
test('insufficient wallet cash leaves a visible disabled purchase action',async()=>{const h=await harness({balance:4800000n});try{assert.equal(find(h.root,'购买 ETH').disabled,true);assert.equal(h.sends,0);}finally{h.restore();}});
test('failed Uniswap quotes leave retry available without requesting signatures',async()=>{const h=await harness({quoteFails:true});try{assert.ok(find(h.root,'获取报价后购买 ETH'));assert.equal(find(h.root,'获取报价后购买 ETH').disabled,false);assert.equal(h.sends,0);}finally{h.restore();}});
test('wrong network requires explicit wallet switch then displays quote, never trades automatically',async()=>{const h=await harness({chain:'0x1'});try{const change=find(h.root,'切换至 Arbitrum');assert.ok(change);await change.onclick();assert.equal(find(h.root,'购买 ETH · 支付 10').disabled,false);assert.equal(h.sends,0);}finally{h.restore();}});
