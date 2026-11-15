import test from 'node:test';
import assert from 'node:assert/strict';
import {testnetBook} from './testnet-quotes.js';
test('read-only quote proxy pins testnet, validates spot pairs and adds server time',async()=>{
  let calls=0;
  const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.hyperliquid-testnet.xyz/info');const body=JSON.parse(options.body);if(body.type==='spotMetaAndAssetCtxs')return Response.json([{},[{coin:'@1',markPx:'99999'},{coin:'@1137',markPx:'950'}]]);assert.deepEqual(body,{type:'l2Book',coin:'@1137'});return Response.json({coin:'@1137',time:1000,levels:[[],[{px:'950'}]]});};
  const reply=await testnetBook(new Request('https://oasis.test/api/testnet/book?coin=%401137'),fetcher,()=>1100);
  assert.equal(reply.status,200);assert.equal(reply.headers.get('cache-control'),'no-store');const quote=await reply.json();assert.equal(quote.checkedAt,1100);assert.equal(quote.markPx,'950');
  assert.equal((await testnetBook(new Request('https://oasis.test/api/testnet/book?coin=ETH'),fetcher)).status,400);assert.equal(calls,2);
  const invalid=await testnetBook(new Request('https://oasis.test/api/testnet/book?coin=%401137'),async()=>Response.json({coin:'@1',time:1000,levels:[]}));assert.equal(invalid.status,502);
});
