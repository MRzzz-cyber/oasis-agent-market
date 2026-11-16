// Read-only mainnet and deployment checks. No keys, signatures, approvals or broadcasts.
import assert from 'node:assert/strict';
import {USDC,WETH,ROUTER,QUOTER,FACTORY,FEES,aw,quoteData,poolData,resultUint,decimal} from '../apps/frontend/arbitrum-swap-core.js';
let id=0;
async function rpc(method,params){const r=await fetch('https://arb1.arbitrum.io/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Readonly RPC HTTP '+r.status);const data=await r.json();if(data.error)throw Error(data.error.message);return data.result;}
const call=(to,data)=>rpc('eth_call',[{to,data},'latest']);
assert.equal(await rpc('eth_chainId',[]),'0xa4b1');
assert.equal((await call(ROUTER,'0xc45a0155')).toLowerCase(),'0x'+aw(FACTORY));
assert.equal((await call(ROUTER,'0x4aa4a4fc')).toLowerCase(),'0x'+aw(WETH));
assert.equal(resultUint(await call(USDC,'0x313ce567')),6n);
const quotes=[];for(const fee of FEES){try{const pool=await call(FACTORY,poolData(fee));assert.notEqual(resultUint(pool),0n);const out=resultUint(await call(QUOTER,quoteData('1000000',fee)));assert.ok(out>0n);quotes.push({fee,pool:'0x'+pool.slice(-40),eth:decimal(out,18)});}catch(error){console.log('Fee '+fee+' unavailable: '+error.message);}}
assert.ok(quotes.length,'No live USDC/WETH quote was returned');
async function deployedSource(path){const r=await fetch('https://oasistrade.app/'+path+'?deployment-check='+Date.now(),{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'cache-control':'no-cache'}});assert.equal(r.status,200);return r.text();}
const entry=await deployedSource('mainnet-trade.js');assert.match(entry,/export\s*\{nativeTrade\}\s*from\s*['"]\.\/arbitrum-swap\.js['"]/);assert.ok(!entry.includes('api/mainnet/quote'));
const card=await deployedSource('arbitrum-swap.js');assert.ok(card.includes('Arbitrum One · 钱包直接兑换'));assert.ok(card.includes('Uniswap V3'));assert.ok(!card.includes('Hyperliquid'));
console.log(JSON.stringify({network:'Arbitrum One',input:'1 USDC',router:ROUTER,quotes,deployment:'oasistrade.app wallet-swap entry confirmed',readOnly:true},null,2));
