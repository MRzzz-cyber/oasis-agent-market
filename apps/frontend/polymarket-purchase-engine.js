import {address,display,checkQuote,predictionJournal,canonical} from './polymarket-purchase-core.js';
import {assertFundingClear} from './funding-core.js';
import {swapJournal} from './arbitrum-swap-core.js';
const rejected=e=>e?.code===4001||e?.name==='CancelledSigningError'||e?.cause?.code===4001;
export function assertPurchaseClear(storage,owner){assertFundingClear(storage,owner);if(swapJournal(storage,owner).load()?.terminal===false)throw Error('有 ETH 兑换待核对，请先核对原交易');}
export async function executePurchase({quote:q,session,wallet,getWallet,storage,locks,now=Date.now,onStage=()=>{},waitMs=15000}){
 if(!locks?.request)throw Error('请使用支持跨页面交易锁的浏览器');
 return locks.request('oasis-mainnet-order:'+address(wallet.address),{ifAvailable:true},async lock=>{
  if(!lock)throw Error('另一个页面正在处理该钱包');assertPurchaseClear(storage,wallet.address);checkQuote(q,now());
  if(getWallet()!==wallet||address(session.identity.signer)!==address(wallet.address))throw Error('交易钱包已变化');
  const j=predictionJournal(storage,wallet.address);let record;
  const save=r=>{record=j.save(r);onStage(record);return record;};
  async function fresh(){
   checkQuote(q,now());if(getWallet()!==wallet||address(session.identity.wallet)!==address(q.maker))throw Error('交易账户已变化');
   const f=await session.preview({marketId:q.marketId,outcome:q.outcome,budget:display(q.budgetAtomic)});
   if(['assetId','conditionId','exchange','feeRate','feeExponent','protocol','netAtomic'].some(k=>String(f[k])!==String(q[k]))||BigInt(f.limitAtomic)>BigInt(q.limitAtomic)||BigInt(f.balanceAtomic)<BigInt(q.budgetAtomic))throw Error('价格、费率或余额已变化，请刷新后重新确认');checkQuote(q,now());return f;
  }
  function begin(kind){return save({network:'polygon-polymarket',owner:address(wallet.address),id:crypto.randomUUID(),kind,terminal:false,at:now(),quote:q,identity:session.identity,status:'awaiting-signature',message:kind==='approval'?'请在钱包确认本次金额授权':'请在钱包确认买入订单'});}
  session.observe?.(patch=>{if(!record||record.terminal)throw Error('没有待提交的原订单');save({...record,...patch});});
  async function attempt(kind,fn){
   begin(kind);try{return await fn();}catch(error){
    const sent=session.wasSubmitted();const safe=!sent;
    save({...record,terminal:safe,status:safe?(rejected(error)?'cancelled':'not-submitted'):'unknown',message:safe?(rejected(error)?'你取消了钱包确认':'本次请求未提交，请重新核对报价'):'提交结果尚未确认，请核对原请求；不会自动重试'});
    if(!safe)return null;throw error;
   }
  }
  try{
   let f=await fresh();
   if(f.approvalNeeded){
    const approval=await attempt('approval',()=>session.approve(q));if(!approval)return record;
    if(approval.transactionId)save({...record,transactionId:approval.transactionId,status:'pending',message:'授权已提交，正在核对链上回执'});
    const until=Date.now()+Math.min(Math.max(waitMs,0),30000);
    do{save(await session.reconcile(record));if(record.terminal||Date.now()>=until)break;await new Promise(r=>setTimeout(r,1500));}while(true);
    if(record.status!=='approved')return record;f=await fresh();if(f.approvalNeeded)throw Error('授权额度尚未核实，请刷新');
   }
   const reply=await attempt('order',()=>session.submit(q));if(!reply)return record;
   if(reply.ok===false)return save({...record,terminal:true,status:'rejected',message:'平台未接受本次订单，请刷新报价后核对'});
   if(reply.ok!==true||reply.orderId?.toLowerCase()!==record.orderId)throw Error('返回的订单标识与签名不匹配，请核对原订单');
   save({...record,status:'pending',tradeIds:Array.isArray(reply.tradeIds)?reply.tradeIds.slice(0,100):[],message:reply.status==='matched'?'平台已匹配，正在核对结算':'订单已接受，正在等待平台回执'});
   try{return save(await session.reconcile(record));}catch{return save({...record,status:'pending',message:'原订单结算仍待核对，不会重复买入'});}
  }finally{session.observe?.(()=>{});}
 });
}
export async function reconcilePurchase({session,wallet,getWallet,storage}){
 if(getWallet()!==wallet||canonical(session.identity)!==canonical(predictionJournal(storage,wallet.address).load()?.identity))throw Error('当前交易账户与原订单不匹配');
 const j=predictionJournal(storage,wallet.address),record=j.load();if(!record||record.terminal)return record;return j.save(await session.reconcile(record));
}
