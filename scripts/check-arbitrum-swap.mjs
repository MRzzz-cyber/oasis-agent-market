// Read-only mainnet and deployment checks. No keys, signatures, approvals or broadcasts.
import assert from 'node:assert/strict';
import {USDC,WETH,ROUTER,QUOTER,FACTORY,FEES,aw,quoteData,poolData,resultUint,decimal} from '../apps/frontend/arbitrum-swap-core.js';
let id=0;
async function rpc(method,params){const r=await fetch('https://arb1.arbitrum.io/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Readonly RPC HTTP '+r.status);const data=await r.json();if(data.error)throw Error(data.error.message);return data.result;}
const call=(to,data)=>rpc('eth_call',[{to,data},'latest']);
assert.equal(await rpc('eth_chainId',[]),'0xa4b1');assert.equal((await call(ROUTER,'0xc45a0155')).toLowerCase(),'0x'+aw(FACTORY));assert.equal((await call(ROUTER,'0x4aa4a4fc')).toLowerCase(),'0x'+aw(WETH));assert.equal(resultUint(await call(USDC,'0x313ce567')),6n);
const quotes=[];for(const fee of FEES){try{const pool=await call(FACTORY,poolData(fee));assert.notEqual(resultUint(pool),0n);const out=resultUint(await call(QUOTER,quoteData('1000000',fee)));assert.ok(out>0n);quotes.push({fee,pool:'0x'+pool.slice(-40),eth:decimal(out,18)});}catch(error){console.log('Fee '+fee+' unavailable: '+error.message);}}assert.ok(quotes.length,'No live USDC/WETH quote was returned');
async function deployedSource(path){const r=await fetch('https://oasistrade.app/'+path+'?deployment-check='+Date.now(),{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'cache-control':'no-cache'}});assert.equal(r.status,200);return r.text();}
let verified=false,lastError;for(let attempt=0;attempt<24;attempt++){try{
 const entry=await deployedSource('mainnet-trade.js');assert.match(entry,/export\s*\{nativeTrade\}\s*from\s*['"]\.\/arbitrum-swap\.js['"]/);
 const card=await deployedSource('arbitrum-swap.js');assert.ok(card.includes('wallet-card-v18'));assert.ok(card.includes('swap-receive-amount'));assert.ok(card.includes('Uniswap V3'));assert.ok(!card.includes('Hyperliquid'));
 const css=await deployedSource('arbitrum-swap.css');assert.ok(css.includes('.swap-amount-line'));assert.ok(css.includes('@media(max-width:520px)'));
 const engine=await deployedSource('arbitrum-swap-engine.js');assert.ok(engine.includes('rpcQuantity'));assert.ok(engine.includes('fee-unavailable'));
 const advisor=await deployedSource('advisor-stream.js');assert.ok(advisor.includes('normalizeAdvisorStream'));verified=true;break;
 }catch(error){lastError=error;if(attempt<23)await new Promise(r=>setTimeout(r,5000));}}
assert.ok(verified,'New live card not confirmed: '+lastError?.message);
console.log(JSON.stringify({network:'Arbitrum One',input:'1 USDC',router:ROUTER,quotes,deployment:'oasistrade.app wallet-card-v18, fee normalization, CSS and advisor adapter confirmed',readOnly:true},null,2));
