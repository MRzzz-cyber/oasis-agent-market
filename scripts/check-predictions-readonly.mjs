// Live PUBLIC reads only. No account credentials, wallet, approval or order endpoint.
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {searchPredictions,predictionQuote} from '../apps/frontend/prediction-markets.js';
const result=await searchPredictions('Bitcoin');
const report={at:result.at,readOnly:true,providers:result.providers.map(p=>({provider:p.provider,coverage:p.coverage,count:p.markets.length,error:p.error||null})),quote:null};
const market=result.providers.flatMap(p=>p.markets).find(m=>m.provider==='polymarket');
if(market){try{const quote=await predictionQuote({provider:market.provider,id:market.id,outcome:'yes',shares:'10'});report.quote={provider:market.provider,market:market.id,subtotal:quote.subtotal,executionEnabled:quote.executionEnabled,sourceStale:quote.sourceStale};}catch(e){report.quote={provider:market.provider,market:market.id,error:e.message};}}
console.log(JSON.stringify(report,null,2));
await writeFile(join(process.env.RUNNER_TEMP||'work','prediction-readonly.json'),JSON.stringify(report,null,2));
if(result.providers.every(p=>p.error))throw Error('All public providers unavailable; live integration not verified');
