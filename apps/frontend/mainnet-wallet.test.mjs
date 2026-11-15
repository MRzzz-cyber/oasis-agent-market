import test from 'node:test';import assert from 'node:assert/strict';
import {parseSpot,subtractDecimal,displayAmount,readMainnetAccount,readNativeBalance,MAINNET_INFO} from './mainnet-wallet.js';
import {fundingState} from './conversation-guide.js';
const address='0x'+'1'.repeat(40);
test('spot balances use exact decimal arithmetic and validate held funds',()=>{
 assert.equal(subtractDecimal('100.000000000000000001','0.000000000000000001'),'100');assert.equal(subtractDecimal('20.10','0.10'),'20');
 const spot=parseSpot({balances:[{coin:'USDC',token:0,total:'25.123456',hold:'5.1'},{coin:'UETH',token:999,total:'0.01',hold:'0'}]});assert.equal(spot.available,'20.023456');assert.equal(spot.assets[1].coin,'UETH');
 assert.equal(displayAmount('0.00000000001'),'<0.00000001');assert.throws(()=>subtractDecimal('1','2'));assert.throws(()=>parseSpot({balances:[{coin:'USDC',token:0,total:'-1',hold:'0'}]}));
});
test('account reads are pinned to mainnet with partial failures distinct from zero',async()=>{
 const calls=[];const fetcher=async(url,init)=>{assert.equal(url,MAINNET_INFO);const body=JSON.parse(init.body);assert.equal(body.user,address);calls.push(body.type);return body.type==='spotClearinghouseState'?Response.json({balances:[]}):new Response('',{status:503});};
 const result=await readMainnetAccount(address,fetcher);assert.equal(result.network,'hyperliquid-mainnet');assert.equal(result.spot.available,'0');assert.equal(result.perp,null);assert.equal(calls.length,2);
 const failed=await readMainnetAccount(address,async()=>new Response('',{status:500}));assert.equal(failed.spot,null);assert.equal(failed.perp,null);
});
test('testnet chain balance is never displayed as mainnet and chain changes reject stale values',async()=>{
 const methods=[];const testnet={request:async p=>{methods.push(p.method);return '0xaa36a7';}};assert.equal((await readNativeBalance(testnet,address)).status,'unsupported');assert.deepEqual(methods,['eth_chainId']);
 let reads=0;const changed={request:async p=>p.method==='eth_chainId'?(reads++?'0xaa36a7':'0x1'):p.method==='eth_accounts'?[address]:'0xde0b6b3a7640000'};await assert.rejects(readNativeBalance(changed,address));
 const provider={request:async p=>p.method==='eth_chainId'?'0x1':p.method==='eth_accounts'?[address]:'0xde0b6b3a7640000'};const native=await readNativeBalance(provider,address);assert.equal(native.symbol,'ETH');assert.equal(displayAmount(native.amount),'1');
});
test('mainnet funds never satisfy a testnet order budget',()=>{
 assert.equal(fundingState({connected:true,network:'hyperliquid-mainnet',status:'ready',available:999},20).kind,'mainnet');
});
test('native wallet view reads official mainnet USDC without using testnet token IDs',async()=>{
 const calls=[];const provider={request:async p=>{calls.push(p);if(p.method==='eth_chainId')return '0xa4b1';if(p.method==='eth_accounts')return [address];if(p.method==='eth_getBalance')return '0x0';return '0x'+(12345678n).toString(16).padStart(64,'0');}};
 const result=await readNativeBalance(provider,address);assert.equal(result.chain,'Arbitrum');assert.equal(result.usdc,'12.345678');const call=calls.find(p=>p.method==='eth_call');assert.equal(call.params[0].to,'0xaf88d065e77c8cc2239327c5edb3a432268e5831');assert.equal(call.params[0].data,'0x70a08231'+address.slice(2).padStart(64,'0'));
});
