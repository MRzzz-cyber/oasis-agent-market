import {KALSHI_PATH,environment,kalshiOrder,checkKalshiQuote,kalshiJournal,receiptState,assertKalshiClear} from './kalshi-core.js';
import {assertFundingClear} from './funding-core.js';
import {swapJournal} from './arbitrum-swap-core.js';
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const base64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const concat=(...items)=>{const result=new Uint8Array(items.reduce((n,v)=>n+v.length,0));let at=0;for(const item of items){result.set(item,at);at+=item.length;}return result;};
function der(tag,data){const n=data.length,length=n<128?Uint8Array.of(n):n<256?Uint8Array.of(0x81,n):Uint8Array.of(0x82,n>>8,n&255);return concat(Uint8Array.of(tag),length,data);}
export async function importKalshiKey(pem){
 if(typeof pem!=='string'||pem.length>16384)throw Error('请选择有效的 Kalshi 私钥文件');
 const match=pem.trim().match(/^-----BEGIN (RSA PRIVATE KEY|PRIVATE KEY)-----\s*([A-Za-z0-9+/=\s]+)\s*-----END \1-----$/);if(!match)throw Error('私钥格式无效，支持 Ed25519 或 RSA');
 let data=bytes(match[2].replace(/\s/g,''));if(match[1]==='RSA PRIVATE KEY'){const oid=Uint8Array.from([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]);data=der(0x30,concat(Uint8Array.of(2,1,0),oid,der(4,data)));}
 let key,algorithm;try{key=await crypto.subtle.importKey('pkcs8',data,{name:'Ed25519'},false,['sign']);algorithm={name:'Ed25519'};}catch{try{key=await crypto.subtle.importKey('pkcs8',data,{name:'RSA-PSS',hash:'SHA-256'},false,['sign']);if(key.algorithm.modulusLength<2048||key.algorithm.modulusLength>4096)throw Error();algorithm={name:'RSA-PSS',saltLength:32};}catch{throw Error('无法读取私钥，请选择 Ed25519 或 2048–4096 位 RSA 密钥');}}
 return {type:algorithm.name,async sign(timestamp,method,path){if(!key)throw Error('Kalshi 会话已断开');if(!['GET','POST'].includes(method)||!['/portfolio/balance','/portfolio/positions','/portfolio/orders','/portfolio/events/orders'].some(p=>path===KALSHI_PATH+p))throw Error('Kalshi 签名路径未开放');return base64(await crypto.subtle.sign(algorithm,key,new TextEncoder().encode(timestamp+method+path)));},close(){key=null;data.fill(0);}};
}
export async function createKalshiSession({keyId,pem,mode='production',fetchImpl=fetch}){
 environment(mode);if(!/^[0-9a-f-]{36}$/i.test(keyId||''))throw Error('请输入有效的 Kalshi API Key ID');
 const signer=await importKalshiKey(pem);pem=null;let closed=false;
 async function account(){const r=await fetchImpl('/api/auth/me',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('请先使用 Google 登录');const p=await r.json();if(!p.active||!p.id)throw Error('请先激活账号');return p;}
 let owner;try{owner=(await account()).id;}catch(e){signer.close();throw e;}
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(mode+':'+keyId)),accountHash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 async function current(){if(closed)throw Error('Kalshi 会话已断开');const p=await account();if(p.id!==owner){close();throw Error('Oasis 登录账户已变化，请重新连接 Kalshi');}}
 async function auth(resource){const timestamp=String(Date.now()),path=KALSHI_PATH+(resource==='submit'?'/portfolio/events/orders':'/portfolio/'+resource);return {keyId,timestamp,signature:await signer.sign(timestamp,resource==='submit'?'POST':'GET',path)};}
 async function call(resource,query={}){
  await current();const packet={environment:mode,resource,auth:await auth(resource),query};const r=await fetchImpl('/api/kalshi/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(packet),signal:AbortSignal.timeout(20000)});const p=await r.json();if(!r.ok)throw Error(p.error||'Kalshi 请求失败');await current();return p;
 }
 async function submit(q,clientId,onSending=()=>{}){
  await current();checkKalshiQuote(q);if(q.environment!==mode)throw Error('Kalshi 环境已变化');
  const order=kalshiOrder(q,clientId),balanceAuth=await auth('balance'),proof=await auth('submit');await current();checkKalshiQuote(q);
  const packet={environment:mode,resource:'submit',auth:proof,balanceAuth,review:q,order};onSending();
  const r=await fetchImpl('/api/kalshi/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(packet),signal:AbortSignal.timeout(45000)});let p;try{p=await r.json();}catch{throw Error('Kalshi 回执暂未确认，请核对原订单');}return {ok:r.ok,...p};
 }
 function close(){closed=true;signer.close();keyId=null;}
 return {accountHash,environment:mode,keyType:signer.type,balance:exchangeIndex=>call('balance',exchangeIndex==null?{}:{exchange_index:exchangeIndex}),positions:()=>call('positions'),orders:query=>call('orders',query),submit,close,current};
}
export async function executeKalshi({quote,session,wallet,getWallet,storage=localStorage,locks=navigator.locks,onStage=()=>{}}){
 if(!wallet||!/^0x[a-f0-9]{40}$/i.test(wallet.address||''))throw Error('请先选择现有 Oasis 钱包');
 if(!locks?.request)throw Error('请使用支持跨页面交易锁的浏览器');const owner=wallet.address.toLowerCase(),j=kalshiJournal(storage,session.accountHash);
 return locks.request('oasis-mainnet-order:'+owner,{ifAvailable:true},async lock=>{
  if(!lock)throw Error('另一个页面正在处理该钱包');assertFundingClear(storage,owner);if(swapJournal(storage,owner).load()?.terminal===false)throw Error('有 ETH 兑换待核对');
  if(j.load()?.terminal===false)throw Error('原 Kalshi 订单尚未核对');checkKalshiQuote(quote);await session.current();if(getWallet()!==wallet)throw Error('钱包已变化');
  let sent=false,r={owner,clientId:crypto.randomUUID(),terminal:false,status:'preparing',at:Date.now(),quote,message:'正在准备 Kalshi 确认请求'};const save=patch=>{r=j.save({...r,...patch});onStage(r);return r;};save({});
  try{const p=await session.submit(quote,r.clientId,()=>{if(getWallet()!==wallet)throw Error('钱包已变化');checkKalshiQuote(quote);save({status:'submitting',message:'Kalshi 订单已准备提交，请勿重复点击'});sent=true;});
   if(!p.ok&&p.submitted===false)return save({terminal:true,status:'rejected',message:p.error||'Kalshi 未接受本次订单'});
   const result=p.ok?receiptState(p.receipt,quote,r.clientId):null;
   if(result)return save(result);
   return save({status:'unknown',orderId:p.receipt?.order_id||null,message:'Kalshi 结果尚未确认，请核对原订单；不会自动重试'});
  }catch(error){if(!sent){save({terminal:true,status:'not-submitted',message:error.message||'本次请求未提交'});throw error;}return save({status:'unknown',message:'Kalshi 结果尚未确认，请核对原订单；不会自动重试'});}
 });
}
export async function reconcileKalshi({session,storage=localStorage}){
 await session.current();const j=kalshiJournal(storage,session.accountHash),r=j.load();if(!r||r.terminal)return r;let cursor;
 for(let i=0;i<3;i++){const page=await session.orders({ticker:r.quote.ticker,exchange_index:r.quote.exchangeIndex,...(cursor?{cursor}:{})});const found=page.orders?.find(o=>o.client_order_id===r.clientId);
  if(found){
   if(found.ticker!==r.quote.ticker||found.order_id!==r.orderId&&r.orderId)throw Error('Kalshi 原订单身份未匹配');
   const side=found.book_side||found.side;if(side!==(r.quote.outcome==='yes'?'bid':'ask'))throw Error('Kalshi 原订单方向尚未核实');
   const result=receiptState({...found,fill_count:found.fill_count??found.fill_count_fp,remaining_count:found.remaining_count??found.remaining_count_fp},r.quote,r.clientId);
   if(result)return j.save({...r,...result});return j.save({...r,orderId:found.order_id,message:'已找到原 Kalshi 订单，成交金额仍待核对'});
  }
  cursor=page.cursor;if(!cursor)break;
 }
 return j.save({...r,message:'尚未找到原订单；请求继续保留，不会重新提交'});
}
