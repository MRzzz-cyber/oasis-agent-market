import {MAINNET_API,address,atoms,text,validateQuote,validateFresh,orderPacket,approvalPacket,splitSignature,activeAgent,exchangeResult,journal} from './mainnet-order-core.js?v=native-mainnet-v16-20261116';
import {readNativeBalance,displayAmount} from './mainnet-wallet.js';
import {assertFundingClear} from './funding-core.js';
const node=(tag,cls,value)=>Object.assign(document.createElement(tag),{className:cls||'',...(value==null?{}:{textContent:value})});
const chains={'0x1':'Ethereum','0xa4b1':'Arbitrum One','0x2105':'Base','0xa':'Optimism','0x3e7':'HyperEVM'};
async function rpc(path,body){const r=await fetch(MAINNET_API+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('主网接口请求失败（'+r.status+'）');return r.json();}
export function nativeTrade({budget=10,getWallet,pickWallet,openDeposit,onBudget,onReceipt,createSigner=async quote=>(await import('./vendor/privy/mainnet-signer.js')).createMainnetSigner(quote)}){
 const root=node('section','conversation-plan native-mainnet-trade');root.append(node('span','status-pill','Hyperliquid 主网 · ETH 现货'),node('h3','','买入 ETH'),node('p','note','核对网络、价格和数量，点击购买后在钱包确认。成交资产为 Hyperliquid UETH。'));
 const label=node('label','plan-amount','买入上限（USDC，费用另计）'),input=node('input');input.type='number';input.min='10';input.step='0.01';input.value=String(budget);input.setAttribute('aria-label','ETH 买入上限');label.append(input);root.append(label);
 const presets=node('div','mainnet-amount-presets');for(const value of [10,50]){const b=node('button','ghost',value===10?'10 USDC':'50 USDC');b.type='button';b.onclick=()=>{if(busy)return;input.value=String(value);invalidate();run(()=>preview(true));};presets.append(b);}root.append(presets);
 const walletInfo=node('p','note'),controls=node('div','action-row'),quoteBox=node('div','native-quote'),permission=node('div','native-permission'),result=node('div','native-receipt');result.setAttribute('role','status');root.append(walletInfo,controls,quoteBox,permission,result);
 const status=node('p','note');status.setAttribute('role','status');root.append(status);
 let wallet=null,q=null,clock=null,signer=null,approved=false,busy=false,generation=0,observed=null,signerCap=null,reviewChain=null,pendingOrder=false;
 const now=()=>clock?Math.round(clock.time+performance.now()-clock.perf):Date.now();
 const button=(parent,title,handler,cls='ghost')=>{const b=node('button',cls,title);b.type='button';b.onclick=()=>run(handler);parent.append(b);return b;};
 const same=()=>root.isConnected&&wallet&&getWallet()===wallet;
 function destroySigner(){signer?.destroy();signer=null;approved=false;signerCap=null;}
 function invalidate(){generation++;q=null;reviewChain=null;quoteBox.replaceChildren();status.textContent='金额已修改，请刷新价格';destroySigner();renderPurchase();}
 input.oninput=()=>{if(!busy)invalidate();};
 function lockUI(value){busy=value;input.disabled=value;root.querySelectorAll('button').forEach(b=>b.disabled=value||b.dataset.blocked==='true');}
 async function run(fn){if(busy)return;lockUI(true);try{await fn();}catch(e){status.textContent=e.code===4001?'你取消了钱包请求；没有下单，也不会自动重试。':e.message||'操作未完成';renderPurchase();}finally{lockUI(false);}}
 async function current(){if(!same())throw Error('钱包或页面已变化，请刷新价格');const accounts=await wallet.provider.request({method:'eth_accounts'});if(!same()||accounts?.[0]?.toLowerCase()!==wallet.address.toLowerCase())throw Error('钱包账户已变化，请重新连接');}
 async function checkChain(){await current();if(await wallet.provider.request({method:'eth_chainId'})!==reviewChain)throw Error('钱包网络已变化，请刷新价格并重新确认网络');await current();}
 async function loadQuote(){await current();const r=await fetch('/api/mainnet/quote?user='+encodeURIComponent(wallet.address)+'&budget='+encodeURIComponent(input.value),{cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'预览失败');if(data.address!==wallet.address.toLowerCase()||data.budget!==text(atoms(input.value))||data.network!=='hyperliquid-mainnet')throw Error('主网预览账户、金额或网络不匹配');return data;}
 function storage(){return journal(localStorage,wallet.address);}
 function showRecord(record){
  if(!same()||record.address!==wallet.address.toLowerCase())return;
  observed=record;pendingOrder=!record.terminal;q=null;renderPurchase();result.replaceChildren(node('strong','',record.message||'订单状态待核对'),node('p','note','主网 · '+wallet.address),node('p','note','客户订单号 '+record.cloid),node('p','note','买入 '+record.s+' UETH · 限价 '+record.p+' USDC · 预算 '+record.budget+' USDC'));
  if(record.oid)result.append(node('p','note','交易所订单 '+record.oid));
  button(result,'核对原订单',reconcile);
  if(record.terminal)button(result,'准备另一笔订单',()=>{observed=null;result.replaceChildren();destroySigner();return preview(true);});
  else result.append(node('p','note','结果未核对前停止新下单。不会重新提交、换订单号或自动重试。'));
  try{onReceipt?.(record);}catch{}
 }
 async function preview(newOrder=false){
  wallet=getWallet();q=null;renderPurchase();if(!wallet){walletInfo.textContent='先登录或连接钱包。';pickWallet();return;}
  const ticket=++generation;status.textContent='正在读取网络与价格…';quoteBox.replaceChildren();
  await current();walletInfo.textContent=(wallet.name||'交易钱包')+' · '+wallet.address;
  const saved=storage().load();pendingOrder=!!saved&&!saved.terminal;if(pendingOrder){showRecord(saved);return;}if(saved&&!newOrder&&!observed){showRecord(saved);return;}
  const chain=await wallet.provider.request({method:'eth_chainId'});
  // The chain-wallet amount is informational only. It never funds or enables an exchange order.
  const target=wallet;const [data,nativeResult]=await Promise.all([loadQuote(),readNativeBalance(target.provider,target.address).catch(()=>null)]);
  await current();if(ticket!==generation||!same())return;if(await wallet.provider.request({method:'eth_chainId'})!==chain)throw Error('读取价格期间网络已变化，请刷新价格');
  q=Object.freeze(data);reviewChain=chain;clock={time:q.checkedAt,perf:performance.now()};
  if(signerCap!==q.budget+'|'+q.market.asset)destroySigner();
  onBudget?.(q.budget);status.textContent=q.reason||'报价 15 秒内有效；点击购买后发起钱包确认。';
  const chainCash=nativeResult?.status==='ready'&&nativeResult.usdc!=null?displayAmount(nativeResult.usdc,6)+' USDC':'暂未读取成功';
  const list=node('dl','conversation-plan-terms');for(const [name,value] of [['交易网络','Hyperliquid 主网 · UETH/USDC'],['钱包签名网络',(chains[chain]||'不支持的网络')+'（'+chain+'）'],['当前卖价',q.ask+' USDC / UETH'],['最高成交价',q.p+' USDC / UETH'],['买入数量',q.s+' UETH'],['最高成交额',q.cost+' USDC'],['费用预留',q.feeReserve+' USDC（实际以回执为准）'],[(chains[chain]||'当前网络')+' 钱包 USDC',chainCash],['Hyperliquid 可交易 USDC',q.available+' USDC']])list.append(node('dt','',name),node('dd','',value));quoteBox.append(list);
  quoteBox.append(node('p','note','钱包 USDC 与 Hyperliquid 交易账户是两处独立余额。本单只使用 Hyperliquid 可交易 USDC，不能直接扣除钱包链上 USDC。'));
  if(atoms(q.budget)<atoms(q.minimumBudget))button(quoteBox,'改为最低可预览金额 '+q.minimumBudget+' USDC',()=>{input.value=q.minimumBudget;invalidate();return preview(true);},'ghost');
  if(q.ready&&!chains[chain])status.textContent='请在钱包切换到 Ethereum、Arbitrum、Base、Optimism 或 HyperEVM 主网，再刷新价格。';
  if(atoms(q.available)<atoms(q.cost)+atoms(q.feeReserve))status.textContent='本单需 Hyperliquid USDC '+text(atoms(q.cost)+atoms(q.feeReserve))+'，当前可用 '+q.available+'。钱包里的 '+chainCash+' 尚未进入交易账户。'+(atoms(q.budget)<atoms(q.minimumBudget)?' 当前金额也未满足交易所最低订单要求。':'');
  renderPurchase();
 }
 function renderPurchase(){
  permission.replaceChildren();
  if(q?.ready)permission.append(node('p','note','首次购买会请求钱包授权交易会话：协议权限覆盖账户交易，不限本单金额；Oasis 临时密钥仅提交本笔订单。'));
  const blocked=pendingOrder||!!q&&(!q.ready||!chains[reviewChain]);
  const title=pendingOrder?'购买 ETH · 请先核对原订单':!q?'购买 ETH · 获取报价':!q.ready?'购买 ETH · 暂不可用':!chains[reviewChain]?'购买 ETH · 请切换网络':'购买 ETH · 上限 '+q.budget+' USDC';
  const buy=button(permission,title,async()=>{
   if(!q){await preview(true);return;}
   if(now()>=q.expiresAt){await preview(true);status.textContent='价格已更新，请核对后再次点击购买。';return;}
   return submit();
  },'primary');buy.dataset.blocked=String(blocked);buy.disabled=busy||blocked;
  if(q?.ready){const api=node('a','wallet-official-link','撤销会话授权 ↗');api.href='https://app.hyperliquid.xyz/API';api.target='_blank';api.rel='noopener noreferrer';permission.append(api);}
 }
 async function authorize(selected){
  if(!signer){signer=await createSigner(selected);signerCap=selected.budget+'|'+selected.market.asset;}
  if(!activeAgent(await rpc('/info',{type:'extraAgents',user:wallet.address}),signer.address,now())){
   await checkChain();validateQuote(selected,now());
   const packet=approvalPacket(signer.address,reviewChain,now());wallet.provider.armMainnetAgent?.(signer.address);status.textContent='请在钱包确认本次交易会话授权…';
   const signature=splitSignature(await wallet.provider.request({method:'eth_signTypedData_v4',params:[wallet.address,JSON.stringify(packet.typed)]}));await checkChain();
   const reply=await rpc('/exchange',{action:packet.action,nonce:packet.nonce,signature});if(reply.status!=='ok')throw Error('主网会话授权未成功：'+String(reply.response));
  }
  approved=activeAgent(await rpc('/info',{type:'extraAgents',user:wallet.address}),signer.address,now());if(!approved)throw Error('交易所尚未确认授权，未提交订单，请核对后再操作');
 }
 async function submit(){
  if(!navigator.locks?.request)throw Error('此浏览器不支持安全的跨标签下单锁，请使用新版 Chrome 或 Edge');
  await navigator.locks.request('oasis-mainnet-order:'+address(wallet.address),{ifAvailable:true},async lock=>{
   if(!lock)throw Error('另一个页面正在处理该账户，请先核对原订单');await checkChain();const store=storage(),existing=store.load();if(existing&&!existing.terminal){showRecord(existing);return;}
   assertFundingClear(localStorage,wallet.address);
   const selected=q;validateQuote(selected,now());
   let fresh=await loadQuote();clock={time:fresh.checkedAt,perf:performance.now()};validateFresh(selected,fresh,now());await checkChain();
   await authorize(selected);await checkChain();validateQuote(selected,now());
   fresh=await loadQuote();clock={time:fresh.checkedAt,perf:performance.now()};await checkChain();validateFresh(selected,fresh,now());
   const nonce=now(),cloid='0x'+crypto.randomUUID().replaceAll('-',''),packet=orderPacket(selected,cloid,nonce);let signature;try{signature=splitSignature(await signer.signOrder(packet,selected,now()));}finally{destroySigner();}await checkChain();if(now()>=packet.expiresAfter)throw Error('订单已过期，请刷新价格');
   const pending={network:'hyperliquid-mainnet',address:address(wallet.address),cloid,nonce,expiresAfter:packet.expiresAfter,asset:selected.market.asset,p:selected.p,s:selected.s,budget:selected.budget,status:'submitting',message:'已确认，提交结果待核对',terminal:false};
   store.save(pending);pendingOrder=true;renderPurchase();
   status.textContent='正在提交已确认的订单…';let outcome;try{outcome=exchangeResult(await rpc('/exchange',{action:packet.action,nonce,expiresAfter:packet.expiresAfter,signature}),selected);}catch{outcome={status:'unknown',message:'提交结果未确认，请核对原订单；不会自动重试',terminal:false};}
   destroySigner();q=null;const record={...pending,...outcome};try{store.save(record);}catch{record.message+='（回执保存失败，原订单号仍保留）';record.terminal=false;}showRecord(record);if(record.status==='filled'||record.status==='partial')window.dispatchEvent(new Event('oasis:trade-settled'));
  });
 }
 async function reconcile(){await current();const store=storage(),record=store.load();if(!record)return;const response=await rpc('/info',{type:'orderStatus',user:wallet.address,oid:record.cloid});if(response.status!=='order'){showRecord({...record,message:'暂未查到原订单，继续保留待核对状态',terminal:record.terminal});return;}
  const {order:entry,status:venueStatus}=response.order||{},coin='@'+(record.asset-10000);if(!entry||entry.coin!==coin||entry.side!=='B'||atoms(entry.origSz)!==atoms(record.s)||entry.cloid&&entry.cloid!==record.cloid||atoms(entry.limitPx)!==atoms(record.p))throw Error('交易所订单与本地记录不匹配，停止核对');
  const fills=await rpc('/info',{type:'userFillsByTime',user:wallet.address,startTime:record.nonce-60000,endTime:record.nonce+3600000});if(!Array.isArray(fills))throw Error('成交明细读取失败');const seen=new Set();let size=0n,notional=0n;for(const f of fills){if(f.oid!==entry.oid||f.coin!==coin||f.side!=='B'||seen.has(f.tid))continue;seen.add(f.tid);size+=atoms(f.sz);notional+=atoms(f.sz)*atoms(f.px);}
  if(size>atoms(record.s)||size&&notional/size>atoms(record.p))throw Error('成交数量或价格超出原订单，需人工核对');
  const terminal=['filled','canceled','rejected','iocCancelRejected','minTradeNtlRejected','badAloPxRejected'].includes(venueStatus),next={...record,oid:entry.oid,status:venueStatus,terminal,message:terminal?'订单已结束 · '+venueStatus:'订单仍待核对 · '+venueStatus};
  if(size){next.size=text(size);next.avgPx=text(notional/size);next.message=(size<atoms(record.s)?'部分成交':'已成交')+' · '+next.size+' UETH · 均价 '+next.avgPx+' USDC';next.terminal=terminal;}
  if(venueStatus==='filled'&&!size){next.terminal=false;next.message='交易所显示已成交，成交明细尚未返回，请再次核对';}store.save(next);showRecord(next);if(size)window.dispatchEvent(new Event('oasis:trade-settled'));
 }
 button(controls,'更换钱包',()=>pickWallet());button(controls,'刷新价格',()=>preview(true));renderPurchase();
 const changed=()=>{const next=getWallet();generation++;destroySigner();q=null;reviewChain=null;wallet=next;pendingOrder=false;quoteBox.replaceChildren();result.replaceChildren();observed=null;renderPurchase();walletInfo.textContent=next?(next.name||'钱包')+' · '+next.address:'尚未选择钱包';if(next&&!busy)run(()=>preview());};
 window.addEventListener('oasis:funds-updated',changed);
 const cleanup=()=>{generation++;destroySigner();window.removeEventListener('oasis:funds-updated',changed);};
 new MutationObserver((_,observer)=>{if(!root.isConnected){cleanup();observer.disconnect();}}).observe(document.getElementById('chat-trade-plan'),{childList:true});
 queueMicrotask(()=>{wallet=getWallet();if(wallet)run(()=>preview());else walletInfo.textContent='登录 Oasis 或连接已有钱包后，自动显示报价。';});return root;
}
