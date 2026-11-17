import {createKalshiSession,executeKalshi,reconcileKalshi} from './kalshi-client.js';
import {display,kalshiJournal} from './kalshi-core.js';
const el=(tag,text,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(text==null?{}:{textContent:String(text)})});
export function kalshiPurchase({market,outcome,getWallet,pickWallet,initialCount='10',createSession=createKalshiSession,storage=localStorage,locks=navigator.locks}){
 const root=el('section',null,'prediction-purchase kalshi-purchase'),css=el('link');css.rel='stylesheet';css.href='/kalshi-purchase.css?v=1';root.append(css,el('span','KALSHI / API','prediction-eyebrow'),el('h3','连接 Kalshi，站内核对并买入'),el('p',market.question));
 const help=el('details'),summary=el('summary','没有 API 密钥？查看申请和配置位置');help.append(summary,el('p','Kalshi → Account & security → API Keys → Create Key。保存 Key ID 和私钥文件，支持 Ed25519 与 RSA。'),el('p','选择 read 和 write::trade 权限即可，本入口不提供提款或转账。'));
 const link=el('a','打开 Kalshi API Key 设置 ↗');link.href='https://kalshi.com/account/profile';link.target='_blank';link.rel='noopener noreferrer';help.append(link);root.append(help);
 const form=el('form',null,'kalshi-connect'),mode=el('select'),id=el('input'),file=el('input');for(const [value,label]of [['production','正式环境 · 真实 USD'],['demo','模拟环境 · 测试 USD']]){const o=el('option',label);o.value=value;mode.append(o);}mode.setAttribute('aria-label','Kalshi 环境');
 id.type='text';id.autocomplete='off';id.maxLength=36;id.placeholder='API Key ID';id.setAttribute('aria-label','Kalshi API Key ID');
 file.type='file';file.accept='.pem,.key,.txt';file.setAttribute('aria-label','Kalshi 私钥文件');const connect=el('button','连接我的 Kalshi 账户');connect.type='submit';
 form.append(el('label','Kalshi 环境'),mode,el('label','API Key ID'),id,el('label','Kalshi 私钥文件 · 仅当前页面使用'),file,connect,el('small','私钥仅在页面内存中签名，不上传 Oasis、不写入浏览器存储。关闭或刷新页面后需重新连接。'));root.append(form);
 const status=el('p','尚未连接 Kalshi。现有 Oasis 钱包与 Kalshi USD 余额独立。','purchase-status');status.setAttribute('role','status');
 const account=el('div'),orders=el('div'),facts=el('dl'),controls=el('div'),quantity=el('input');quantity.type='number';quantity.min='1';quantity.max='1000';quantity.step='1';quantity.value=String(initialCount);quantity.setAttribute('aria-label','买入合约数');const countLabel=el('label','买入合约数');countLabel.append(quantity);
 controls.append(countLabel);const actions=el('div',null,'kalshi-actions');root.append(account,controls,facts,actions,status,orders);
 let session=null,quote=null,busy=false,closed=false,token=0,record=null;const button=(parent,text,fn)=>{const b=el('button',text);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;};
 const held=()=>session&&kalshiJournal(storage,session.accountHash).load()?.terminal===false;
 function receipt(){orders.replaceChildren();if(!session)return;try{record=kalshiJournal(storage,session.accountHash).load();if(record){orders.append(el('strong',record.message),el('p','状态：'+record.status),el('code',record.clientId));if(record.orderId)orders.append(el('code',record.orderId));if(record.filled)orders.append(el('p','平台报告成交 '+record.filled+' 份 · 支付 '+record.spent+' USD'));}}catch(e){status.textContent=e.message;}}
 function paint(){quantity.disabled=busy;connect.disabled=busy;id.disabled=busy;file.disabled=busy;mode.disabled=busy;actions.replaceChildren();if(!session)return;
  if(held()){button(actions,'核对原 Kalshi 订单',async()=>{record=await reconcileKalshi({session,storage});receipt();status.textContent=record.message;});return;}
  if(!getWallet())button(actions,'选择现有 Oasis 钱包',pickWallet);
  button(actions,'刷新 Kalshi 报价与余额',preview).disabled=busy;
  const buy=button(actions,'确认 Kalshi 买入',async()=>{if(!quote||Date.now()>=quote.expiresAt)throw Error('Kalshi 报价已过期，请刷新');const wallet=getWallet();record=await executeKalshi({quote,session,wallet,getWallet,storage,locks,onStage:r=>{if(!closed){record=r;status.textContent=r.message;}}});quote=null;receipt();status.textContent=record.message;});
  buy.disabled=busy||!quote||Date.now()>=quote.expiresAt||!getWallet();
 }
 async function run(fn){if(busy||closed)return;busy=true;paint();try{await fn();}catch(e){if(!closed)status.textContent=e.message||'Kalshi 操作未完成';}finally{busy=false;if(!closed)paint();}}
 function showBalance(p){if(!Number.isSafeInteger(p.balance)||p.balance<0)throw Error('Kalshi 余额未核实');account.replaceChildren(el('strong',(session.environment==='demo'?'模拟余额 ':'正式 USD 余额 ')+display(BigInt(p.balance)*10000n)+' USD'),el('small','Kalshi 账户资金；不能使用 Arbitrum USDC 或 Polygon pUSD 代替。'));
  button(account,'查看持仓',async()=>{const p=await session.positions();orders.replaceChildren(el('h4','Kalshi 持仓'));for(const r of p.market_positions||[])orders.append(el('p',r.ticker+' · '+String(r.position_fp??r.position??'—')));if(!p.market_positions?.length)orders.append(el('p','当前没有持仓'));});
  button(account,'查看近期订单',async()=>{const p=await session.orders({ticker:market.id});orders.replaceChildren(el('h4','Kalshi 订单'));for(const r of p.orders||[])orders.append(el('p',r.ticker+' · '+r.status+' · '+r.order_id));if(!p.orders?.length)orders.append(el('p','当前没有订单'));});
  button(account,'断开 Kalshi',disconnect);
 }
 async function preview(){
  quote=null;facts.replaceChildren();if(!session)return;const ticket=++token;status.textContent='正在核对 Kalshi 卖盘、费率和交易分区余额…';
  const r=await fetch('/api/kalshi/preview?'+new URLSearchParams({ticker:market.id,outcome,count:quantity.value,environment:session.environment}),{cache:'no-store',signal:AbortSignal.timeout(25000)});const q=await r.json();if(!r.ok)throw Error(q.error||'Kalshi 报价不可用');const balance=await session.balance(q.exchangeIndex);if(closed||ticket!==token)return;showBalance(balance);
  for(const [label,value] of [['环境',q.environment==='demo'?'模拟环境 · 测试 USD':'正式环境 · 真实 USD'],['结果',outcome.toUpperCase()],['买入合约数',q.count],['最高单价',display(q.limitAtomic)+' USD'],['手续费保守预留',display(q.feeReserveAtomic)+' USD'],['最高支付（含预留）',display(q.maxSpendAtomic)+' USD'],['订单类型','FOK · 全部成交或取消']])facts.append(el('dt',label),el('dd',value));
  if(BigInt(balance.balance)*10000n<BigInt(q.maxSpendAtomic)){status.textContent='Kalshi 余额不足，请在 Kalshi 官方充值后刷新。';const a=el('a','前往 Kalshi 充值 ↗');a.href='https://kalshi.com/account';a.target='_blank';a.rel='noopener noreferrer';facts.append(a);return;}
  quote=q;status.textContent=outcome==='no'?'NO 买入通过 YES 卖价的互补价格下单，可能与已有相反持仓抵消。核对后点击确认。':'核对盘口、合约数与最高支付后，点击确认才会签名提交。本入口不请求链上交易。';receipt();
 }
 function disconnect(){token++;session?.close();session=null;quote=null;account.replaceChildren();facts.replaceChildren();orders.replaceChildren();form.hidden=false;status.textContent='Kalshi 已断开，原订单记录仍保留。';paint();}
 form.onsubmit=e=>{e.preventDefault();run(async()=>{const selected=file.files?.[0];if(!selected||selected.size>16384)throw Error('请选择有效的 Kalshi 私钥文件');const pem=await selected.text();file.value='';const candidate=await createSession({keyId:id.value.trim(),pem,mode:mode.value});try{const p=await candidate.balance();if(closed){candidate.close();return;}session?.close();session=candidate;id.value='';form.hidden=true;showBalance(p);receipt();if(held()){status.textContent='发现原 Kalshi 请求，请先核对，不会重复提交。';return;}await preview();}catch(e){if(session!==candidate)candidate.close();throw e;}});};
 quantity.oninput=()=>{token++;quote=null;facts.replaceChildren();status.textContent='合约数已变化，请重新核对报价。';paint();};
 const changed=()=>{quote=null;token++;status.textContent='钱包已变化，请重新核对报价。';paint();};window.addEventListener('oasis:funds-updated',changed);
 const logout=()=>disconnect();window.addEventListener('oasis:account-wallet-cleared',logout);
 const timer=setInterval(()=>{if(!closed&&!busy&&quote&&Date.now()>=quote.expiresAt){quote=null;status.textContent='Kalshi 报价已过期，请刷新';paint();}},1000);
 root.dispose=()=>{closed=true;token++;session?.close();session=null;clearInterval(timer);window.removeEventListener('oasis:funds-updated',changed);window.removeEventListener('oasis:account-wallet-cleared',logout);};paint();return root;
}
