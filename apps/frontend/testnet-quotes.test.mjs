import test from 'node:test';
import assert from 'node:assert/strict';
import {testnetBook} from './testnet-quotes.js';
test('read-only quote proxy pins testnet, validates spot pairs and adds server time',async()=>{
  let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.hyperliquid-testnet.xyz/info');assert.deepEqual(JSON.parse(options.body),{type:'l2Book',coin:'@1137'});return Response.json({coin:'@1137',time:1000,levels:[[],[{px:'950'}]]});};
  const reply=await testnetBook(new Request('https://oasis.test/api/testnet/book?coin=%401137'),fetcher,()=>1100);
  assert.equal(reply.status,200);assert.equal(reply.headers.get('cache-control'),'no-store');assert.equal((await reply.json()).checkedAt,1100);
  assert.equal((await testnetBook(new Request('https://oasis.test/api/testnet/book?coin=ETH'),fetcher)).status,400);assert.equal(calls,1);
  const invalid=await testnetBook(new Request('https://oasis.test/api/testnet/book?coin=%401137'),async()=>Response.json({coin:'@1',time:1000,levels:[]}));assert.equal(invalid.status,502);
});
