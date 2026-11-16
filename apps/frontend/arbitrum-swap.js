import {CHAIN,units,uint,decimal,swapJournal} from './arbitrum-swap-core.js';
import {read,readSwapQuote,executeSwap,reconcileSwap} from './arbitrum-swap-engine.js';
const el=(tag,value,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(value==null?{}:{textContent:value})});
export function nativeTrade({budget=10,getWallet,pickWallet,onBudget,onReceipt}){
 const root=el('section',null,'conversation-plan native-wallet-swap');root.append(el('span','Arbitrum One · 钱包直接兑换','status-pill'),el('h3','买入 ETH'),el('p','使用当前钱包 USDC 兑换，ETH 直接回到同一个钱包。报价来源：Uniswap V3 USDC/WETH 直连池，自动解包为 ETH。','note'));
 const label=el('label','支付 USDC','plan-amount'),input=el('input');input.type='number';input.min='1';input.max='100000';input.step='0.01';input.value=String(budget);input.setAttribute('aria-label','钱包支付 USDC');label.append(input);root.append(label);
 const presets=el('div',null,'mainnet-amount-presets'),controls=el('div',null,'action-row'),account=el('p',null,'note'),terms=el('div',null,'native-quote'),actions=el('div',null,'action-row'),status=el('p','正在准备钱包报价…','note'),receipt=el('div',null,'native-receipt');status.setAttribute('role','status');receipt.setAttribute('role','status');root.append(presets,account,controls,terms,actions,status,receipt);
 let wallet=null,q=null,busy=false,generation=0,wrongChain=false;
 const alive=target=>root.isConnected&&getWallet()===target&&wallet===target;
 function lock(value){busy=value;input.disabled=value;root.querySelectorAll('button').forEach(b=>b.disabled=value||b.dataset.blocked==='true');}
 async function run(fn){if(busy)return;lock(true);try{await fn();}catch(e){status.textContent=e?.code===4001?'你取消了钱包确认，没有自动重试。':e.message||'操作未完成';if(wallet&&alive(wallet)){try{showRecord(swapJournal(localStorage,wallet.address).load());}catch{}}}finally{paintBuy();lock(false);}}
 function button(parent,title,fn,cls='ghost'){const b=el('button',title,cls);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function pending(){return wallet&&swapJournal(localStorage,wallet.address).load()?.terminal===false;}
 function paintBuy(){actions.replaceChildren();let held=false;try{held=!!pending();}catch{held=true;}
  const title=held?'钱包交易 · 请先核对原交易':wrongChain?'切换至 Arbitrum One':!q?'获取报价后购买 ETH':!q.ready?'购买 ETH · 钱包余额或网络费不足':'购买 ETH · 支付 '+q.budget+' USDC';
  const buy=button(actions,title,async()=>{
   if(!wallet){pickWallet();return;}
   if(wrongChain){const target=wallet;if(getWallet()!==target)throw Error('钱包已变化');await target.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]});if(!alive(target))return;await preview();return;}
   if(!q){await preview();return;}
   if(Date.now()>=q.expiresAt){await preview();status.textContent='报价已更新，请核对后再次点击购买。';return;}
   const selected=q,target=wallet;
   const record=await executeSwap({quote:selected,wallet:target,getWallet:()=>alive(target)?getWallet():null,storage:localStorage,locks:navigator.locks,onStage:r=>{if(!alive(target))return;status.textContent=r.message;if(r.id)showRecord(r);}});
   if(!alive(target))return;q=null;showRecord(record);if(record?.status==='filled'){window.dispatchEvent(new Event('oasis:trade-settled'));try{onReceipt?.({...record,network:'arbitrum-mainnet',address:target.address,budget:selected.budget});}catch{}}
  },'primary');buy.dataset.blocked=String(held||!!q&&!q.ready&&!wrongChain);buy.disabled=busy||buy.dataset.blocked==='true';
 }
 function showRecord(r){receipt.replaceChildren();if(!r)return;receipt.append(el('strong',r.message||r.status),el('p',r.kind==='approval'?'USDC 授权交易（尚不代表已买入）':'ETH 兑换交易','note'));if(r.hash){const a=el('a','查看链上交易 ↗','wallet-official-link');a.href='https://arbiscan.io/tx/'+r.hash;a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}if(!r.terminal)button(receipt,'核对原交易',async()=>{const target=wallet,checked=await reconcileSwap({wallet:target,getWallet:()=>alive(target)?getWallet():null,storage:localStorage});if(!alive(target))return;showRecord(checked);status.textContent=checked?.message||'暂未查到回执';if(checked?.terminal){q=null;if(checked.status==='filled')window.dispatchEvent(new Event('oasis:trade-settled'));} });}
 async function preview(){
  q=null;wrongChain=false;wallet=getWallet();paintBuy();terms.replaceChildren();if(!wallet){account.textContent='连接 Rabby、MetaMask 或使用已有 Oasis 钱包。';status.textContent='先选择钱包，再读取兑换报价。';pickWallet();return;}
  const target=wallet,ticket=++generation;account.textContent=(target.name||'当前钱包')+' · '+target.address;status.textContent='正在读取 Arbitrum 钱包余额和 Uniswap 链上报价…';
  const chain=await read(target.provider,'eth_chainId');if(!alive(target)||ticket!==generation)return;if(chain!==CHAIN){wrongChain=true;status.textContent='本次兑换网络固定为 Arbitrum One，请点击下方按钮在钱包切换网络。';return;}
  const old=swapJournal(localStorage,target.address).load();showRecord(old);if(old&&!old.terminal){status.textContent='原交易仍待核对，已停止新交易。';return;}
  units(input.value);const quote=await readSwapQuote({wallet:target,getWallet:()=>alive(target)?getWallet():null,budget:input.value});if(!alive(target)||ticket!==generation)return;q=quote;onBudget?.(q.budget);
  const dl=el('dl',null,'conversation-plan-terms');for(const [name,value]of [['网络','Arbitrum One'],['钱包 USDC 余额',decimal(q.balance,6)+' USDC'],['支付',q.budget+' USDC'],['预计收到',decimal(q.amountOut,18)+' ETH'],['最低收到',decimal(q.minimumOut,18)+' ETH'],['滑点上限','0.5%'],['交易池费率',(q.fee/10000)+'%（已计入报价）'],['收款地址',q.user],['钱包 ETH（支付网络费）',decimal(q.native,18)+' ETH'],[q.needsApproval?'授权交易网络费预估':'兑换交易网络费预估',decimal(q.feeEstimate,18)+' ETH（实际以钱包为准）']])dl.append(el('dt',name),el('dd',value));terms.append(dl);
  terms.append(el('p',q.needsApproval?'首次需钱包确认两笔交易：仅授权本次 '+q.budget+' USDC，然后确认兑换。兑换网络费会在授权完成后估算，由钱包展示；不申请无限额度。':'已有足够的 USDC 授权额度，点击购买后在钱包确认兑换。','note'));
  status.textContent=q.ready?'核对金额与最低到账，点击购买后在钱包确认。报价 90 秒内有效。':uint(q.balance)<uint(q.amountIn)?'钱包 USDC 不足：需 '+q.budget+'，当前 '+decimal(q.balance,6)+' USDC。':'钱包 ETH 不足以覆盖当前网络费估算。';
 }
 for(const amount of [1,10])button(presets,amount+' USDC',async()=>{input.value=String(amount);generation++;q=null;await preview();});
 input.oninput=()=>{if(busy)return;generation++;q=null;terms.replaceChildren();status.textContent='金额已修改，请重新获取报价。';paintBuy();};
 button(controls,'更换钱包',()=>pickWallet());button(controls,'刷新报价',preview);paintBuy();
 const changed=()=>{generation++;q=null;wallet=getWallet();terms.replaceChildren();receipt.replaceChildren();paintBuy();if(wallet&&!busy)run(preview);};window.addEventListener('oasis:funds-updated',changed);
 const observer=new MutationObserver(()=>{if(!root.isConnected){generation++;window.removeEventListener('oasis:funds-updated',changed);observer.disconnect();}});const host=document.getElementById('chat-trade-plan');if(host)observer.observe(host,{childList:true});
 queueMicrotask(()=>{if(getWallet())run(preview);else{status.textContent='先选择钱包。';paintBuy();}});return root;
}
