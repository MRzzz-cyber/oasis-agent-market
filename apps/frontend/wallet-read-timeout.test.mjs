import test from 'node:test';
import assert from 'node:assert/strict';
import {readNativeBalance} from './mainnet-wallet.js';
const user='0x'+'1'.repeat(40);
test('read-only wallet balance deadline rejects even when wallet RPC never settles',async()=>{
 let calls=0;
 const provider={request:()=>{calls++;return new Promise(()=>{});}};
 await assert.rejects(readNativeBalance(provider,user,{timeoutMs:20}),/读取超时/);
 assert.equal(calls,1);
});
test('balance deadline applies to a stalled token read as well as initial chain lookup',async()=>{
 const provider={request:async p=>{if(p.method==='eth_chainId')return '0xa4b1';if(p.method==='eth_getBalance')return '0x1';if(p.method==='eth_call')return new Promise(()=>{});assert.fail('unexpected RPC');}};
 await assert.rejects(readNativeBalance(provider,user,{timeoutMs:20}),/读取超时/);
});
