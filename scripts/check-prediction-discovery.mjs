// Public GETs only. No credentials or wallet operations.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {discoverPredictions,comparePredictions,predictionQuote} from '../apps/frontend/prediction-markets.js';
const feed=await discoverPredictions();assert.ok(feed.markets.length,'No live binary markets');assert.equal(feed.version,'prediction-discovery-v1');
console.log('LIVE FEED',JSON.stringify({count:feed.markets.length,at:feed.at,first:feed.markets[0].question}));
const source=feed.markets[0],comparison=await comparePredictions({provider:source.provider,id:source.id,outcome:'yes',shares:'10'});
assert.equal(comparison.source.id,source.id);assert.equal(comparison.equivalenceVerified,false);assert.equal(comparison.providers.length,2);
console.log('LIVE COMPARISON',JSON.stringify(comparison.providers.map(p=>({provider:p.provider,count:p.markets.length,error:p.errorCode,coverage:p.coverage}))));
const q=await predictionQuote({provider:source.provider,id:source.id,outcome:'yes',shares:'10'});assert.equal(q.market.id,source.id);assert.equal(q.requested,'10');
console.log('LIVE QUOTE',JSON.stringify({subtotal:q.subtotal,depthEnough:q.depthEnough,sourceStale:q.sourceStale}));
const {Miniflare}=await import(pathToFileURL(process.env.RUNNER_TEMP+'/discovery-worker/node_modules/miniflare/dist/src/index.js'));
const result=await build({stdin:{contents:"import {predictionRoute} from './apps/frontend/prediction-markets.js';export default {fetch(request){return predictionRoute(request);}};",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],write:false});
const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-08-06'});
try{const r=await mf.dispatchFetch('https://fixture.invalid/api/predictions/discover');assert.equal(r.status,200);assert.ok((await r.json()).markets.length);console.log('PASS live discovery in actual workerd runtime; public GETs only');}finally{await mf.dispose();}
