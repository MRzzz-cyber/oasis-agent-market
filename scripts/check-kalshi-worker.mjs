// Actual workerd + SQLite Durable Object. Fixture sessions/nonces only.
import {build} from 'esbuild';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const {Miniflare}=await import(pathToFileURL(process.env.RUNNER_TEMP+'/kalshi-worker/node_modules/miniflare/dist/src/index.js'));
const source="export {AccountStore} from './apps/frontend/auth.js';export default {fetch(request,env){return env.ACCOUNTS.get(env.ACCOUNTS.idFromName('fixture-accounts')).fetch(request);}};";
const result=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],write:false});
const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-08-06',durableObjects:{ACCOUNTS:{className:'AccountStore',useSQLite:true}}});
const call=body=>mf.dispatchFetch('https://fixture.invalid/internal',{method:'POST',body:JSON.stringify(body)}),token='t'.repeat(64),sub='fixture-google',kalshi={fingerprint:'a'.repeat(64),clientKey:'b'.repeat(64),bodyHash:'c'.repeat(64)};
try{
 assert.equal((await call({op:'create',token,sub,email:'fixture@example.invalid'})).status,200);
 assert.equal((await call({op:'kalshi-reserve',token,kalshi})).status,400);
 assert.equal((await call({op:'activate',token,matches:true})).status,200);
 const replies=await Promise.all([call({op:'kalshi-reserve',token,kalshi}),call({op:'kalshi-reserve',token,kalshi})]);assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call({op:'kalshi-reserve',token,kalshi:{...kalshi,fingerprint:'d'.repeat(64)}})).status,409);
 assert.equal((await call({op:'kalshi-reserve',token:'invalid',kalshi:{fingerprint:'e'.repeat(64),clientKey:'f'.repeat(64),bodyHash:'a'.repeat(64)}})).status,401);
 assert.equal((await call({op:'session',token})).status,200);
 for(let i=0;i<48;i++)assert.equal((await call({op:'localize-reserve',token})).status,200);assert.equal((await call({op:'localize-reserve',token})).status,429);
 const token2='s'.repeat(64);assert.equal((await call({op:'create',token:token2,sub:'second-fixture',email:'second@example.invalid'})).status,200);assert.equal((await call({op:'activate',token:token2,matches:true})).status,200);for(let i=0;i<32;i++)assert.equal((await call({op:'localize-reserve',token:token2})).status,200);assert.equal((await call({op:'localize-reserve',token:token2})).status,429);
 console.log('PASS workerd SQLite: active-session enforcement, concurrent nonce/client-order guards, durable 48/user and 80/global translation caps; no platform requests');
}finally{await mf.dispose();}
