import {CHAIN,USDC,WETH,ROUTER,QUOTER,FACTORY,FEES,TRANSFER,WITHDRAWAL,TTL,addr,units,uint,aw,decimal,resultUint,balanceData,allowanceData,poolData,quoteData,validateQuote,approvalTx,swapTx,swapJournal} from './arbitrum-swap-core.js';
import {assertFundingClear} from './funding-core.js';
import {rpcQuantity} from './rpc-quantity.js';
export async function read(provider,method,params=[]){let timer;try{const value=await Promise.race([provider.request({method,params}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('钱包网络读取超时，请刷新或核对原交易'),{code:'RPC_TIMEOUT'})),12000);})]);return ['eth_estimateGas','eth_gasPrice'].includes(method)?rpcQuantity(value,method):value;}finally{clearTimeout(timer);}}
export async function current(wallet,getWallet){if(!wallet||getWallet()!==wallet)throw Error('钱包已变化，请重新获取报价');const [chain,accounts]=await Promise.all([read(wallet.provider,'eth_chainId'),read(wallet.provider,'eth_accounts')]);if(getWallet()!==wallet||accounts?.[0]?.toLowerCase()!==addr(wallet.address))throw Error('钱包账户已变化');if(chain!==CHAIN)throw Error('请切换至 Arbitrum One 后再购买');}
const call=(provider,to,data)=>read(provider,'eth_call',[{to,data},'latest']);
const callTx=tx=>({from:tx.from,to:tx.to,value:tx.value,data:tx.data});
function resultAddress(x){resultUint(x);if(!/^0x0{24}[0-9a-f]{40}$/i.test(x))throw Error('合约地址响应无效');return addr('0x'+x.slice(-40));}
async function blockTime(provider){const b=await read(provider,'eth_getBlockByNumber',['latest',false]);if(!/^0x[0-9a-f]+$/i.test(b?.timestamp)||BigInt(b.timestamp)>BigInt(Number.MAX_SAFE_INTEGER))throw Error('区块时间读取失败');return Number(BigInt(b.timestamp));}
export async function funds(wallet,getWallet){await current(wallet,getWallet);const [cash,native,allowance]=await Promise.all([call(wallet.provider,USDC,balanceData(wallet.address)),read(wallet.provider,'eth_getBalance',[addr(wallet.address),'latest']),call(wallet.provider,USDC,allowanceData(wallet.address))]);if(!/^0x[0-9a-f]+$/i.test(native))throw Error('ETH 余额读取失败');await current(wallet,getWallet);return {balance:resultUint(cash).toString(),native:BigInt(native).toString(),allowance:resultUint(allowance).toString()};}
async function verifyContracts(provider){const codes=await Promise.all([USDC,WETH,ROUTER,QUOTER,FACTORY].map(a=>read(provider,'eth_getCode',[a,'latest'])));if(codes.some(c=>!/^0x(?:[0-9a-f]{2})+$/i.test(c)||/^0x0+$/i.test(c)))throw Error('无法核对 Arbitrum 兑换合约');const [factory,weth]=await Promise.all([call(provider,ROUTER,'0xc45a0155'),call(provider,ROUTER,'0x4aa4a4fc')]);if(resultAddress(factory)!==FACTORY||resultAddress(weth)!==WETH)throw Error('兑换合约的工厂或 WETH 不匹配');}
export async function estimateFee(wallet,tx){
 const [gasHex,priceHex]=await Promise.all([read(wallet.provider,'eth_estimateGas',[callTx(tx)]),read(wallet.provider,'eth_gasPrice')]),gas=BigInt(gasHex),price=BigInt(priceHex);
 if(gas<=0n||gas>10000000n||price<=0n||price>1000000000000000n)throw Object.assign(Error('网络费估算异常，请刷新报价后再试'),{code:'INVALID_GAS_ESTIMATE'});
 return (gas*price*125n/100n).toString();
}
export async function readSwapQuote({wallet,getWallet,budget,now=Date.now}){
 await current(wallet,getWallet);const user=addr(wallet.address),amountIn=units(String(budget)).toString();await verifyContracts(wallet.provider);
 const [cash,time,routes]=await Promise.all([funds(wallet,getWallet),blockTime(wallet.provider),Promise.allSettled(FEES.map(async fee=>{const [pool,out]=await Promise.all([call(wallet.provider,FACTORY,poolData(fee)),call(wallet.provider,QUOTER,quoteData(amountIn,fee))]);return {fee,pool:resultAddress(pool),amountOut:resultUint(out).toString()};}))]);
 const candidates=routes.filter(r=>r.status==='fulfilled'&&uint(r.value.amountOut)>0n).map(r=>r.value).sort((a,b)=>uint(a.amountOut)>uint(b.amountOut)?-1:1);if(!candidates.length)throw Error('Uniswap USDC/ETH 直连池暂未返回可用报价，请重试');await current(wallet,getWallet);
 const route=candidates[0],createdAt=now(),q={chain:CHAIN,user,tokenIn:USDC,tokenOut:WETH,router:ROUTER,...route,budget:decimal(BigInt(amountIn),6),amountIn,minimumOut:(uint(route.amountOut)*9950n/10000n).toString(),createdAt,expiresAt:createdAt+TTL,blockTime:time,deadline:time+180,...cash};validateQuote(q,now());
 const needsApproval=uint(cash.allowance)<uint(amountIn);let feeEstimate=null,feeIssue=null,feeCode=null;
 if(uint(cash.balance)<uint(amountIn))feeIssue='insufficient-usdc';
 else if(uint(cash.native)===0n)feeIssue='insufficient-eth';
 else try{feeEstimate=await estimateFee(wallet,needsApproval?approvalTx(q):swapTx(q));if(uint(cash.native)<uint(feeEstimate))feeIssue='insufficient-eth';}catch(e){feeIssue='fee-unavailable';feeCode=['INVALID_RPC_QUANTITY','INVALID_GAS_ESTIMATE','RPC_TIMEOUT'].includes(e.code)?e.code:'FEE_RPC_UNAVAILABLE';}
 await current(wallet,getWallet);return Object.freeze({...q,feeEstimate,feeIssue,feeCode,needsApproval,ready:!feeIssue&&feeEstimate!==null});
}
async function preflight(q,wallet,getWallet,now){validateQuote(q,now());await current(wallet,getWallet);const [cash,time,pool,out]=await Promise.all([funds(wallet,getWallet),blockTime(wallet.provider),call(wallet.provider,FACTORY,poolData(q.fee)),call(wallet.provider,QUOTER,quoteData(q.amountIn,q.fee))]);if(time>=q.deadline||resultAddress(pool)!==q.pool||resultUint(out)<uint(q.minimumOut)||uint(cash.balance)<uint(q.amountIn)||uint(cash.native)===0n)throw Error('价格、余额或订单时效已变化，请刷新并重新确认');return cash;}
export async function reconcileSwap({wallet,getWallet,storage,record}){
 await current(wallet,getWallet);const j=swapJournal(storage,wallet.address),r=record||j.load();if(!r)return null;if(r.quote.user!==addr(wallet.address))throw Error('原交易账户不匹配');if(r.terminal||!r.hash)return r;
 const receipt=await read(wallet.provider,'eth_getTransactionReceipt',[r.hash]);if(!receipt)return r;
 const expected=r.kind==='approval'?approvalTx(r.quote):swapTx(r.quote),tx=await read(wallet.provider,'eth_getTransactionByHash',[r.hash]);
 if(!tx||tx.hash?.toLowerCase()!==r.hash.toLowerCase()||tx.from?.toLowerCase()!==expected.from||tx.to?.toLowerCase()!==expected.to||(tx.input||tx.data)?.toLowerCase()!==expected.data||BigInt(tx.value||'0x0')!==0n||receipt.transactionHash?.toLowerCase()!==r.hash.toLowerCase()||receipt.from?.toLowerCase()!==expected.from||receipt.to?.toLowerCase()!==expected.to)throw Error('原交易回执与钱包、金额或兑换路径不匹配，继续保留待核对');
 if(receipt.status==='0x0')return j.save({...r,status:'reverted',terminal:true,message:'原交易链上失败；网络费以钱包记录为准'});
 if(receipt.status!=='0x1')throw Error('交易状态暂无法确认');
 if(r.kind==='approval'){const allowance=resultUint(await call(wallet.provider,USDC,allowanceData(r.quote.user)));if(allowance<uint(r.quote.amountIn))throw Error('授权回执已返回，但额度未核对，请刷新');return j.save({...r,status:'approved',terminal:true,message:'本次 USDC 授权已确认；尚未兑换 ETH'});}
 if(!Array.isArray(receipt.logs))throw Error('成交日志未返回，继续核对');let spent=0n,received=0n;
 for(const log of receipt.logs){if(log.removed)continue;if(log.address?.toLowerCase()===USDC&&log.topics?.length===3&&log.topics[0]?.toLowerCase()===TRANSFER&&log.topics[1]?.toLowerCase()==='0x'+aw(r.quote.user)&&log.topics[2]?.toLowerCase()==='0x'+aw(r.quote.pool))spent+=resultUint(log.data);if(log.address?.toLowerCase()===WETH&&log.topics?.length===2&&log.topics[0]?.toLowerCase()===WITHDRAWAL&&log.topics[1]?.toLowerCase()==='0x'+aw(ROUTER))received+=resultUint(log.data);}
 if(spent!==uint(r.quote.amountIn)||received<uint(r.quote.minimumOut))throw Error('成交支出或 ETH 解包日志不匹配，继续核对原交易');await current(wallet,getWallet);
 return j.save({...r,status:'filled',terminal:true,received:received.toString(),message:'链上兑换已执行：支出 '+r.quote.budget+' USDC，收到 '+decimal(received,18)+' ETH（Arbitrum L2 回执）'});
}
export async function executeSwap({quote:q,wallet,getWallet,storage,locks,now=Date.now,onStage=()=>{},waitMs=30000}){
 if(!locks?.request)throw Error('请使用支持跨页面交易锁的新版 Chrome 或 Edge');
 return locks.request('oasis-mainnet-order:'+addr(wallet.address),{ifAvailable:true},async lock=>{
  if(!lock)throw Error('另一个页面正在操作该钱包，请先核对');await current(wallet,getWallet);const j=swapJournal(storage,wallet.address);if(j.load()?.terminal===false)throw Error('有原交易待核对，不能重复购买');assertFundingClear(storage,wallet.address);
  async function send(kind){
   await current(wallet,getWallet);validateQuote(q,now());const tx=kind==='approval'?approvalTx(q):swapTx(q),r={id:'0x'+crypto.randomUUID().replaceAll('-',''),kind,quote:q,status:'pending',terminal:false,message:kind==='approval'?'请在钱包确认本次 USDC 授权':'请在钱包确认 ETH 兑换'};j.save(r);onStage(r);
   let hash;try{wallet.provider.armArbitrumSwap?.(tx,q,kind);hash=await wallet.provider.request({method:'eth_sendTransaction',params:[tx]});if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('未收到有效交易哈希');}catch(e){const cancelled=e?.code===4001;const held=j.save({...r,status:cancelled?'cancelled':'unknown',terminal:cancelled,message:cancelled?'你取消了钱包确认，未自动重试':'提交结果不确定，请核对原交易；禁止再次提交'});onStage(held);return held;}
   let record=j.save({...r,hash,message:'交易已提交，正在等待链上回执；不会重复提交'});onStage(record);const until=Date.now()+Math.min(Math.max(waitMs,0),30000);
   do{record=await reconcileSwap({wallet,getWallet,storage,record});if(record.terminal){onStage(record);return record;}if(Date.now()>=until)break;await new Promise(resolve=>setTimeout(resolve,1500));}while(Date.now()<until);return record;
  }
  let cash=await preflight(q,wallet,getWallet,now);
  if(uint(cash.allowance)<uint(q.amountIn)){const approvalFee=await estimateFee(wallet,approvalTx(q));if(uint(cash.native)<uint(approvalFee))throw Error('当前钱包 ETH 不足以支付授权网络费');const approval=await send('approval');if(approval.status!=='approved')return approval;cash=await preflight(q,wallet,getWallet,now);}
  if(uint(cash.allowance)<uint(q.amountIn))throw Error('本次授权额度不足，请重新核对');
  await read(wallet.provider,'eth_call',[callTx(swapTx(q)),'latest']);const reserve=await estimateFee(wallet,swapTx(q));
  if(uint(cash.native)<uint(reserve))throw Error('钱包 ETH 不足以支付兑换网络费，请补充后重新获取报价');onStage({message:'请在钱包确认兑换；当前网络费估算约 '+decimal(reserve,18)+' ETH，实际以钱包为准'});
  await preflight(q,wallet,getWallet,now);return send('swap');
 });
}
