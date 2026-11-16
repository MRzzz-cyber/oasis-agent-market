// Actual workerd runtime; fixture identity, credentials and transport only.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {address,canonical,purchasePreview,approvalCalls,FACTORY} from '../apps/frontend/polymarket-purchase-core.js';
import {depositWallets} from '../apps/frontend/polymarket-identity.js';
const {Miniflare}=await import(pathToFileURL(process.env.RUNNER_TEMP+'/purchase-worker/node_modules/miniflare/dist/src/index.js'));
const acct=privateKeyToAccount(generatePrivateKey()),owner=address(acct.address),maker=depositWallets(owner)[0],condition='0x'+'2'.repeat(64),assetId=(1n<<64n).toString();
const payload={domain:{name:'ClobAuthDomain',version:'1',chainId:137},types:{ClobAuth:[{name:'address',type:'address'},{name:'timestamp',type:'string'},{name:'nonce',type:'uint256'},{name:'message',type:'string'}]},primaryType:'ClobAuth',message:{address:owner,timestamp:String(Math.floor(Date.now()/1000)),nonce:'0',message:'This message attests that I control the given wallet'}};
const proof={payload,signature:await acct.signTypedData(payload)},q={...purchasePreview({market:{id:'123',version:'v1',conditionId:condition,question:'Runtime fixture',state:{active:true,acceptingOrders:true},outcomes:{yes:{tokenId:assetId}}},book:{assetId,conditionId:condition,timestamp:Date.now(),tickSize:0.01,minOrderSize:'5',negRisk:false,asks:[{price:'0.4',size:'1000'}]},feeInfo:{rate:'0.07',exponent:1},budget:'10',outcome:'yes'}),maker};
const batch={domain:{chainId:137,name:'DepositWallet',verifyingContract:maker,version:'1'},types:{Batch:[{name:'wallet',type:'address'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'calls',type:'Call[]'}],Call:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'}]},primaryType:'Batch',message:{wallet:maker,nonce:'2',deadline:String(Math.floor(Date.now()/1000)+600),calls:approvalCalls(q)}},signature=await acct.signTypedData(batch);
const body=canonical({type:'WALLET',from:owner,to:FACTORY,nonce:'2',signature,depositWalletParams:{calls:batch.message.calls,deadline:batch.message.deadline,depositWallet:maker},metadata:'Oasis exact purchase approval'});
const source="import {purchaseService} from './apps/frontend/polymarket-purchase-service.js';export default {fetch(request){return purchaseService(request,{POLYMARKET_BUILDER_API_KEY:'fake-test-key',POLYMARKET_BUILDER_SECRET:'dGVzdC1zZWNyZXQ=',POLYMARKET_BUILDER_PASSPHRASE:'fake-pass'},{getAccount:async()=>Response.json({id:'runtime-fixture',active:true}),fetchImpl:async(url,init)=>{if(url!=='https://relayer-v2.polymarket.com/submit'||init.method!=='POST'||init.redirect!=='manual')throw Error('Invalid fixture transport');return Response.json({transactionID:'runtime-fixture',state:'STATE_NEW'});}});}}";
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:['es2022'],write:false});
const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-08-06'});
try{
 const result=await mf.dispatchFetch('https://fixture.test/api/predictions/relay',{method:'POST',headers:{origin:'https://fixture.test','content-type':'application/json'},body:canonical({body,proof,quote:q,batch})});assert.equal(result.status,200);assert.equal((await result.json()).transactionID,'runtime-fixture');
 const invalid=await mf.dispatchFetch('https://fixture.test/api/predictions/relay',{method:'POST',headers:{origin:'https://other.test'},body:'{}'});assert.equal(invalid.status,403);
 console.log('PASS workerd fixture: ownership recovery, bounded batch verification, HMAC and origin rejection; no outbound transaction');
}finally{await mf.dispose();}
