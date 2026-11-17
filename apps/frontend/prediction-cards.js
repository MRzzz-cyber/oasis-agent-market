import {bindMarketTitle} from './market-language.js';
import {kalshiPurchase} from './kalshi-purchase.js';
import {getLanguage,getLocale,translateUI} from './i18n.js';
import {polymarketPurchase} from './polymarket-purchase.js';
import {predictionIntent} from './prediction-core.js';
import {shuffledMarkets,marketTopic} from './prediction-discovery.js';
export {predictionIntent};
const el=(tag,value,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(value==null?{}:{textContent:String(value)})});
const venue=id=>id==='polymarket'?'Polymarket':'Kalshi';
const cents=v=>v==null?'—':(Number(v)*100).toFixed(1)+'¢';
const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString(getLocale(),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'待核实';
const compact=v=>{const n=Number(v);return Number.isFinite(n)?Intl.NumberFormat(getLocale(),{notation:'compact',maximumFractionDigits:1}).format(n):'—';};
const button=(label,cls='')=>{const b=el('button',label,cls);b.type='button';return b;};
function sourceLink(m,label='查看平台规则 ↗'){const a=el('a',label);try{const u=new URL(m.url);if(u.protocol==='https:'&&['polymarket.com','kalshi.com'].includes(u.hostname)){a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}}catch{}return a;}
export function predictionCards({getWallet=()=>null,pickWallet=()=>{}}={}){
 const root=el('section',null,'prediction-cards'),css=el('link');css.rel='stylesheet';css.href='/prediction-cards.css?v=discovery-v1';
 const header=el('header',null,'prediction-header'),heading=el('div');heading.append(el('span','OASIS / PREDICTIONS','prediction-eyebrow'),el('h3','下一件大事，你怎么看？'),el('p','发现正在发生的事件，比较平台，再做选择。','prediction-muted'));
 const live=el('span','每 60 秒刷新','prediction-live');header.append(heading,live);root.append(css,header);
 const discovery=el('div'),form=el('form',null,'prediction-search'),query=el('input');query.type='search';query.maxLength=120;query.placeholder='找一个事件，例如 Bitcoin、NBA、Fed…';query.setAttribute('aria-label','搜索预测事件');
 const submit=el('button','搜索');submit.type='submit';submit.disabled=true;form.append(query,submit);discovery.append(form);
 const toolbar=el('div',null,'prediction-toolbar'),presets=el('div',null,'prediction-presets'),shuffle=button('换一批 ↻','prediction-shuffle');
 let activeTopic='热门';
 for(const [label,term] of [['热门',''],['加密','Bitcoin'],['体育','NBA'],['科技','AI'],['宏观','Fed']]){
  const b=button(label);b.setAttribute('aria-pressed',String(label===activeTopic));b.onclick=()=>{activeTopic=label;presets.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));query.value=term;term?runSearch():loadFeed();};presets.append(b);
 }
 toolbar.append(presets,shuffle);discovery.append(toolbar);
 const status=el('p','正在发现真实盘口…','prediction-muted prediction-feed-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const results=el('div',null,'prediction-results'),selected=el('div',null,'prediction-selected');discovery.append(status,results);root.append(discovery,selected);
 let disposed=false,feedGeneration=0,selectionGeneration=0,quoteGeneration=0,feedController=null,compareController=null,quoteController=null,pool=[],visible=[],source=null,comparison=null,purchase=null,loading=false,feedMode=true,feedStamp=null,expiryTimer=null;
 const selectedMarkets=new Map(),selectedOutcomes=new Map();
 async function request(path,signal){const r=await fetch(path,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});let data;try{data=await r.json();}catch{throw Error('服务暂时不可用，请稍后重试');}if(!r.ok&&!Array.isArray(data.providers))throw Error(data.error||'平台数据暂不可用');return data;}
 function clearExpiry(){clearTimeout(expiryTimer);expiryTimer=null;}
 function disposePurchase(){purchase?.dispose?.();purchase=null;selected.querySelector('.prediction-purchase-host')?.replaceChildren();}
 function closeComparison(){clearExpiry();selectionGeneration++;quoteGeneration++;compareController?.abort();quoteController?.abort();disposePurchase();source=null;comparison=null;selectedMarkets.clear();selectedOutcomes.clear();selected.replaceChildren();header.hidden=false;discovery.hidden=false;live.textContent='每 60 秒刷新';}
 function marketCard(m){
  const card=el('article',null,'prediction-market'),top=el('div',null,'prediction-market-top');top.append(el('span',m.topic||marketTopic(m.question),'prediction-topic'),el('small',venue(m.provider),'prediction-muted'));
  const title=button(m.question,'prediction-market-title');bindMarketTitle(title,m);title.onclick=()=>openComparison(m,'yes');
  const yes=m.outcomes.find(o=>o.key==='yes'),prob=Number(yes?.price),metric=el('div',null,'prediction-probability');
  metric.append(el('strong',yes?.price==null?'—':(prob*100).toFixed(0)+'%'),el('span','YES · 市场隐含概率'));
  const bar=el('div',null,'prediction-probability-bar'),fill=el('span');fill.style.width=(Number.isFinite(prob)?Math.max(0,Math.min(100,prob*100)):0)+'%';bar.append(fill);
  const outcomes=el('div',null,'prediction-outcomes');for(const o of m.outcomes){const b=button(o.label+' '+cents(o.price));b.onclick=()=>openComparison(m,o.key);outcomes.append(b);}
  const foot=el('div',null,'prediction-market-foot');foot.append(el('small','24h '+compact(m.volume)+' · 截止 '+time(m.endDate)),el('span','比较平台 →'));
  card.append(top,title,metric,bar,outcomes,foot);return card;
 }
 function renderMarkets(rows){visible=rows;results.replaceChildren();for(const m of rows)results.append(marketCard(m));if(!rows.length)results.append(el('div','本次检索范围内没有匹配盘口，试试其他关键词。','prediction-empty'));}
 function rotate(){if(!pool.length)return;const previous=new Set(visible.map(m=>m.provider+':'+m.id));const shuffled=shuffledMarkets(pool);renderMarkets([...shuffled.filter(m=>!previous.has(m.provider+':'+m.id)),...shuffled.filter(m=>previous.has(m.provider+':'+m.id))].slice(0,6));}
 async function loadFeed({background=false}={}){
  if(disposed||loading&&background)return;feedController?.abort();feedController=new AbortController();const ticket=++feedGeneration;loading=true;feedMode=true;
  submit.disabled=true;shuffle.disabled=true;if(!background)status.textContent='正在读取 Polymarket 热门事件…';
  try{const payload=await request('/api/predictions/discover',feedController.signal);if(ticket!==feedGeneration||disposed)return;pool=payload.markets||[];feedStamp=payload.at;rotate();if(!pool.length)renderMarkets([]);status.textContent='Polymarket 热门事件 · '+time(payload.at)+' 更新 · 点击盘口自动比较平台';}
  catch(error){if(ticket===feedGeneration&&!disposed&&error.name!=='AbortError'){status.textContent=(background&&pool.length?'刷新失败，保留上次数据（'+time(feedStamp)+'） · ':'')+(error.message||'暂时无法读取，请重试');if(!pool.length)results.replaceChildren(el('p','平台连接失败，不代表没有相关盘口。','prediction-empty'));}}
  finally{if(ticket===feedGeneration){loading=false;submit.disabled=false;shuffle.disabled=false;}}
 }
 async function runSearch(){
  const term=query.value.trim();if(!term)return loadFeed();feedController?.abort();feedController=new AbortController();const ticket=++feedGeneration;feedMode=false;loading=true;submit.disabled=true;shuffle.disabled=true;status.textContent='正在搜索两平台的真实盘口…';results.replaceChildren();
  try{const payload=await request('/api/predictions/search?'+new URLSearchParams({q:term}),feedController.signal);if(ticket!==feedGeneration||disposed)return;pool=payload.providers.flatMap(p=>p.markets);rotate();if(!pool.length)renderMarkets([]);const failed=payload.providers.filter(p=>p.error);status.textContent=failed.length===payload.providers.length?'平台连接失败，不代表没有相关盘口。':pool.length?'已读取 '+pool.length+' 个相关盘口'+(failed.length?' · 部分平台暂不可用':'')+' · 点击自动比价':'本次检索范围内没有匹配盘口，请换一个关键词。';for(const p of failed)results.append(el('p',venue(p.provider)+'：'+p.error,'prediction-availability'));}
  catch(error){if(ticket===feedGeneration&&!disposed&&error.name!=='AbortError')status.textContent=error.message||'搜索失败，请重试';}
  finally{if(ticket===feedGeneration){loading=false;submit.disabled=false;shuffle.disabled=false;}}
 }
 form.onsubmit=e=>{e.preventDefault();activeTopic='搜索';presets.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));runSearch();};
 shuffle.onclick=()=>pool.length?rotate():(feedMode?loadFeed():runSearch());
 function rules(m){const d=el('details',null,'prediction-rules');d.append(el('summary','事件定义与结算规则'),el('small','盘口英文原文'),el('p',m.question),el('p',m.description||'规则尚未获取，请在平台核对。'),el('p','结算来源：'+(m.resolutionSource||'待核实')),sourceLink(m));return d;}
 async function openComparison(m,outcome){
  clearExpiry();feedGeneration++;feedController?.abort();loading=false;submit.disabled=false;shuffle.disabled=false;quoteGeneration++;quoteController?.abort();compareController?.abort();disposePurchase();
  source=m;comparison=null;selectedMarkets.clear();selectedOutcomes.clear();const ticket=++selectionGeneration;compareController=new AbortController();header.hidden=true;discovery.hidden=true;live.textContent='跨平台报价';selected.replaceChildren();
  const back=button('← 返回发现','prediction-back');back.onclick=closeComparison;const title=bindMarketTitle(el('h3',m.question),m);selected.append(back,el('span','COMPARE / 选择平台','prediction-eyebrow'),title,el('p','正在查找 Polymarket / Kalshi 的相关盘口…','prediction-compare-status'));
  try{const payload=await request('/api/predictions/compare?'+new URLSearchParams({provider:m.provider,id:m.id,outcome,shares:'10'}),compareController.signal);if(ticket!==selectionGeneration||disposed)return;comparison=payload;for(const p of payload.providers)if(p.markets.length){selectedMarkets.set(p.provider,p.markets[0]);selectedOutcomes.set(p.provider,outcome);}renderComparison();loadQuotes();}
  catch(error){if(ticket===selectionGeneration&&!disposed&&error.name!=='AbortError'){selected.querySelector('.prediction-compare-status').textContent=error.message||'比价暂不可用';const retry=button('重新比价');retry.onclick=()=>openComparison(m,outcome);selected.append(retry);}}
 }
 let sharesInput=null,quoteButton=null,quoteStatus=null;
 function invalidatePurchase(){clearExpiry();disposePurchase();quoteGeneration++;quoteController?.abort();selected.querySelectorAll('.prediction-quote').forEach(n=>n.replaceChildren(el('p','选择已变化，正在重新读取报价…','prediction-muted')));}
 function renderComparison(){
  selected.replaceChildren();const back=button('← 返回发现','prediction-back');back.onclick=closeComparison;selected.append(back,el('span','COMPARE / 选择平台','prediction-eyebrow'),bindMarketTitle(el('h3',comparison.source.question),comparison.source));
  const notice=el('p','自动查找相关盘口。请核对事件、YES/NO 定义、截止时间与结算规则；相似标题不代表同一合约。','prediction-match-note');selected.append(notice);
  const amount=el('div',null,'prediction-amount'),label=el('label','比较份额');sharesInput=el('input');sharesInput.type='number';sharesInput.min='1';sharesInput.max='100000';sharesInput.step='1';sharesInput.value='10';sharesInput.id='compare-shares-'+crypto.randomUUID();label.htmlFor=sharesInput.id;quoteButton=button('刷新报价');quoteButton.onclick=loadQuotes;amount.append(label,sharesInput,quoteButton);quoteStatus=el('p','正在读取相同份额的卖盘成本…','prediction-muted');quoteStatus.setAttribute('role','status');selected.append(amount,quoteStatus);
  sharesInput.oninput=()=>{invalidatePurchase();quoteButton.disabled=false;quoteStatus.textContent='份额已变化，请重新读取报价。';selected.querySelectorAll('.prediction-quote').forEach(n=>n.replaceChildren());};
  const venues=el('div',null,'prediction-venues');for(const id of ['polymarket','kalshi']){
   const p=comparison.providers.find(x=>x.provider===id)||{provider:id,markets:[],coverage:'暂无数据'},block=el('section',null,'prediction-venue');block.dataset.provider=id;
   const head=el('div',null,'prediction-venue-head');head.append(el('h4',venue(id)),el('span',id==='polymarket'?'站内买入':'API 站内买入','prediction-venue-tag'));block.append(head);
   if(!p.markets.length){block.append(el('p',p.error||'本次范围内未找到相关盘口','prediction-empty'),el('small',p.coverage,'prediction-muted'));venues.append(block);continue;}
   const chooser=el('select');chooser.setAttribute('aria-label',venue(id)+' 盘口');for(const m of p.markets){const option=el('option',m.question);option.value=m.id;chooser.append(option);}chooser.value=selectedMarkets.get(id).id;chooser.hidden=p.markets.length===1;
   const marketBody=el('div',null,'prediction-venue-market'),quote=el('div',null,'prediction-quote');block.append(chooser,marketBody,quote);
   function paintMarket(){const m=selectedMarkets.get(id);marketBody.replaceChildren(bindMarketTitle(el('h4',m.question),m),el('span',m.match?.label||'相关盘口 · 未核验等价','prediction-match-badge'),el('p','截止 '+time(m.endDate)+' · '+m.network,'prediction-muted'));
    if(m.match?.differences?.length)marketBody.append(el('p',m.match.differences.join('；'),'prediction-differences'));
    const outcomes=el('div',null,'prediction-venue-outcomes');for(const o of m.outcomes){const b=button(o.label);b.setAttribute('aria-pressed',String(selectedOutcomes.get(id)===o.key));b.onclick=()=>{selectedOutcomes.set(id,o.key);invalidatePurchase();paintMarket();loadQuotes();};outcomes.append(b);}marketBody.append(outcomes,rules(m));
   }
   chooser.onchange=()=>{selectedMarkets.set(id,p.markets.find(m=>m.id===chooser.value));invalidatePurchase();paintMarket();loadQuotes();};paintMarket();venues.append(block);
  }
  selected.append(venues,el('p','展示的是卖盘小计；手续费、网络费及跨链费未计入，不标记“总成本最低”。选择平台后再核对实际交易金额。','prediction-muted'),el('div',null,'prediction-purchase-host'));
 }
 async function loadQuotes(){
  if(!comparison||disposed)return;const shares=sharesInput.value;if(!/^\d+$/.test(shares)||Number(shares)<1||Number(shares)>100000){quoteStatus.textContent='请输入 1–100000 的整数份额。';invalidatePurchase();return;}
  clearExpiry();disposePurchase();quoteController?.abort();quoteController=new AbortController();const signal=quoteController.signal,ticket=++quoteGeneration,selectionTicket=selectionGeneration;
  quoteButton.disabled=true;quoteStatus.textContent='正在读取各平台卖盘…';
  const chosen=[...selectedMarkets.entries()].map(([id,m])=>({id,m,outcome:selectedOutcomes.get(id)}));selected.querySelectorAll('.prediction-quote').forEach(n=>n.replaceChildren(el('p','读取中…','prediction-muted')));
  const settled=await Promise.allSettled(chosen.map(async item=>{const q=await request('/api/predictions/quote?'+new URLSearchParams({provider:item.id,id:item.m.id,outcome:item.outcome,shares}),signal);if(q.market?.id!==item.m.id||q.market?.provider!==item.id||q.outcome!==item.outcome||String(q.requested)!==shares)throw Error('报价与当前选择不匹配，请刷新');return q;}));
  if(disposed||ticket!==quoteGeneration||selectionTicket!==selectionGeneration)return;
  for(let i=0;i<chosen.length;i++){
   const {id,m,outcome}=chosen[i],box=selected.querySelector('[data-provider="'+id+'"] .prediction-quote'),r=settled[i];if(!box)continue;box.replaceChildren();
   if(r.status==='rejected'){box.append(el('p',r.reason?.message||'报价读取失败'));continue;}
   const q=r.value,validDepth=q.depthEnough&&q.minimumMet,expires=Number(q.expiresAt),fresh=!q.sourceStale&&Number.isFinite(expires)&&expires>Date.now(),value=el('div',null,'prediction-cost');
   value.append(el('strong',q.subtotal+' '+(id==='polymarket'?'pUSD':'USD')),el('span',q.requested+' 份卖盘小计'));box.append(value,el('p','均价 '+cents(q.averagePrice)+' / 份 · 深度 '+q.filled+' 份','prediction-muted'));
   box.append(el('small',q.sourceStale?'盘口源时间待核实，仅供参考':'读取于 '+time(new Date(q.receivedAt).toISOString())+' · 报价有效 30 秒','prediction-muted'));
   if(!validDepth)box.append(el('p',q.reason||'深度不足或低于最小订单','prediction-availability'));
   if(id==='polymarket'){
    const choose=button(validDepth?'选择 Polymarket →':'当前份额不可买入','prediction-choose-venue');choose.disabled=!validDepth||!fresh;
    choose.onclick=()=>{if(disposed||ticket!==quoteGeneration)return;if(Date.now()>=expires){choose.disabled=true;quoteStatus.textContent='报价已过期，请刷新后选择平台。';return;}
     disposePurchase();purchase=polymarketPurchase({market:m,outcome,getWallet,pickWallet});selected.querySelector('.prediction-purchase-host').append(purchase);quoteStatus.textContent='已选择 Polymarket，请在下方核对金额与最新可执行价格。';};
    box.append(choose);
   }else{const choose=button('选择 Kalshi →','prediction-choose-venue prediction-choose-kalshi');choose.disabled=!validDepth;choose.onclick=()=>{if(disposed||ticket!==quoteGeneration)return;if(Date.now()>=expires){choose.disabled=true;quoteStatus.textContent='报价已过期，请刷新后选择平台。';return;}disposePurchase();purchase=kalshiPurchase({market:m,outcome,getWallet,pickWallet,initialCount:shares});selected.querySelector('.prediction-purchase-host').append(purchase);quoteStatus.textContent='已选择 Kalshi，请连接自己的 API 账户并核对 USD 余额。';};box.append(choose,sourceLink(m,'在 Kalshi 查看 ↗'));}
  }
  quoteButton.disabled=false;quoteStatus.textContent='报价已更新 · 各平台按同一份额、各自结果定义展示';
  const deadlines=settled.filter(r=>r.status==='fulfilled').map(r=>Number(r.value.expiresAt)).filter(Number.isFinite);if(deadlines.length)expiryTimer=setTimeout(()=>{if(disposed||ticket!==quoteGeneration)return;selected.querySelectorAll('.prediction-choose-venue').forEach(b=>b.disabled=true);if(!purchase)quoteStatus.textContent='报价已过期，请刷新后选择平台。';},Math.max(0,Math.min(...deadlines)-Date.now()));
 }
 const changed=()=>{if(source){disposePurchase();quoteGeneration++;quoteController?.abort();if(quoteButton)quoteButton.disabled=false;if(quoteStatus)quoteStatus.textContent='钱包已变化，请刷新报价后继续。';selected.querySelectorAll('.prediction-choose-venue').forEach(b=>b.disabled=true);}};
 window.addEventListener('oasis:funds-updated',changed);
 const timer=setInterval(()=>{if(!disposed&&!source&&feedMode&&!document.hidden&&root.isConnected&&root.getClientRects().length)loadFeed({background:true});},60000);
 root.dispose=()=>{clearExpiry();disposed=true;feedGeneration++;selectionGeneration++;quoteGeneration++;feedController?.abort();compareController?.abort();quoteController?.abort();disposePurchase();clearInterval(timer);window.removeEventListener('oasis:funds-updated',changed);};
 queueMicrotask(()=>{if(!disposed)loadFeed();});return root;
}
