import {address,canonical} from './polymarket-purchase-core.js';
import {assertFundingClear,currentWallet} from './funding-core.js';
import {swapJournal} from './arbitrum-swap-core.js';
import {SOURCES,amountAtomic,checkBridgeQuote,bridgeTx,bridgeJournal,hash} from './crosschain-core.js';
export async function bridgeRequest(operation,body,fetchImpl=fetch){if(!['prepare','verify','status'].includes(operation))throw Error('跨链操作无效');const r=await fetchImpl('/api/predictions/bridge/'+operation,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const p=await r.json();if(!r.ok)throw Error(p.error||'跨链服务暂不可用');return p;}
function clear(storage,owner){assertFundingClear(storage,owner);if(swapJournal(storage,owner).load()?.terminal===false)throw Error('原 ETH 交易待核对');}
const hex=x=>{if(typeof x!=='string'||!/^0x[0-9a-f]+$/i.test(x))throw Error('源网络余额或费用读取无效');return BigInt(x);};
async function sourceCheck(q,wallet,getWallet){const chain=SOURCES[q.sourceChain].chain;await currentWallet(wallet,getWallet,chain);const tx=bridgeTx(q),simulation={...tx};delete simulation.chainId;
 const [balance,native,simulationResult,gas,price]=await Promise.all([
 wallet.provider.request({method:'eth_call',params:[{to:q.fromToken,data:'0x70a08231'+q.owner.slice(2).padStart(64,'0')},'latest']}),
 wallet.provider.request({method:'eth_getBalance',params:[q.owner,'latest']}),
 wallet.provider.request({method:'eth_call',params:[simulation,'latest']}),
 wallet.provider.request({method:'eth_estimateGas',params:[tx]}),wallet.provider.request({method:'eth_gasPrice'})]);
 if(!/^0x[0-9a-f]{64}$/i.test(balance)||hex(balance)<BigInt(q.amountAtomic))throw Error('来源钱包 USDC 余额不足');if(!/^0x0{63}1$/i.test(simulationResult))throw Error('跨链转账模拟未通过');
 const fee=hex(gas)*hex(price)*120n/100n;if(fee<=0n||hex(native)<fee)throw Error('来源网络 ETH 不足以支付网络费');await currentWallet(wallet,getWallet,chain);return {gasFeeWei:fee.toString(),balanceAtomic:hex(balance).toString()};
}
export async function prepareBridge({sourceChain,amount,maker,session,wallet,getWallet,storage=localStorage,fetchImpl=fetch}){
 clear(storage,wallet.address);if(!Object.hasOwn(SOURCES,sourceChain))throw Error('来源网络未开放');amountAtomic(amount);if(address(session.identity.signer)!==address(wallet.address)||address(session.identity.wallet)!==address(maker))throw Error('交易账户已变化');
 const proof=session.bridgeProof?.();if(!proof)throw Error('请先重新连接 Polymarket 交易账户');const packet=await bridgeRequest('prepare',{owner:address(wallet.address),maker:address(maker),sourceChain,amount,proof},fetchImpl);checkBridgeQuote(packet.quote);
 if(packet.quote.owner!==address(wallet.address)||packet.quote.maker!==address(maker)||packet.quote.sourceChain!==sourceChain||packet.quote.amount!==amount)throw Error('跨链预览与当前选择不匹配');
 await wallet.provider.armCrosschainTransfer?.(packet.quote,packet.attestation);
 const stats=await sourceCheck(packet.quote,wallet,getWallet);return Object.freeze({...packet,...stats});
}
export async function executeBridge({prepared,wallet,getWallet,storage=localStorage,locks=navigator.locks,fetchImpl=fetch,onStage=()=>{}}){
 if(!locks?.request)throw Error('请使用支持跨页面交易锁的浏览器');const q=prepared.quote;
 return locks.request('oasis-mainnet-order:'+address(wallet.address),{ifAvailable:true},async lock=>{
  if(!lock)throw Error('另一个页面正在处理该账户');clear(storage,wallet.address);checkBridgeQuote(q);if(q.owner!==address(wallet.address))throw Error('来源钱包已变化');
  const j=bridgeJournal(storage,q.owner);if(j.list().some(r=>r.quote.quoteId===q.quoteId))throw Error('原跨链请求不可再次提交');
  const verified=await bridgeRequest('verify',{quote:q,attestation:prepared.attestation},fetchImpl);if(verified.verified!==true)throw Error('跨链预览未通过核对');
  await wallet.provider.armCrosschainTransfer?.(q,prepared.attestation);const fresh=await sourceCheck(q,wallet,getWallet);if(BigInt(fresh.gasFeeWei)>BigInt(prepared.gasFeeWei))throw Error('网络费已上升，请重新预览');checkBridgeQuote(q);
  let record={owner:q.owner,id:crypto.randomUUID(),quote:JSON.parse(canonical(q)),terminal:false,status:'submitting',message:'请在钱包确认本次跨链充值'};const save=r=>{record=j.save(r);onStage(record);return record;};save(record);
  try{const result=await wallet.provider.request({method:'eth_sendTransaction',params:[bridgeTx(q)]});if(!hash(result))throw Error('原转账哈希未知');return save({...record,hash:result.toLowerCase(),status:'pending',message:'源转账已提交，正在等待跨链到账；不会重复发送'});}
  catch(error){if(error?.code===4001||error?.cause?.code===4001)return save({...record,status:'cancelled',terminal:true,message:'你取消了跨链转账'});return save({...record,status:'unknown',terminal:false,message:'转账结果待核对，保留原请求；请勿重复跨链'});}
 });
}
export async function recoverBridge({wallet,getWallet,storage=localStorage,fetchImpl=fetch,sourceHash}){
 if(getWallet()!==wallet)throw Error('钱包已变化');const j=bridgeJournal(storage,wallet.address),r=j.load();if(!r||r.terminal)return r;if(sourceHash&&!hash(sourceHash))throw Error('请输入原来源网络的交易哈希');if(r.hash&&sourceHash&&r.hash!==sourceHash.toLowerCase())throw Error('原转账哈希不可替换');
 const candidate=sourceHash?.toLowerCase()||r.hash,response=await bridgeRequest('status',{quote:r.quote,hash:candidate},fetchImpl);if(getWallet()!==wallet)throw Error('钱包已变化');
 if(!['pending','unknown','source-confirmed','needs-support','completed','reverted'].includes(response.status)||typeof response.terminal!=='boolean')throw Error('跨链回执格式无效');
 return j.save({...r,...response,hash:candidate});
}
