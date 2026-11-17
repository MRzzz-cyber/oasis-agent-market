import {bindMarketTitle} from './market-language.js';
import {POLYGON,PUSD,address,display,predictionJournal} from './polymarket-purchase-core.js';
import {executePurchase,reconcilePurchase} from './polymarket-purchase-engine.js';
const sessions=new WeakMap(),el=(tag,text,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(text==null?{}:{textContent:String(text)})});
const short=a=>a.slice(0,6)+'…'+a.slice(-4);
export function polymarketPurchase({market,outcome,getWallet,pickWallet,createSession,storage=localStorage,locks=navigator.locks}){
 const root=el('section',null,'prediction-purchase'),css=el('link');css.rel='stylesheet';css.href='/polymarket-purchase.css?v=polymarket-focus-v1';
 const steps=el('ol',null,'purchase-steps');for(const label of ['选择结果','准备资金','确认买入'])steps.append(el('li',label));
 const title=el('h3','买入 ');title.append(el('span',market.outcomes.find(o=>o.key===outcome)?.label||outcome));root.append(css,steps,el('span','POLYMARKET · Polygon · pUSD','prediction-eyebrow'),title,el('p',market.question,'purchase-question'));
 bindMarketTitle(root.querySelector('.purchase-question'),{...market,provider:'polymarket'});
 const amount=el('div',null,'purchase-amount'),input=el('input');input.type='number';input.inputMode='decimal';input.min='1';input.max='1000';input.step='0.01';input.value='10';input.id='prediction-budget-'+crypto.randomUUID();
 const label=el('label','本次最多支付');label.htmlFor=input.id;const amountField=el('div',null,'purchase-amount-field');amountField.append(input,el('span','pUSD'));amount.append(label,amountField);
 const presets=el('div',null,'purchase-presets');for(const value of ['5','10','25']){const b=el('button',value+' pUSD');b.type='button';b.dataset.budget=value;b.onclick=()=>{if(busy)return;input.value=value;invalidate();};presets.append(b);}amount.append(presets);root.append(amount);
 const balance=el('p','连接后查看 Polymarket 可用余额','purchase-balance'),facts=el('dl',null,'purchase-facts'),details=el('details',null,'purchase-details'),extra=el('dl');details.append(el('summary','账户与费用详情'),extra,el('small','首次连接会创建或恢复由当前钱包控制的 Polymarket 交易账户；Oasis 钱包地址保持不变。'));
 const funding=el('div'),status=el('p','正在检查交易服务…','purchase-status'),actions=el('div',null,'purchase-actions'),receipt=el('div',null,'purchase-receipt');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(balance,facts,funding,details,actions,status,receipt);
 let wallet=getWallet(),session=null,quote=null,busy=false,enabled=false,generation=0,closed=false,record=null,wrongChain=false;
 const current=()=>!closed&&root.isConnected&&getWallet()===wallet;
 function button(parent,title,fn){const b=el('button',title);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function journal(){return wallet?predictionJournal(storage,wallet.address):null;}
 function held(){return journal()?.load()?.terminal===false;}
 function paintReceipt(){receipt.replaceChildren();record=journal()?.load()||null;if(!record)return;receipt.dataset.status=record.status;
  receipt.append(el('strong',record.message),el('small','平台回执 · '+record.status));if(record.orderId)receipt.append(el('code',record.orderId));
  for(const hash of record.hashes||[]){const a=el('a','查看 Polygon 结算交易 ↗');a.href='https://polygonscan.com/tx/'+hash;a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}
  if(record.matchedShares)receipt.append(el('p','平台报告买入 '+record.matchedShares+' 份'));
 }
 function paint(){
  input.disabled=busy;presets.querySelectorAll('button').forEach(b=>{b.disabled=busy;b.setAttribute('aria-pressed',String(b.dataset.budget===input.value));});actions.replaceChildren();
  let hold=false;try{hold=held();paintReceipt();}catch(e){status.textContent=e.message;hold=true;}
  const insufficient=!!quote&&BigInt(quote.balanceAtomic)<BigInt(quote.budgetAtomic),fresh=quote&&Date.now()<quote.expiresAt;
  [...steps.children].forEach((n,i)=>{n.classList.toggle('active',i===(hold||fresh&&!insufficient?2:session?1:0));if(n.classList.contains('active'))n.setAttribute('aria-current','step');else n.removeAttribute('aria-current');});
  const title=!enabled?'交易服务准备中':!wallet?'连接钱包，准备买入':wrongChain?'切换至 Polygon 并查看价格':hold?'核对原交易':!session?'连接并查看价格':!fresh?'查看最新价格':insufficient?'等待 pUSD 到账':'确认买入 · 最多 '+display(quote.budgetAtomic)+' pUSD';
  const main=button(actions,busy?'正在处理，请查看钱包或回执…':title,async()=>{
   if(!wallet){pickWallet();return;}
   if(wrongChain){await wallet.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:POLYGON}]});if(!current())return;wrongChain=false;}
   if(!session){await connect();if(held()){status.textContent='原交易已保留，请点击核对原交易。';return;}await preview();return;}
   if(held()){record=await reconcilePurchase({session,wallet,getWallet,storage});paintReceipt();status.textContent=record.message;return;}
   if(!quote||Date.now()>=quote.expiresAt){await preview();return;}
   if(BigInt(quote.balanceAtomic)<BigInt(quote.budgetAtomic))return;
   record=await executePurchase({quote,session,wallet,getWallet,storage,locks,onStage:r=>{if(current()){record=r;status.textContent=r.message;paintReceipt();}},waitMs:15000});quote=null;paintReceipt();status.textContent=record?.message||'请核对原订单';
  });main.className='purchase-primary';main.disabled=busy||!enabled||insufficient&&!hold&&!wrongChain&&fresh;
  if(session&&!hold&&!insufficient)button(actions,'刷新价格与余额',preview).disabled=busy;
  
 }
 async function connect(){
  const existing=journal()?.load(),key=wallet;let cached=sessions.get(key);
  if(!cached){const factory=createSession||((await import('./vendor/privy/polymarket-purchase-sdk.js')).purchaseSession);cached=await factory(wallet,{getWallet,accountWallet:existing?.terminal===false?existing.identity.wallet:undefined});if(!current()){cached.close?.();throw Error('钱包已变化');}sessions.set(key,cached);}session=cached;
 }
 async function run(fn){if(busy||closed)return;busy=true;paint();try{await fn();}catch(error){if(error?.code==='AUTH_EXPIRED'){sessions.delete(wallet);session?.close?.();session=null;quote=null;}if(current()){status.textContent=error?.message||'本次操作未完成';paintReceipt();if(journal()?.load()?.terminal===false)status.textContent+='。原请求保留，不会重复提交。';}}finally{busy=false;if(!closed){if(getWallet()!==wallet)await updateWallet();else paint();}}}
 function fields(parent,rows){parent.replaceChildren();for(const [name,value]of rows)parent.append(el('dt',name),el('dd',value));}
 async function preview(){
  const ticket=++generation;quote=null;facts.replaceChildren();funding.replaceChildren();
  if(!session){status.textContent='连接后核对余额与价格，再由你确认买入。';paint();return;}
  status.textContent='正在读取实时价格和可用余额…';
  const q=await session.preview({marketId:market.id,outcome,budget:input.value});
  if(!current()||ticket!==generation)return;quote={...q,maker:address(session.identity.wallet)};
  balance.textContent='Polymarket 可用余额 · '+display(q.balanceAtomic)+' pUSD';
  fields(facts,[['最多支付',display(q.budgetAtomic)+' pUSD'],['最低购买份额',display(q.minimumSharesAtomic)+' 份'],['最高成交单价',display(q.limitAtomic)+' pUSD / 份']]);
  fields(extra,[['网络','Polygon · 137'],['手续费预留',display(q.feeReserveAtomic)+' pUSD（已含在支付上限内）'],['交易账户',short(session.identity.wallet)],['网络费','平台 Relayer 代付']]);
  const insufficient=BigInt(q.balanceAtomic)<BigInt(q.budgetAtomic);
  status.textContent=insufficient?'充值到账后刷新，重新核对价格，再确认买入。':q.approvalNeeded?'先确认本次金额授权，再签名买入。未能全部成交则取消，不挂单。':'核对价格与份额后，在钱包签名确认。未能全部成交则取消，不挂单。';
  if(insufficient)paintFunding(q);paint();
 }
 function paintFunding(q){
  const box=el('section',null,'prediction-funding'),maker=address(session.identity.wallet),difference=BigInt(q.budgetAtomic)-BigInt(q.balanceAtomic);
  box.append(el('span','准备交易资金','prediction-eyebrow'),el('strong','还差 '+display(difference)+' pUSD'),el('p','转入 Polygon pUSD，到帐后继续这笔买入。'));
  const receive=el('details',null,'purchase-receive');receive.append(el('summary','查看充值地址与收款码'),el('small','仅接收 Polygon pUSD · 此地址为当前钱包控制的 Polymarket 交易账户'),el('code',maker));
  button(receive,'复制交易账户地址',async()=>{if(!current()||address(session.identity.wallet)!==maker)throw Error('交易账户已变化');await navigator.clipboard.writeText(maker);status.textContent='已复制 · 请核对 Polygon 与 pUSD 资产';});
  const canvas=el('canvas');canvas.hidden=true;canvas.setAttribute('aria-label','Polygon pUSD 交易账户收款码');
  button(receive,'显示收款码',async()=>{if(!current())return;const {drawReceiveQr}=await import('./vendor/privy/deposit-qr.js');await drawReceiveQr(canvas,'ethereum:'+PUSD+'@137/transfer?address='+maker);if(current())canvas.hidden=false;});
  receive.append(canvas,el('small','不支持直接转入 Arbitrum USDC；当前不会自动跨链或兑换。'));box.append(receive);button(box,'已充值，刷新余额',preview);funding.replaceChildren(box);
 }
 function invalidate(){generation++;quote=null;facts.replaceChildren();funding.replaceChildren();status.textContent='金额已变化，请查看最新价格。';paint();}
 input.oninput=invalidate;
 async function updateWallet(){
  generation++;wallet=getWallet();session=null;quote=null;facts.replaceChildren();funding.replaceChildren();extra.replaceChildren();balance.textContent='连接后查看 Polymarket 可用余额';wrongChain=false;
  if(wallet){const candidate=wallet;wrongChain=await wallet.provider.request({method:'eth_chainId'})!==POLYGON;if(getWallet()!==candidate||closed)return;record=journal().load();}
  status.textContent=record?.terminal===false?'发现原交易，请连接同一钱包后核对。':'连接后核对余额与价格，再由你确认买入。';paint();
 }
 async function initialize(){try{const r=await fetch('/api/predictions/trading-status',{cache:'no-store',signal:AbortSignal.timeout(10000)}),p=await r.json();if(closed)return;enabled=r.ok&&p.enabled===true;if(!enabled){status.textContent='平台交易服务正在准备，当前仍可查看盘口。';paint();return;}await updateWallet();}catch(error){if(!closed){status.textContent=error.message||'交易服务暂不可用';paint();}}}
 const changed=()=>{if(!closed&&!busy&&getWallet()!==wallet)updateWallet().catch(e=>{status.textContent=e.message;});};window.addEventListener('oasis:funds-updated',changed);
 queueMicrotask(initialize);const timer=setInterval(()=>{if(!busy&&quote&&Date.now()>=quote.expiresAt)paint();},1000);
 root.canLeave=()=>!busy;root.dispose=()=>{closed=true;generation++;clearInterval(timer);window.removeEventListener('oasis:funds-updated',changed);};return root;
}
