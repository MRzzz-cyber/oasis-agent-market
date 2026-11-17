import {assertKalshiClear} from './kalshi-core.js';
import {assertPredictionClear} from './polymarket-purchase-core.js';
import {MAINNET_API,address,atoms,text,splitSignature,journal as orderJournal} from './mainnet-order-core.js';
export const ARBITRUM='0xa4b1';
export const USDC='0xaf88d065e77c8cc2239327c5edb3a432268e5831';
export const BRIDGE='0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';
export const FUNDING_KINDS=['deposit','toSpot','toPerp','withdraw','standardize'];
const standard=mode=>['default','disabled'].includes(mode);
export function usd(value){if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,6})?$/.test(value)||atoms(value)<=0n)throw Error('请输入大于零、最多六位小数的 USDC 金额');return text(atoms(value));}
const word=value=>BigInt(value).toString(16).padStart(64,'0');
export function depositTransaction(user,amount){const value=usd(amount);if(atoms(value)<10n*100000000n)throw Error('Oasis 本入口单笔入金至少 10 USDC，请勿小额试转到桥地址');return {from:address(user),to:USDC,chainId:ARBITRUM,value:'0x0',data:'0xa9059cbb'+BRIDGE.slice(2).padStart(64,'0')+word(atoms(value)/100n)};}
export function fundingPacket(kind,user,amount,chain,nonce){
 user=address(user);if(!FUNDING_KINDS.includes(kind)||kind==='deposit'||!/^0x[0-9a-f]+$/i.test(chain)||![1,42161,8453,10,999].includes(Number(BigInt(chain)))||!Number.isSafeInteger(nonce)||nonce<=0)throw Error('资金操作或签名网络无效');
 let action,primary,fields;
 if(kind==='standardize'){action={type:'userSetAbstraction',user,abstraction:'disabled',nonce};primary='UserSetAbstraction';fields=[['user','address'],['abstraction','string'],['nonce','uint64']];}
 else if(kind==='withdraw'){action={type:'withdraw3',destination:user,amount:usd(amount),time:nonce};primary='Withdraw';fields=[['destination','string'],['amount','string'],['time','uint64']];}
 else {action={type:'usdClassTransfer',amount:usd(amount),toPerp:kind==='toPerp',nonce};primary='UsdClassTransfer';fields=[['amount','string'],['toPerp','bool'],['nonce','uint64']];}
 action.signatureChainId=chain;action.hyperliquidChain='Mainnet';const name='HyperliquidTransaction:'+primary;
 return {action,nonce,typed:{domain:{name:'HyperliquidSignTransaction',version:'1',chainId:Number(BigInt(chain)),verifyingContract:'0x'+'0'.repeat(40)},types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],[name]:[['hyperliquidChain','string'],...fields].map(([name,type])=>({name,type}))},primaryType:name,message:action}};
}
export async function fundingRpc(body,fetchImpl=fetch,path='/info'){
 if(!['/info','/exchange'].includes(path))throw Error('接口无效');
 const r=await fetchImpl(MAINNET_API+path,{method:'POST',redirect:'manual',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok||r.status>=300&&r.status<400)throw Error('资金接口暂不可用（'+r.status+'），请核对原请求');return r.json();
}
export async function currentWallet(wallet,getWallet,chain){
 if(!wallet||getWallet()!==wallet)throw Error('钱包已变化，请重新预览');address(wallet.address);
 const [accounts,network]=await Promise.all([wallet.provider.request({method:'eth_accounts'}),wallet.provider.request({method:'eth_chainId'})]);
 if(getWallet()!==wallet||accounts?.[0]?.toLowerCase()!==wallet.address.toLowerCase()||chain&&network!==chain)throw Error('钱包账户或网络已变化，请重新预览');return network;
}
export async function readFunding(user,fetchImpl=fetch){
 user=address(user);const [spot,perp,mode]=await Promise.all(['spotClearinghouseState','clearinghouseState','userAbstraction'].map(type=>fundingRpc({type,user},fetchImpl)));
 if(!Array.isArray(spot?.balances)||!Array.isArray(perp?.assetPositions)||!['default','disabled','unifiedAccount','portfolioMargin'].includes(mode))throw Error('资金或账户模式读取失败，请重试');
 const rows=spot.balances.filter(row=>row.token===0&&row.coin==='USDC');if(rows.length>1)throw Error('USDC 余额数据异常');
 const available=rows.length?atoms(rows[0].total)-atoms(rows[0].hold):0n;if(available<0n)throw Error('USDC 可用余额异常');atoms(perp.withdrawable);
 return {user,spot:text(available),perp:text(atoms(perp.withdrawable)),mode,checkedAt:Date.now(),spotState:spot,perpState:perp};
}
export async function assertSafeModeChange(funds,fetchImpl=fetch){
 if(!['unifiedAccount','portfolioMargin'].includes(funds.mode))throw Error('当前无需切换账户模式');
 if(funds.spotState.balances.some(r=>['borrowed','supplied'].some(k=>r[k]!=null&&atoms(r[k])!==0n)))throw Error('账户存在借贷或供给资产，暂不提供站内模式切换');
 const states=await fundingRpc({type:'allDexsClearinghouseState',user:funds.user},fetchImpl);
 if(!Array.isArray(states)||!states.length||!states.some(r=>Array.isArray(r)&&r[0]===''))throw Error('无法核对所有合约账户，停止模式切换');
 const names=new Set();for(const row of states){if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||names.has(row[0])||!Array.isArray(row[1]?.assetPositions))throw Error('合约账户数据无效');names.add(row[0]);for(const item of row[1].assetPositions){const size=item?.position?.szi;if(typeof size!=='string'||! /^-?\d+(?:\.\d+)?$/.test(size)||/[1-9]/.test(size))throw Error('账户存在合约仓位，停止模式切换');}}
 const orders=await Promise.all([...names].map(dex=>fundingRpc({type:'openOrders',user:funds.user,dex},fetchImpl)));
 if(orders.some(rows=>!Array.isArray(rows)||rows.length))throw Error('账户存在挂单或无法核对，停止模式切换');
}
export function assertFundingClear(storage,user){
 assertKalshiClear(storage,user);
 assertPredictionClear(storage,user);
 if(orderJournal(storage,user).load()?.terminal===false)throw Error('有交易订单待核对，请先核对原订单');
 if(fundingJournal(storage,user).load()?.terminal===false)throw Error('有资金请求待核对，请先核对原请求');
}
export function fundingJournal(storage,user){
 user=address(user);const key='oasis-mainnet-funding-v1:'+user;
 function valid(r){if(!r||r.user!==user||!FUNDING_KINDS.includes(r.kind)||!Number.isSafeInteger(r.nonce)||r.nonce<=0||typeof r.terminal!=='boolean'||typeof r.status!=='string')throw Error('资金记录损坏，停止新的资金操作');if(r.kind!=='standardize')usd(r.amount);if(r.hash&&!/^0x[0-9a-f]{64}$/i.test(r.hash))throw Error('交易哈希无效');return r;}
 function list(){const raw=storage.getItem(key);if(raw===null)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('资金记录损坏');return rows.map(valid);}
 return {list,load(){const rows=list();return rows.find(r=>!r.terminal)||rows.at(-1)||null;},save(r){valid(r);const rows=list(),i=rows.findIndex(x=>x.nonce===r.nonce);const safe={user,kind:r.kind,amount:r.amount,nonce:r.nonce,status:r.status,terminal:r.terminal,hash:r.hash,message:r.message,chain:r.chain};if(i<0){if(rows.some(x=>!x.terminal))throw Error('仍有资金请求待核对');rows.push(safe);}else{if(['kind','amount','chain'].some(k=>rows[i][k]!==safe[k]))throw Error('原资金请求不可修改');rows[i]=safe;}storage.setItem(key,JSON.stringify(rows));return safe;}};
}
export async function prepareFunding({kind,amount,wallet,getWallet,fetchImpl=fetch,now=Date.now}){
 if(!FUNDING_KINDS.includes(kind))throw Error('资金操作无效');const chain=await currentWallet(wallet,getWallet),user=address(wallet.address),funds=await readFunding(user,fetchImpl),value=kind==='standardize'?'':usd(amount);
 if(kind==='standardize')await assertSafeModeChange(funds,fetchImpl);
 else if(!standard(funds.mode))throw Error('当前为 '+funds.mode+'，请先预览并确认切换至独立现货模式');
 if(kind==='toSpot'&&atoms(value)>atoms(funds.perp)||kind==='toPerp'&&atoms(value)>atoms(funds.spot)||kind==='withdraw'&&atoms(value)>atoms(funds.perp))throw Error('可用余额不足；不使用抵押或借贷资金');
 if(kind==='withdraw'&&atoms(value)<=100000000n)throw Error('提款金额过小，请预留协议扣费；实际到账以协议账本为准');
 let tx=null,gasEstimate=null;
 if(kind==='deposit'){
  if(chain!==ARBITRUM)throw Error('请点击切换至 Arbitrum，再重新预览入金');tx=depositTransaction(user,value);
  const [balance,native,code]=await Promise.all([wallet.provider.request({method:'eth_call',params:[{to:USDC,data:'0x70a08231'+user.slice(2).padStart(64,'0')},'latest']}),wallet.provider.request({method:'eth_getBalance',params:[user,'latest']}),wallet.provider.request({method:'eth_getCode',params:[BRIDGE,'latest']})]);
  if(!/^0x[0-9a-f]{64}$/i.test(balance)||!/^0x[0-9a-f]+$/i.test(native)||!/^0x[0-9a-f]+$/i.test(code)||code==='0x0'||BigInt(native)===0n||BigInt(balance)<atoms(value)/100n)throw Error('Arbitrum USDC、ETH 手续费余额不足或桥合约读取失败');
  const gas=await wallet.provider.request({method:'eth_estimateGas',params:[tx]}),price=await wallet.provider.request({method:'eth_gasPrice'});if(!/^0x[0-9a-f]+$/i.test(gas)||!/^0x[0-9a-f]+$/i.test(price))throw Error('无法估算网络费');gasEstimate=(BigInt(gas)*BigInt(price)).toString();if(BigInt(native)<BigInt(gasEstimate))throw Error('Arbitrum ETH 不足以支付估算网络费');
 }
 await currentWallet(wallet,getWallet,chain);const nonce=now();if(!Number.isSafeInteger(nonce))throw Error('时间无效');
 return Object.freeze({kind,user,amount:value,chain,nonce,expiresAt:nonce+60000,mode:funds.mode,tx,gasEstimate,packet:kind==='deposit'?null:fundingPacket(kind,user,value,chain,nonce)});
}
export async function submitFunding({prepared:p,wallet,getWallet,storage,fetchImpl=fetch,now=Date.now,locks}){
 if(!locks?.request)throw Error('请使用支持跨页面操作锁的新版 Chrome 或 Edge');
 return locks.request('oasis-mainnet-order:'+address(p.user),{ifAvailable:true},async lock=>{
  if(!lock)throw Error('另一个页面正在处理该账户，请先核对');assertFundingClear(storage,p.user);
  if(fundingJournal(storage,p.user).list().some(r=>r.nonce===p.nonce))throw Error('原请求已处理，不允许重复提交，请重新预览新的操作');
  if(!Number.isSafeInteger(now())||now()>=p.expiresAt||p.expiresAt!==p.nonce+60000||now()<p.nonce-5000||address(wallet.address)!==p.user)throw Error('资金预览已过期，请重新预览');
  await currentWallet(wallet,getWallet,p.chain);
  const fresh=await prepareFunding({kind:p.kind,amount:p.amount,wallet,getWallet,fetchImpl,now:()=>p.nonce});
  if(fresh.mode!==p.mode||JSON.stringify(fresh.tx)!==JSON.stringify(p.tx)||JSON.stringify(fresh.packet)!==JSON.stringify(p.packet))throw Error('资金预览发生变化，请重新确认');
  let signature;
  if(p.kind!=='deposit'){
   wallet.provider.armMainnetFunding?.(p.packet);
   signature=splitSignature(await wallet.provider.request({method:'eth_signTypedData_v4',params:[p.user,JSON.stringify(p.packet.typed)]}));
   await currentWallet(wallet,getWallet,p.chain);
   if(p.kind==='standardize')await assertSafeModeChange(await readFunding(p.user,fetchImpl),fetchImpl);
   if(now()>=p.expiresAt)throw Error('签名等待过久，未提交；请重新预览');
  }
  const j=fundingJournal(storage,p.user),record={user:p.user,kind:p.kind,amount:p.amount,nonce:p.nonce,chain:p.chain,status:'submitting',terminal:false,message:'提交结果待核对'};
  j.save(record);
  try{
   if(p.kind==='deposit'){
    wallet.provider.armMainnetDeposit?.(p.tx);
    const hash=await wallet.provider.request({method:'eth_sendTransaction',params:[p.tx]});if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('交易哈希读取失败');
    return j.save({...record,hash,status:'pending',message:'入金交易已提交，等待链上确认与 Hyperliquid 入账；不会自动划转或下单'});
   }
   const response=await fundingRpc({action:p.packet.action,nonce:p.nonce,signature},fetchImpl,'/exchange');
   if(response?.status==='err'&&typeof response.response==='string')return j.save({...record,status:'rejected',terminal:true,message:'协议拒绝：'+response.response.slice(0,300)});
   if(response?.status!=='ok'||response.response?.type!=='default')throw Error('协议返回格式异常');
   return j.save({...record,status:p.kind==='withdraw'?'withdrawal-requested':'accepted',terminal:true,message:p.kind==='withdraw'?'提款请求已受理，Arbitrum 链上到账待核对；不代表已到账':'协议已受理，请刷新余额并核对结果'});
  }catch(e){
   if(p.kind==='deposit'&&e?.code===4001)return j.save({...record,status:'cancelled',terminal:true,message:'你取消了钱包交易，未提交入金'});
   try{j.save({...record,status:'unknown',message:'提交结果不确定，停止新的资金操作；核对原请求，禁止重复提交'});}catch{}
   throw Error('提交结果待核对。请保留页面与原请求，不要重复入金、划转或提款');
  }
 });
}
export async function reconcileFunding({record:r,wallet,getWallet,storage,fetchImpl=fetch}){
 await currentWallet(wallet,getWallet);if(address(wallet.address)!==r.user)throw Error('钱包不匹配');const j=fundingJournal(storage,r.user);
 if(r.kind==='standardize'){const mode=await fundingRpc({type:'userAbstraction',user:r.user},fetchImpl);if(standard(mode))return j.save({...r,status:'confirmed',terminal:true,message:'已核对为独立现货模式，请刷新订单'});}
 if(r.kind==='deposit'&&r.hash){
  await currentWallet(wallet,getWallet,ARBITRUM);const receipt=await wallet.provider.request({method:'eth_getTransactionReceipt',params:[r.hash]});
  if(receipt){
   if(receipt.transactionHash?.toLowerCase()!==r.hash.toLowerCase()||receipt.to?.toLowerCase()!==USDC||receipt.from?.toLowerCase()!==r.user)throw Error('链上回执与入金不匹配');
   if(receipt.status==='0x0')return j.save({...r,status:'reverted',terminal:true,message:'入金交易链上失败，没有入账'});
   if(receipt.status==='0x1'){
    const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',from='0x'+r.user.slice(2).padStart(64,'0'),to='0x'+BRIDGE.slice(2).padStart(64,'0');
    if(!Array.isArray(receipt.logs)||!receipt.logs.some(l=>l.address?.toLowerCase()===USDC&&l.topics?.length===3&&l.topics[0]?.toLowerCase()===transfer&&l.topics[1]?.toLowerCase()===from&&l.topics[2]?.toLowerCase()===to&&/^0x[0-9a-f]{64}$/i.test(l.data)&&BigInt(l.data)===atoms(r.amount)/100n))throw Error('未找到与金额、收款桥完全匹配的 USDC 转账事件');
    return j.save({...r,status:'chain-confirmed',terminal:true,message:'Arbitrum 转账已确认；请刷新 Hyperliquid 余额核对入账，尚未自动划转或买入'});
   }
  }
 }
 if(r.kind==='withdraw'){
  const rows=await fundingRpc({type:'userNonFundingLedgerUpdates',user:r.user,startTime:r.nonce-60000},fetchImpl);if(!Array.isArray(rows))throw Error('提款账本暂不可用');
  const row=rows.find(x=>x.delta?.type==='withdraw'&&x.delta.nonce===r.nonce);
  if(row){const sent=atoms(row.delta.usdc),fee=atoms(row.delta.fee);if(sent>atoms(r.amount)||sent+fee<atoms(r.amount))throw Error('提款账本金额与请求不符');return j.save({...r,status:'withdrawal-ledger',terminal:true,message:'协议账本已记录原提款；请核对 Arbitrum 实际到账，账本记录不等于桥已完成'});}
 }
 return {...r,message:'尚无足够证据确认原请求。继续保留待核对状态，不自动重试'};
}
