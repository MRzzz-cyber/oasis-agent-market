import {recoverTypedDataAddress} from 'viem';
import {account} from './auth.js';
import {address,canonical,FACTORY,checkAuth,checkBatch} from './polymarket-purchase-core.js';
import {depositWallets} from './polymarket-identity.js';
const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export const purchaseConfigured=env=>['POLYMARKET_BUILDER_API_KEY','POLYMARKET_BUILDER_SECRET','POLYMARKET_BUILDER_PASSPHRASE'].every(k=>typeof env[k]==='string'&&env[k].length>0);
const counters=new Map();
function allow(user,now){for(const [k,v]of counters)if(now-v.at>60000)counters.delete(k);const r=counters.get(user)||{at:now,count:0};if(counters.size>=1000&&!counters.has(user))return false;r.count++;counters.set(user,r);return r.count<=8;}
function keys(o,list){return o&&Object.keys(o).every(k=>list.includes(k));}
export async function validateRelay(input,{now=Date.now(),recover=recoverTypedDataAddress}={}){
 if(!input||!keys(input,['body','proof','quote','batch'])||typeof input.body!=='string'||input.body.length>12000)throw Error('平台请求格式无效');
 const proof=input.proof,owner=address(proof?.payload?.message?.address);checkAuth(proof.payload,owner,now);
 if(!/^0x[0-9a-f]{130}$/i.test(proof.signature)||address(await recover({...proof.payload,signature:proof.signature}))!==owner)throw Error('平台账户归属验证失败');
 const body=JSON.parse(input.body);if(address(body.from)!==owner||address(body.to)!==FACTORY)throw Error('只允许当前签名钱包的固定平台账户请求');
 if(body.type==='WALLET-CREATE'){
  if(!keys(body,['type','from','to','metadata'])||body.metadata!=='Deploy Deposit Wallet')throw Error('平台账户创建请求不匹配');
 }else if(body.type==='WALLET'){
  if(!keys(body,['type','from','to','metadata','nonce','signature','depositWalletParams']))throw Error('平台授权请求字段无效');
  const p=body.depositWalletParams;if(!p||!keys(p,['calls','deadline','depositWallet'])||!depositWallets(owner).includes(address(p.depositWallet)))throw Error('平台账户与签名钱包不匹配');
  checkBatch(input.batch,input.quote,p.depositWallet,now);
  const b=input.batch.message;
  if(canonical(p.calls)!==canonical(b.calls)||String(body.nonce)!==String(b.nonce)||String(p.deadline)!==String(b.deadline)||!/^0x[0-9a-f]{130}$/i.test(body.signature)||address(await recover({...input.batch,signature:body.signature}))!==owner)throw Error('平台授权内容或签名不匹配');
 }else throw Error('仅开放平台账户创建及本次金额的 pUSD 授权');
 return {body:input.body,owner};
}
export async function purchaseService(request,env,{fetchImpl=fetch,getAccount=account,now=Date.now,recover}={}){
 const url=new URL(request.url);
 if(url.pathname==='/api/predictions/trading-status'&&request.method==='GET')return send({provider:'polymarket',enabled:purchaseConfigured(env),chainId:137,asset:'pUSD',version:'polymarket-purchase-v1',reason:purchaseConfigured(env)?null:'平台交易服务正在准备，暂不发起钱包签名'});
 if(url.pathname!=='/api/predictions/relay'||request.method!=='POST')return send({error:'接口不存在',submitted:false},404);
 if(request.headers.get('origin')!==url.origin)return send({error:'只允许从本站提交',submitted:false},403);
 const session=await getAccount(request,env);if(!session.ok)return send({error:'请先使用 Google 登录已激活账号',submitted:false},session.status);
 const current=await session.json();if(!current.active)return send({error:'请先激活账号',submitted:false},403);
 if(!purchaseConfigured(env))return send({error:'平台交易服务尚未配置',submitted:false},503);
 if(!allow(String(current.id),now()))return send({error:'请求过于频繁，请稍后再试',submitted:false},429);
 if(Number(request.headers.get('content-length')||0)>16384)return send({error:'请求过大',submitted:false},413);
 let body;try{const raw=await request.text();if(new TextEncoder().encode(raw).length>16384)return send({error:'请求过大',submitted:false},413);const parsed=await validateRelay(JSON.parse(raw),{now:now(),recover});body=parsed.body;}catch{return send({error:'平台请求未通过账户、金额或时效核对，请刷新报价',submitted:false},403);}
 try{
  const {buildHmacSignature}=await import('@polymarket/client'),timestamp=Math.floor(now()/1000);
  const signature=await buildHmacSignature(env.POLYMARKET_BUILDER_SECRET,timestamp,'POST','/submit',body);
  const r=await fetchImpl('https://relayer-v2.polymarket.com/submit',{method:'POST',body,redirect:'manual',headers:{'content-type':'application/json','POLY_BUILDER_API_KEY':env.POLYMARKET_BUILDER_API_KEY,'POLY_BUILDER_PASSPHRASE':env.POLYMARKET_BUILDER_PASSPHRASE,'POLY_BUILDER_TIMESTAMP':String(timestamp),'POLY_BUILDER_SIGNATURE':signature},signal:AbortSignal.timeout(12000)});
  if(!r.ok)return send({error:[401,403].includes(r.status)?'平台拒绝 Relayer 凭据或权限，请管理员核对配置；本次未提交':'平台交易账户请求未完成（HTTP '+r.status+'），请核对原请求',submitted:[401,403].includes(r.status)?false:'unknown'},502);
  const result=await r.json();if(typeof result.transactionID!=='string')return send({error:'平台未返回有效请求标识，请核对原请求',submitted:'unknown'},502);
  return send(result);
 }catch{return send({error:'平台请求结果尚未确认，请核对原请求',submitted:'unknown'},502);}
}
