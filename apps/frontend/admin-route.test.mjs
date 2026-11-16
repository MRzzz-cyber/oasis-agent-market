import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';
test('admin aliases use the canonical asset URL without following an HTML redirect loop',async()=>{
 for(const path of ['/admin','/admin/','/admin.html']){
  const seen=[];
  const env={ASSETS:{async fetch(request){
   const pathname=new URL(request.url).pathname;seen.push(pathname);
   // Workers Assets canonicalizes admin.html to /admin.
   if(pathname==='/admin.html')return new Response(null,{status:307,headers:{location:'/admin'}});
   if(pathname==='/admin')return new Response('<script src="/admin-metrics.js"></script>',{headers:{'content-type':'text/html'}});
   throw Error('Unexpected asset path '+pathname);
  }}};
  const result=await worker.fetch(new Request('https://oasistrade.app'+path),env,{});
  assert.equal(result.status,200,path);assert.deepEqual(seen,['/admin']);assert.equal(result.headers.get('location'),null);
  assert.match(await result.text(),/admin-metrics\.js/);
  assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('x-frame-options'),'DENY');
  assert.match(result.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }
});
