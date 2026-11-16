import {POLYGON,PUSD,address,display,predictionJournal} from './polymarket-purchase-core.js';
import {executePurchase,reconcilePurchase} from './polymarket-purchase-engine.js';
const sessions=new WeakMap(),el=(tag,text,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(text==null?{}:{textContent:String(text)})});
const short=a=>a.slice(0,6)+'…'+a.slice(-4);
export function polymarketPurchase({market,outcome,getWallet,pickWallet,createSession,storage=localStorage,locks=navigator.locks}){
 const root=el('section',null,'prediction-purchase'),css=el('link');css.rel='stylesheet';css.href='/polymarket-purchase.css?v=1';root.append(css,el('span','Polymarket · Polygon','prediction-eyebrow'),el('h3','买入 '+(market.outcomes.find(o=>o.key===outcome)?.label||outcome)),el('p',market.question,'purchase-question'));
 root.append(el('small','首次连接会创建或恢复由当前钱包控制的 Polymarket 交易账户；Oasis 钱包地址保持不变。'));
 const input=el('input');input.type='number';input.inputMode='decimal';input.min='1';input.max='1000';input.step='0.01';input.value='10';input.id='prediction-budget-'+crypto.randomUUID();const label=el('label','最多支付 · pUSD');label.htmlFor=input.id;root.append(label,input);
 const facts=el('dl'),funding=el('div'),status=el('p','正在检查交易服务…','purchase-status'),actions=el('div'),receipt=el('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(facts,funding,actions,status,receipt);
 let wallet=getWallet(),session=null,quote=null,busy=false,enabled=false,generation=0,closed=false,record=null,wrongChain=false;
 const current=()=>!closed&&root.isConnected&&getWallet()===wallet;
 function button(parent,title,fn){const b=el('button',title);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function journal(){return wallet?predictionJournal(storage,wallet.address):null;}
 function held(){return journal()?.load()?.terminal===false;}
 function paintReceipt(){receipt.replaceChildren();record=journal()?.load()||null;if(!record)return;
  receipt.append(el('strong',record.message),el('small','平台回执 · '+record.status));
  if(record.orderId)receipt.append(el('code',record.orderId));
  for(const hash of record.hashes||[]){const a=el('a','查看 Polygon 结算交易 ↗');a.href='https://polygonscan.com/tx/'+hash;a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}
  if(record.matchedShares)receipt.append(el('p','平台报告买入 '+record.matchedShares+' 份'));
 }
 function paint(){
  input.disabled=busy;actions.replaceChildren();let hold=false;try{hold=held();paintReceipt();}catch(e){status.textContent=e.message;hold=true;}
  const title=!enabled?'交易服务准备中':!wallet?'选择交易钱包':wrongChain?'切换至 Polygon':hold?'核对原交易':!session?'连接交易账户':!quote||Date.now()>=quote.expiresAt?'刷新价格':BigInt(quote.balanceAtomic)<BigInt(quote.budgetAtomic)?'pUSD 余额不足':'确认买入 · 最多 '+display(quote.budgetAtomic)+' pUSD';
  const main=button(actions,busy?'正在处理，请查看钱包或回执…':title,async()=>{
   if(!wallet){pickWallet();return;}
   if(wrongChain){await wallet.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:POLYGON}]});if(!current())return;wrongChain=false;}
   if(!session){await connect();await preview();return;}
   if(held()){record=await reconcilePurchase({session,wallet,getWallet,storage});paintReceipt();status.textContent=record.message;return;}
   if(!quote||Date.now()>=quote.expiresAt){await preview();return;}
   if(BigInt(quote.balanceAtomic)<BigInt(quote.budgetAtomic))return;
   record=await executePurchase({quote,session,wallet,getWallet,storage,locks,onStage:r=>{if(current()){record=r;status.textContent=r.message;paintReceipt();}},waitMs:15000});quote=null;paintReceipt();status.textContent=record?.message||'请核对原订单';
  });main.disabled=busy||!enabled||!!quote&&!hold&&!wrongChain&&BigInt(quote.balanceAtomic)<BigInt(quote.budgetAtomic);
  if(session&&!hold)button(actions,'刷新价格与余额',preview).disabled=busy;
  if(wallet)button(actions,'更换钱包',()=>pickWallet()).disabled=busy;
 }
 async function connect(){
  const existing=journal()?.load(),key=wallet;let cached=sessions.get(key);
  if(!cached){const factory=createSession||((await import('./vendor/privy/polymarket-purchase-sdk.js')).purchaseSession);cached=await factory(wallet,{getWallet,accountWallet:existing?.terminal===false?existing.identity.wallet:undefined});if(!current()){cached.close?.();throw Error('钱包已变化');}sessions.set(key,cached);}session=cached;
 }
 async function run(fn){if(busy||closed)return;busy=true;paint();try{await fn();}catch(error){if(error?.code==='AUTH_EXPIRED'){sessions.delete(wallet);session?.close?.();session=null;quote=null;}if(current()){status.textContent=error?.message||'本次操作未完成';paintReceipt();if(journal()?.load()?.terminal===false)status.textContent+='。原请求保留，不会重复提交。';}}finally{busy=false;if(!closed)paint();}}
 async function preview(){
  const ticket=++generation;quote=null;facts.replaceChildren();funding.replaceChildren();
  if(!session){status.textContent='连接后将核对平台交易账户余额和本次报价。原 Oasis 钱包地址保持不变。';paint();return;}
  status.textContent='正在读取卖盘、费用和 pUSD 余额…';
  const q=await session.preview({marketId:market.id,outcome,budget:input.value});
  if(!current()||ticket!==generation)return;quote={...q,maker:address(session.identity.wallet)};
  for(const [name,value]of [['网络','Polygon · 137'],['最多支付',display(q.budgetAtomic)+' pUSD'],['最低购买份额',display(q.minimumSharesAtomic)+' 份'],['最高成交单价',display(q.limitAtomic)+' pUSD / 份'],['手续费预留',display(q.feeReserveAtomic)+' pUSD（已含在支付上限内）'],['平台可用余额',display(q.balanceAtomic)+' pUSD'],['交易账户',short(session.identity.wallet)],['网络费','本流程使用平台 Relayer 代付']])facts.append(el('dt',name),el('dd',value));
  status.textContent=q.approvalNeeded?'首次需确认本次金额授权，再签名买入；金额和价格变化时会停止。':'核对网络、价格和份额后，在钱包签名确认。未能全部成交则取消，不挂单。';
  if(BigInt(q.balanceAtomic)<BigInt(q.budgetAtomic))paintFunding(q);paint();
 }
 function paintFunding(q){
  const box=el('section',null,'prediction-funding'),maker=address(session.identity.wallet),difference=BigInt(q.budgetAtomic)-BigInt(q.balanceAtomic);
  box.append(el('strong','补充交易资金'),el('p','还差 '+display(difference)+' pUSD'),el('small','仅接收 Polygon 上的 pUSD · 平台交易账户由当前钱包控制'),el('code',maker));
  const copy=button(box,'复制交易账户地址',async()=>{if(!current()||address(session.identity.wallet)!==maker)throw Error('交易账户已变化');await navigator.clipboard.writeText(maker);status.textContent='已复制 · 请核对 Polygon 与 pUSD 资产';});
  const canvas=el('canvas');canvas.hidden=true;
  button(box,'显示收款码',async()=>{if(!current())return;const {drawReceiveQr}=await import('./vendor/privy/deposit-qr.js');await drawReceiveQr(canvas,'ethereum:'+PUSD+'@137/transfer?address='+maker);if(current())canvas.hidden=false;});
  button(box,'已充值，刷新余额',preview);box.append(canvas,el('small','充值后刷新价格与余额，再由你确认购买。'));funding.replaceChildren(box);
 }
 input.oninput=()=>{generation++;quote=null;facts.replaceChildren();funding.replaceChildren();status.textContent='金额已变化，请刷新价格。';paint();};
 async function initialize(){try{const r=await fetch('/api/predictions/trading-status',{cache:'no-store',signal:AbortSignal.timeout(10000)}),p=await r.json();enabled=r.ok&&p.enabled===true;if(!enabled){status.textContent='平台交易服务正在准备，当前仍可查看盘口。';paint();return;}wallet=getWallet();if(wallet){wrongChain=await wallet.provider.request({method:'eth_chainId'})!==POLYGON;record=journal().load();}status.textContent=record?.terminal===false?'发现原交易，请连接同一钱包后核对。':'点击连接交易账户，核对余额与价格后即可站内买入。';paint();}catch(error){status.textContent=error.message||'交易服务暂不可用';paint();}}
 queueMicrotask(initialize);const timer=setInterval(()=>{if(!busy&&quote&&Date.now()>=quote.expiresAt)paint();},1000);
 root.dispose=()=>{closed=true;generation++;clearInterval(timer);};return root;
}
