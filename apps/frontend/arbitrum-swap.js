import {CHAIN,units,uint,decimal,swapJournal} from './arbitrum-swap-core.js';
import {read,readSwapQuote,executeSwap,reconcileSwap} from './arbitrum-swap-engine.js';
const el=(tag,value,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(value==null?{}:{textContent:value})});
const short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'尚未连接';
function amount(value,places,precision=8){const full=decimal(value,places),[i,f='']=full.split('.'),tail=f.slice(0,precision).replace(/0+$/,'');if(i==='0'&&!tail&&BigInt(value)>0n)return '<0.'+'0'.repeat(precision-1)+'1';return i+(tail?'.'+tail:'');}
export function nativeTrade({budget=10,getWallet,pickWallet,onBudget,onReceipt}){
 const root=el('section',null,'conversation-plan native-wallet-swap'),css=el('link');css.rel='stylesheet';css.href='/arbitrum-swap.css?v=wallet-card-v18';root.append(css);
 const top=el('div',null,'swap-top'),refresh=el('button','刷新报价','swap-refresh');refresh.type='button';top.append(el('span','Arbitrum One · 钱包直接兑换','swap-network'),refresh);root.append(top,el('h3','买入 ETH'),el('p','支付 USDC，ETH 直接到当前钱包。','swap-subtitle'));
 const walletButton=el('button',null,'swap-wallet'),walletCopy=el('span',null,'swap-wallet-copy'),walletName=el('span','选择交易钱包','swap-wallet-name'),walletAddress=el('span','连接已有钱包或使用 Oasis 账号钱包','swap-wallet-address');walletCopy.append(walletName,walletAddress);walletButton.type='button';walletButton.append(walletCopy,el('span','更换钱包 ↗','swap-wallet-action'));root.append(walletButton);
 const pay=el('div',null,'swap-panel'),payHeading=el('div',null,'swap-panel-heading'),balance=el('span','余额待核对','swap-balance'),label=el('label','你支付');label.htmlFor='swap-amount-'+crypto.randomUUID();payHeading.append(label,balance);
 const line=el('div',null,'swap-amount-line'),input=el('input',null,'swap-amount');input.id=label.htmlFor;input.type='number';input.inputMode='decimal';input.min='1';input.max='100000';input.step='0.01';input.value=String(budget);input.setAttribute('aria-label','钱包支付 USDC');const token=el('span',null,'swap-token');token.append(el('span','$','swap-token-icon'),el('span','USDC'));line.append(input,token);const presets=el('div',null,'swap-presets');pay.append(payHeading,line,presets);root.append(pay,el('div','↓','swap-direction'));
 const receive=el('div',null,'swap-panel swap-panel--receive'),receiveHead=el('div',null,'swap-panel-heading');receiveHead.append(el('span','你预计收到'),el('span','Uniswap V3'));const receiveLine=el('div',null,'swap-amount-line'),output=el('span','—','swap-receive-amount'),eth=el('span',null,'swap-token');eth.append(el('span','Ξ','swap-token-icon swap-token-icon--eth'),el('span','ETH'));receiveLine.append(output,eth);const recipient=el('p','到账至你当前的钱包','swap-receive-note');receive.append(receiveHead,receiveLine,recipient);root.append(receive);
 const summary=el('dl',null,'swap-summary'),details=el('details',null,'swap-details'),detailBody=el('div');details.append(el('summary','交易详情'),detailBody);details.hidden=true;
 const approval=el('p',null,'swap-approval-note'),errorBox=el('div',null,'swap-error'),errorTitle=el('strong'),errorBody=el('p'),errorCode=el('small');errorBox.setAttribute('role','alert');errorBox.append(errorTitle,errorBody,errorCode);errorBox.hidden=true;
 const actions=el('div',null,'swap-actions'),status=el('p','正在准备报价…','swap-status'),receipt=el('div',null,'swap-receipt');status.setAttribute('role','status');status.setAttribute('aria-live','polite');receipt.setAttribute('role','status');receipt.hidden=true;root.append(summary,details,approval,errorBox,actions,status,receipt);
 let wallet=null,q=null,busy=false,generation=0,wrongChain=false,phase='',lastRecord=null;
 const alive=target=>root.isConnected&&getWallet()===target&&wallet===target;
 function notice(title,body,code=''){errorBox.hidden=false;errorTitle.textContent=title;errorBody.textContent=body;errorCode.textContent=code?'错误代码：'+code:'';errorCode.hidden=!code;}
 function clearNotice(){errorBox.hidden=true;errorTitle.textContent='';errorBody.textContent='';errorCode.textContent='';}
 function walletLabel(){walletName.textContent=wallet?(wallet.name||'当前钱包').replace(' · Privy',''):'选择交易钱包';walletAddress.textContent=wallet?short(wallet.address):'连接已有钱包或使用 Oasis 账号钱包';walletAddress.title=wallet?.address||'';recipient.textContent=wallet?'到账至 '+short(wallet.address)+' · 与支付钱包一致':'到账至你当前的钱包';}
 function lock(value){busy=value;root.setAttribute('aria-busy',String(value));input.disabled=value;root.querySelectorAll('button').forEach(b=>b.disabled=value||b.dataset.blocked==='true');}
 async function run(fn){if(busy)return;lock(true);clearNotice();try{await fn();}catch(e){const message=e?.code===4001?'你取消了钱包确认，可以在核对后重新操作。':e.message||'请刷新报价后重试。';notice(e?.code===4001?'已取消钱包确认':'暂时无法继续',message);status.textContent='未自动重试或提交替代交易。';if(wallet&&alive(wallet)){try{showRecord(swapJournal(localStorage,wallet.address).load());}catch{}}}finally{phase='';paintBuy();lock(false);}}
 function button(parent,title,fn,cls='swap-refresh'){const b=el('button',title,cls);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function pending(){return wallet&&swapJournal(localStorage,wallet.address).load()?.terminal===false;}
 function paintBuy(){actions.replaceChildren();let held=false;try{held=!!pending();}catch{held=true;}
  const blocked=held||!!q&&!q.ready&&!wrongChain;
  let title=!wallet?'连接钱包':held?'请先核对原交易':wrongChain?'切换至 Arbitrum One':!q?'重新获取报价':q.ready?'购买 ETH · 支付 '+q.budget+' USDC':q.feeIssue==='insufficient-usdc'?'购买 ETH · USDC 余额不足':q.feeIssue==='insufficient-eth'?'购买 ETH · 需要网络费 ETH':'购买 ETH · 等待费用核对';if(busy&&phase)title=phase;
  const buy=button(actions,title,async()=>{
   if(!wallet){pickWallet();return;}
   if(wrongChain){const target=wallet;if(getWallet()!==target)throw Error('钱包已变化');await target.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});if(!alive(target))return;await preview();return;}
   if(!q){await preview();return;}
   if(Date.now()>=q.expiresAt){await preview();status.textContent='报价已更新，请核对后再点击购买。';return;}
   const selected=q,target=wallet;phase='正在核对兑换…';paintBuy();
   const record=await executeSwap({quote:selected,wallet:target,getWallet:()=>alive(target)?getWallet():null,storage:localStorage,locks:navigator.locks,onStage:r=>{if(!alive(target))return;status.textContent=r.message;phase=r.hash&&!r.terminal?'正在等待链上确认…':r.status==='approved'?'正在准备兑换…':r.kind==='approval'?'请在钱包确认授权':r.kind==='swap'?'请在钱包确认兑换':'正在核对兑换…';if(r.id)showRecord(r);paintBuy();lock(true);}});
   if(!alive(target))return;q=null;showRecord(record);status.textContent=record?.message||'请核对交易结果。';if(record?.status==='filled'){window.dispatchEvent(new Event('oasis:trade-settled'));try{onReceipt?.({...record,network:'arbitrum-mainnet',address:target.address,budget:selected.budget});}catch{}}
  },'swap-buy');buy.dataset.blocked=String(blocked);buy.disabled=busy||blocked;
  if(q?.feeIssue==='fee-unavailable')button(actions,'重新估算网络费',preview);
 }
 function showRecord(r){lastRecord=r;receipt.replaceChildren();receipt.hidden=!r;if(!r)return;receipt.append(el('strong',r.message||r.status),el('p',r.kind==='approval'?'本次 USDC 授权 · 尚不代表已买入 ETH':'ETH 兑换交易'));if(r.hash){const a=el('a','查看链上交易 ↗','wallet-official-link');a.href='https://arbiscan.io/tx/'+r.hash;a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}if(!r.terminal)button(receipt,'核对原交易',async()=>{const target=wallet,checked=await reconcileSwap({wallet:target,getWallet:()=>alive(target)?getWallet():null,storage:localStorage});if(!alive(target))return;showRecord(checked);status.textContent=checked?.message||'暂未查到回执';if(checked?.terminal){q=null;if(checked.status==='filled')window.dispatchEvent(new Event('oasis:trade-settled'));}});}
 function paintQuote(){
  output.className='swap-receive-amount';output.textContent=amount(q.amountOut,18);output.title=decimal(q.amountOut,18)+' ETH';balance.textContent='余额 '+decimal(q.balance,6)+' USDC';
  summary.replaceChildren();for(const [name,value]of [['最低到账',amount(q.minimumOut,18)+' ETH'],['滑点保护','0.5%'],[q.needsApproval?'本次授权网络费预估':'本次兑换网络费预估',q.feeEstimate===null?'暂未获取':amount(q.feeEstimate,18)+' ETH']])summary.append(el('dt',name),el('dd',value));
  detailBody.replaceChildren();const price=uint(q.amountIn)*10n**18n/uint(q.amountOut);for(const value of ['报价来源：Uniswap V3 · Arbitrum One','兑换价格约 '+amount(price,6,4)+' USDC / ETH（含交易池费用）','交易池费率 '+(q.fee/10000)+'% · 已计入预计到账','收款地址：'+q.user,'网络费 ETH 余额：'+decimal(q.native,18)+' ETH','实际网络费以钱包确认界面为准。'])detailBody.append(el('p',value));details.hidden=false;
  approval.textContent=q.needsApproval?'首次需确认授权和兑换两笔交易；仅授权本次 '+q.budget+' USDC。兑换网络费将在授权确认后估算。':'已有足够授权额度，点击购买后在钱包确认兑换。';
  if(q.feeIssue==='insufficient-usdc')notice('当前钱包 USDC 余额不足','本次需 '+q.budget+' USDC，当前钱包有 '+decimal(q.balance,6)+' USDC。'+(wallet.kind==='embedded'?'如果资金在 Rabby，请点击上方钱包切换。':'请核对是否选中了持有资金的钱包。'));
  else if(q.feeIssue==='insufficient-eth')notice('当前钱包需要网络费 ETH','Arbitrum 交易需要少量 ETH 支付网络费。请为上方当前钱包补充 ETH，或切换到已有 ETH 的钱包。');
  else if(q.feeIssue==='fee-unavailable')notice('暂时无法估算网络费','余额和兑换报价已保留。请点击“重新估算网络费”；核对成功前不会发起授权或兑换。',q.feeCode);
  status.textContent=q.ready?'核对预计到账后，在钱包确认即可。报价 90 秒内有效。':'处理上方提示后，刷新报价即可继续。';
 }
 async function preview(){
  q=null;wrongChain=false;wallet=getWallet();walletLabel();clearNotice();summary.replaceChildren();details.hidden=true;approval.textContent='';phase='正在获取报价…';paintBuy();
  if(!wallet){balance.textContent='余额待核对';output.textContent='—';status.textContent='选择钱包后自动读取余额与报价。';pickWallet();return;}
  const target=wallet,ticket=++generation;balance.textContent='正在读取余额…';output.textContent='—';output.className='swap-receive-amount swap-loading';status.textContent='正在读取钱包余额与链上兑换报价…';
  const chain=await read(target.provider,'eth_chainId');if(!alive(target)||ticket!==generation)return;if(chain!==CHAIN){wrongChain=true;output.className='swap-receive-amount';notice('请切换到 Arbitrum One','本次支付和收款均在 Arbitrum 网络。点击下方按钮，在钱包确认切换。');status.textContent='尚未请求授权或交易。';return;}
  const old=swapJournal(localStorage,target.address).load();showRecord(old);if(old&&!old.terminal){output.className='swap-receive-amount';status.textContent='请核对原交易，确认结果前不会再次提交。';return;}
  units(input.value);const quote=await readSwapQuote({wallet:target,getWallet:()=>alive(target)?getWallet():null,budget:input.value});if(!alive(target)||ticket!==generation)return;q=quote;onBudget?.(q.budget);paintQuote();
 }
 for(const value of [1,5,10])button(presets,value+' USDC',async()=>{input.value=String(value);generation++;q=null;await preview();},'swap-preset');
 input.oninput=()=>{if(busy)return;generation++;q=null;output.textContent='—';output.className='swap-receive-amount';summary.replaceChildren();details.hidden=true;approval.textContent='';clearNotice();status.textContent='输入完成后刷新报价。';paintBuy();};input.onchange=()=>{if(!busy&&getWallet())run(preview);};
 walletButton.onclick=()=>run(()=>pickWallet());refresh.onclick=()=>run(preview);wallet=getWallet();walletLabel();paintBuy();
 const changed=()=>{generation++;q=null;wallet=getWallet();walletLabel();summary.replaceChildren();details.hidden=true;showRecord(null);paintBuy();if(wallet&&!busy)run(preview);};window.addEventListener('oasis:funds-updated',changed);
 const observer=new MutationObserver(()=>{if(!root.isConnected){generation++;window.removeEventListener('oasis:funds-updated',changed);observer.disconnect();}});const host=document.getElementById('chat-trade-plan');if(host)observer.observe(host,{childList:true});
 queueMicrotask(()=>{if(getWallet())run(preview);else{status.textContent='先选择钱包，资金会直接回到同一地址。';paintBuy();}});return root;
}
