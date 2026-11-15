import {MAINNET_API,address,atoms,text,validateQuote,validateFresh,orderPacket,approvalPacket,splitSignature,activeAgent,exchangeResult,journal} from './mainnet-order-core.js?v=native-mainnet-v15-20261116';
const node=(tag,cls,value)=>Object.assign(document.createElement(tag),{className:cls||'',...(value==null?{}:{textContent:value})});
async function rpc(path,body){const r=await fetch(MAINNET_API+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('主网接口请求失败（'+r.status+'）');return r.json();}
export function nativeTrade({budget=10,getWallet,pickWallet,openDeposit,onBudget,onReceipt,createSigner=async quote=>(await import('./vendor/privy/mainnet-signer.js')).createMainnetSigner(quote)}){
 const root=node('section','conversation-plan native-mainnet-trade');root.append(node('span','status-pill','Hyperliquid 主网 · ETH 现货'),node('h3','','买入 ETH'),node('p','note','站内预览、授权并确认下单。交易标的是主网 UETH/USDC，未立即成交部分自动撤销。'));
 const progress=node('div','guide-progress'),steps=['选择金额','预览订单','授权会话','确认下单','交易回执'];const paintStep=i=>{progress.replaceChildren(...steps.map((name,k)=>{const s=node('span',i===k?'active':'',name);if(i===k)s.setAttribute('aria-current','step');return s;}));};paintStep(0);root.append(progress);
 const label=node('label','plan-amount','本次买入上限（USDC，费用另计）'),input=node('input');input.type='number';input.min='10';input.step='0.01';input.value=String(budget);input.setAttribute('aria-label','站内 ETH 买入上限');label.append(input);root.append(label);
 const presets=node('div','mainnet-amount-presets');for(const value of [10,50]){const b=node('button','ghost',value===10?'10 USDC 小额体验':'50 USDC');b.type='button';b.onclick=()=>{if(busy)return;input.value=String(value);invalidate();run(()=>preview(true));};presets.append(b);}root.append(presets);
 const walletInfo=node('p','note'),controls=node('div','action-row'),quoteBox=node('div','native-quote'),fundBox=node('div','native-funds'),permission=node('div','native-permission'),result=node('div','native-receipt');result.setAttribute('role','status');root.append(walletInfo,controls,quoteBox,fundBox,permission,result);
 const status=node('p','note');status.setAttribute('role','status');root.append(status);
 const approveInfo=node('details','native-policy');approveInfo.append(node('summary','','交易权限与执行规则'),node('p','note','首次买入需签署 Hyperliquid 主网 API 交易会话授权。协议权限覆盖本账户交易，并不是链上强制的本次金额限制。Oasis 仅在本页内存保存临时密钥；本实现只签一笔已确认的 ETH 现货 IOC 买单，不支持转账、提现、合约或自动交易。刷新会丢失密钥，但协议授权仍需撤销。'),node('p','note','订单按主网市场精度计算；10 USDC 不保证满足最低名义金额。若需增加预算，会显示最低金额，由你主动选择。手续费缓冲为成交额的 1%，并非实际收费；实际以成交记录为准。'));
 const api=node('a','wallet-official-link','管理或撤销 API 授权 ↗');api.href='https://app.hyperliquid.xyz/API';api.target='_blank';api.rel='noopener noreferrer';approveInfo.append(api);root.append(approveInfo);
 let wallet=null,q=null,clock=null,signer=null,approved=false,busy=false,generation=0,observed=null,signerCap=null;
 const now=()=>clock?Math.round(clock.time+performance.now()-clock.perf):Date.now();
 const button=(parent,title,handler,cls='ghost')=>{const b=node('button',cls,title);b.type='button';b.onclick=()=>run(handler);parent.append(b);return b;};
 const same=()=>root.isConnected&&wallet&&getWallet()===wallet;
 function destroySigner(){signer?.destroy();signer=null;approved=false;signerCap=null;}
 function invalidate(){generation++;q=null;quoteBox.replaceChildren();permission.replaceChildren();fundBox.replaceChildren();status.textContent='金额已修改，请重新预览';destroySigner();paintStep(0);}
 input.oninput=()=>{if(!busy)invalidate();};
 function lockUI(value){busy=value;input.disabled=value;root.querySelectorAll('button').forEach(b=>b.disabled=value||b.dataset.blocked==='true');}
 async function run(fn){if(busy)return;lockUI(true);try{await fn();}catch(e){status.textContent=e.code===4001?'你取消了钱包请求；没有自动重试。':e.message||'操作未完成';}finally{lockUI(false);}}
 async function current(){if(!same())throw Error('钱包或页面已变化，请重新预览');const accounts=await wallet.provider.request({method:'eth_accounts'});if(!same()||accounts?.[0]?.toLowerCase()!==wallet.address.toLowerCase())throw Error('钱包账户已变化，请重新连接');}
 async function loadQuote(){await current();const r=await fetch('/api/mainnet/quote?user='+encodeURIComponent(wallet.address)+'&budget='+encodeURIComponent(input.value),{cache:'no-store',signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'预览失败');if(data.address!==wallet.address.toLowerCase()||data.budget!==text(atoms(input.value))||data.network!=='hyperliquid-mainnet')throw Error('主网预览账户、金额或网络不匹配');return data;}
 function storage(){return journal(localStorage,wallet.address);}
 function showRecord(record){
  if(!same()||record.address!==wallet.address.toLowerCase())return;
  observed=record;result.replaceChildren(node('strong','',record.message||'订单状态待核对'),node('p','note','主网 · '+wallet.address),node('p','note','客户订单号 '+record.cloid),node('p','note','买入 '+record.s+' UETH · 限价 '+record.p+' USDC · 预算 '+record.budget+' USDC'));
  if(record.oid)result.append(node('p','note','交易所订单 '+record.oid));paintStep(4);
  button(result,'核对原订单',reconcile);
  if(record.terminal)button(result,'准备另一笔订单',()=>{observed=null;result.replaceChildren();destroySigner();return preview(true);});
  else result.append(node('p','note','结果未核对前停止新下单。不会重新提交、换订单号或自动重试。'));
  try{onReceipt?.(record);}catch{}
 }
 function fundHelp(data){fundBox.replaceChildren();const available=data?.available||'未知';fundBox.append(node('strong','','准备现货资金'),node('p','note','当前 Hyperliquid 现货可用 '+available+' USDC。链上钱包余额不等于此处可用资金。'));
  const details=node('details');details.append(node('summary','','如何给这个交易账户准备资金'),node('p','note','已有 Hyperliquid 账户可向下面地址发送 USDC（Spot）；若资金在合约账户，请先转到现货。Oasis 账号钱包与外部钱包都可使用同一地址的现货资金。'),node('code','mainnet-plan-address',wallet.address));
  button(details,'复制现货收款地址',async()=>{await current();await navigator.clipboard.writeText(wallet.address);status.textContent='已复制 HyperCore 现货账户地址；不要把它当成任意网络的桥接合约。';});
  button(details,'打开钱包收款',()=>openDeposit());
  details.append(node('p','note','钱包收款不会自动桥接到 Hyperliquid。首次通过交易所或跨链入金时，请核对官方支持的网络、资产与最低金额。'));
  const link=node('a','wallet-official-link','官方入金与划转管理（可选）↗');link.href='https://app.hyperliquid.xyz/portfolio';link.target='_blank';link.rel='noopener noreferrer';details.append(link);fundBox.append(details);
 }
 async function preview(newOrder=false){
  wallet=getWallet();if(!wallet){walletInfo.textContent='先创建 Oasis 账号钱包，或连接已有钱包。';pickWallet();return;}
  const ticket=++generation;status.textContent='正在读取主网 ETH 现货盘口与资金…';quoteBox.replaceChildren();permission.replaceChildren();fundBox.replaceChildren();
  await current();walletInfo.textContent=(wallet.name||'交易钱包')+' · '+wallet.address;
  const saved=storage().load();if(saved&&!saved.terminal){showRecord(saved);q=null;return;}if(saved&&!newOrder&&!observed){showRecord(saved);q=null;return;}
  const data=await loadQuote();if(ticket!==generation||!same())return;q=Object.freeze(data);clock={time:q.checkedAt,perf:performance.now()};
  if(signerCap!==q.budget+'|'+q.market.asset)destroySigner();
  onBudget?.(q.budget);paintStep(1);status.textContent=q.reason||'预览 15 秒内有效；授权后需核对并单独确认买入，过期请刷新。';
  const list=node('dl','conversation-plan-terms');for(const [name,value] of [['交易账户',wallet.address],['交易标的','ETH 现货 · UETH/USDC'],['买一 / 卖一',q.bid+' / '+q.ask+' USDC'],['本单限价',q.p+' USDC / UETH（约 0.5% 价格缓冲）'],['买入数量',q.s+' UETH'],['最高成交额',q.cost+' USDC'],['手续费缓冲',q.feeReserve+' USDC（余额预留，非实际收费）'],['现货可用',q.available+' USDC']])list.append(node('dt','',name),node('dd','',value));quoteBox.append(list);
  if(atoms(q.budget)<atoms(q.minimumBudget))button(quoteBox,'改为最低可预览金额 '+q.minimumBudget+' USDC',()=>{input.value=q.minimumBudget;invalidate();return preview(true);},'primary');
  if(!q.ready){if(atoms(q.available)<atoms(q.cost)+atoms(q.feeReserve))fundHelp(q);return;}
  renderPermission();
 }
 function renderPermission(){permission.replaceChildren();const consent=node('label','native-consent'),check=node('input');check.type='checkbox';consent.append(check,node('span','','我已核对主网账户、买入上限和会话权限；协议授权范围不限本单金额。授权后仍由我确认本笔订单。'));permission.append(consent);
  const auth=button(permission,approved?'核对已有会话':'授权主网交易会话',async()=>{if(!check.checked)throw Error('请先阅读并勾选交易权限说明');await current();if(!signer){signer=await createSigner(q);signerCap=q.budget+'|'+q.market.asset;}
   if(!activeAgent(await rpc('/info',{type:'extraAgents',user:wallet.address}),signer.address,now())){
    const chain=await wallet.provider.request({method:'eth_chainId'}),packet=approvalPacket(signer.address,chain,now());wallet.provider.armMainnetAgent?.(signer.address);const signature=splitSignature(await wallet.provider.request({method:'eth_signTypedData_v4',params:[wallet.address,JSON.stringify(packet.typed)]}));await current();if(await wallet.provider.request({method:'eth_chainId'})!==chain)throw Error('签名网络已变化，请先核对授权状态');
    const reply=await rpc('/exchange',{action:packet.action,nonce:packet.nonce,signature});if(reply.status!=='ok')throw Error('主网会话授权未成功：'+String(reply.response));
   }
   approved=activeAgent(await rpc('/info',{type:'extraAgents',user:wallet.address}),signer.address,now());if(!approved)throw Error('交易所尚未确认授权，请再次核对；不会自动提交订单');paintStep(2);status.textContent='会话已授权，正在刷新订单预览；请核对后单独确认买入。';await preview(true);
  });
  permission.append(node('p','note',approved?'已核对会话 '+signer.address+'；临时密钥仅保留在本页。':'首次授权会弹出钱包签名。'));
  const buy=button(permission,'确认买入 · 上限 '+q.budget+' USDC',submit,'primary');buy.dataset.blocked=String(!approved);buy.disabled=!approved;
 }
 async function submit(){
  if(!navigator.locks?.request)throw Error('此浏览器不支持安全的跨标签下单锁，请使用新版 Chrome 或 Edge');
  await navigator.locks.request('oasis-mainnet-order:'+address(wallet.address),{ifAvailable:true},async lock=>{
   if(!lock)throw Error('另一个页面正在处理该账户，请先核对原订单');await current();const store=storage(),existing=store.load();if(existing&&!existing.terminal){showRecord(existing);return;}
   const selected=q;validateQuote(selected,now());if(!signer||!approved)throw Error('主网交易会话尚未授权');
   const fresh=await loadQuote();clock={time:fresh.checkedAt,perf:performance.now()};await current();validateFresh(selected,fresh,now());if(!activeAgent(await rpc('/info',{type:'extraAgents',user:wallet.address}),signer.address,now()))throw Error('会话授权已失效，请重新核对');await current();
   const nonce=now(),cloid='0x'+crypto.randomUUID().replaceAll('-',''),packet=orderPacket(selected,cloid,nonce);let signature;try{signature=splitSignature(await signer.signOrder(packet,selected,now()));}finally{destroySigner();permission.replaceChildren();}await current();if(now()>=packet.expiresAfter)throw Error('订单已过期，请重新预览');
   const pending={network:'hyperliquid-mainnet',address:address(wallet.address),cloid,nonce,expiresAfter:packet.expiresAfter,asset:selected.market.asset,p:selected.p,s:selected.s,budget:selected.budget,status:'submitting',message:'已确认，提交结果待核对',terminal:false};
   store.save(pending); // Must succeed before any exchange submission. No signature or session key is stored.
   paintStep(3);let outcome;try{outcome=exchangeResult(await rpc('/exchange',{action:packet.action,nonce,expiresAfter:packet.expiresAfter,signature}),selected);}catch{outcome={status:'unknown',message:'提交结果未确认，请核对原订单；不会自动重试',terminal:false};}
   destroySigner();q=null;permission.replaceChildren();const record={...pending,...outcome};try{store.save(record);}catch{record.message+='（回执保存失败，原订单号仍保留）';record.terminal=false;}showRecord(record);if(record.status==='filled'||record.status==='partial')window.dispatchEvent(new Event('oasis:trade-settled'));
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
 button(controls,'选择 / 更换钱包',()=>pickWallet());button(controls,'预览 / 刷新订单',()=>preview(true),'primary');
 const changed=()=>{const next=getWallet();if(next!==wallet){generation++;destroySigner();q=null;wallet=next;quoteBox.replaceChildren();permission.replaceChildren();fundBox.replaceChildren();result.replaceChildren();observed=null;walletInfo.textContent=next?(next.name||'钱包')+' · '+next.address:'尚未选择钱包';if(next&&!busy)run(()=>preview());}};
 window.addEventListener('oasis:funds-updated',changed);
 const cleanup=()=>{generation++;destroySigner();window.removeEventListener('oasis:funds-updated',changed);};
 new MutationObserver((_,observer)=>{if(!root.isConnected){cleanup();observer.disconnect();}}).observe(document.getElementById('chat-trade-plan'),{childList:true});
 queueMicrotask(()=>{wallet=getWallet();if(wallet)run(()=>preview());else walletInfo.textContent='创建 Oasis 账号钱包，或连接 Rabby、MetaMask、OKX 等已有钱包。';});return root;
}
