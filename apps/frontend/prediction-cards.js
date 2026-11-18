import {bindMarketTitle} from './market-language.js';
import {getLocale} from './i18n.js';
import {readPredictionJSON,SNAPSHOT_MAX_AGE} from './prediction-read.js';
import {polymarketPurchase} from './polymarket-purchase.js';
import {predictionIntent} from './prediction-core.js';
import {shuffledMarkets,marketTopic} from './prediction-discovery.js';
export {predictionIntent};
const el=(tag,value,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(value==null?{}:{textContent:String(value)})});
const cents=v=>v==null?'—':(Number(v)*100).toFixed(1)+'¢';
const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString(getLocale(),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'待核实';
const compact=v=>Number.isFinite(Number(v))?Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(Number(v)):'—';
const button=(label,cls='')=>{const b=el('button',label,cls);b.type='button';return b;};
export function predictionCards({getWallet=()=>null,pickWallet=()=>{},onDiscuss,onSelect,initialQuery='',initialMarket=null,initialOutcome='yes'}={}){
 const root=el('section',null,'prediction-cards'),css=el('link');css.rel='stylesheet';css.href='/prediction-cards.css?v=polymarket-focus-v1';
 const header=el('header',null,'prediction-header'),heading=el('div');heading.append(el('span','POLYMARKET / LIVE','prediction-eyebrow'),el('h3','下一件大事，你怎么看？'),el('p','找一个感兴趣的事件，选结果，确认买入。','prediction-muted'));
 const live=el('span','每 60 秒刷新','prediction-live');header.append(heading,live);root.append(css,header);
 const discovery=el('div'),form=el('form',null,'prediction-search'),query=el('input');query.type='search';query.maxLength=120;query.placeholder='搜索事件，例如 Bitcoin、NBA、Fed…';query.setAttribute('aria-label','搜索预测事件');
 const submit=el('button','搜索');submit.type='submit';submit.disabled=true;form.append(query,submit);discovery.append(form);
 const toolbar=el('div',null,'prediction-toolbar'),presets=el('div',null,'prediction-presets'),shuffle=button('换一批 ↻','prediction-shuffle');
 for(const [label,term] of [['热门',''],['加密','Bitcoin'],['体育','NBA'],['科技','AI'],['宏观','Fed']]){
  const b=button(label);b.setAttribute('aria-pressed',String(!term));b.onclick=()=>{presets.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));query.value=term;term?runSearch():loadFeed();};presets.append(b);
 }
 toolbar.append(presets,shuffle);discovery.append(toolbar);
 const status=el('p','正在发现真实盘口…','prediction-muted prediction-feed-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const retry=button('重试连接','prediction-retry');retry.hidden=true;retry.onclick=()=>feedMode?loadFeed():runSearch();
 const results=el('div',null,'prediction-results'),selected=el('div',null,'prediction-selected');discovery.append(status,retry,results);root.append(discovery,selected);
 let disposed=false,generation=0,controller=null,pool=[],visible=[],source=null,purchase=null,loading=false,feedMode=true,feedStamp=null;
 const snapshots=new Map();
 const request=(path,signal)=>readPredictionJSON(path,{signal});
 function stamp(payload){const at=payload.at||new Date().toISOString(),age=Date.now()-Date.parse(at);if(payload.stale&&(!Number.isFinite(age)||age < -5000||age>SNAPSHOT_MAX_AGE))throw Error('盘口快照已过期，请重试连接');return at;}
 function remember(key,markets,at){
  const stamp=Date.parse(at);if(!Number.isFinite(stamp)||stamp>Date.now()+5000||Date.now()-stamp>SNAPSHOT_MAX_AGE)return;
  snapshots.delete(key);snapshots.set(key,{markets,at});while(snapshots.size>12)snapshots.delete(snapshots.keys().next().value);
 }
 function retain(key){
  const snapshot=snapshots.get(key),stamp=Date.parse(snapshot?.at);
  if(snapshot&&Number.isFinite(stamp)&&Date.now()-stamp>=-5000&&Date.now()-stamp<=SNAPSHOT_MAX_AGE){pool=snapshot.markets;feedStamp=snapshot.at;rotate();if(!pool.length)renderMarkets([]);return true;}
  snapshots.delete(key);pool=[];visible=[];results.replaceChildren();return false;
 }
 function freshness(stale){root.dataset.state=stale?'stale':pool.length?'ready':'empty';live.textContent=stale?'快照 · 买入前刷新价格':'每 60 秒刷新';}
 function unavailable(key,error){
  if(retain(key)&&pool.length){freshness(true);status.textContent='更新失败，保留上次数据（'+time(feedStamp)+'） · 买入前重新核对实时价格';}
  else{root.dataset.state='error';live.textContent='连接待恢复';status.textContent=error.message||'盘口服务暂不可用，请重试连接';results.replaceChildren(el('p','平台连接失败，不代表没有相关盘口。','prediction-empty'));}
  retry.hidden=false;
 }

 function disposePurchase(){purchase?.dispose?.();purchase=null;}
 function back(){if(purchase?.canLeave?.()===false)return;disposePurchase();source=null;selected.replaceChildren();header.hidden=false;discovery.hidden=false;}
 function marketCard(m){
  const card=el('article',null,'prediction-market'),top=el('div',null,'prediction-market-top');top.append(el('span',m.topic||marketTopic(m.question),'prediction-topic'),el('small','Polymarket','prediction-muted'));
  const title=button(m.question,'prediction-market-title');bindMarketTitle(title,m);title.onclick=()=>openMarket(m,'yes');
  const yes=m.outcomes.find(o=>o.key==='yes'),prob=Number(yes?.price),metric=el('div',null,'prediction-probability');
  metric.append(el('strong',yes?.price==null?'—':(prob*100).toFixed(0)+'%'),el('span','YES · 市场隐含概率'));
  const bar=el('div',null,'prediction-probability-bar'),fill=el('span');fill.style.width=(Number.isFinite(prob)?Math.max(0,Math.min(100,prob*100)):0)+'%';bar.append(fill);
  const outcomes=el('div',null,'prediction-outcomes');for(const o of m.outcomes){const b=button(o.label+' '+cents(o.price));b.onclick=()=>openMarket(m,o.key);outcomes.append(b);}
  const foot=el('div',null,'prediction-market-foot');foot.append(el('small','24h '+compact(m.volume)+' · 截止 '+time(m.endDate)),el('span','查看并买入 →'));
  card.append(top,title,metric,bar,outcomes,foot);return card;
 }
 function renderMarkets(rows){visible=rows;results.replaceChildren();for(const m of rows)results.append(marketCard(m));if(!rows.length)results.append(el('div','本次检索范围内没有匹配盘口，试试其他关键词。','prediction-empty'));}
 function rotate(){if(!pool.length)return;const previous=new Set(visible.map(m=>m.id)),shuffled=shuffledMarkets(pool);renderMarkets([...shuffled.filter(m=>!previous.has(m.id)),...shuffled.filter(m=>previous.has(m.id))].slice(0,6));}
 async function loadFeed({background=false}={}){
  if(disposed||loading&&background)return;controller?.abort();controller=new AbortController();const ticket=++generation,key='feed';loading=true;feedMode=true;submit.disabled=shuffle.disabled=retry.disabled=true;retry.hidden=true;root.dataset.state='loading';retain(key);if(!background)status.textContent='正在读取 Polymarket 热门事件…';
  try{
   const payload=await request('/api/predictions/discover',controller.signal);if(ticket!==generation||disposed)return;if(!Array.isArray(payload.markets))throw Error('平台返回的数据格式异常，请稍后重试');
   pool=payload.markets.filter(m=>m.provider==='polymarket');feedStamp=stamp(payload);remember(key,pool,feedStamp);rotate();if(!pool.length)renderMarkets([]);freshness(payload.stale===true);
   status.textContent=payload.stale?'平台暂时不可用，展示上次快照（'+time(feedStamp)+'） · 买入前重新核对实时价格':'Polymarket · '+time(feedStamp)+' 更新 · 行情仅供参考，买入前核对实时价格';retry.hidden=payload.stale!==true;
  }catch(error){if(ticket===generation&&!disposed&&error.name!=='AbortError')unavailable(key,error);}
  finally{if(ticket===generation){loading=false;submit.disabled=retry.disabled=false;shuffle.disabled=!pool.length;}}
 }
 async function runSearch(){
  const term=query.value.trim();if(!term)return loadFeed();if(disposed)return;controller?.abort();controller=new AbortController();const ticket=++generation,key='search:'+term.toLowerCase();feedMode=false;loading=true;submit.disabled=shuffle.disabled=retry.disabled=true;retry.hidden=true;root.dataset.state='loading';status.textContent='正在搜索 Polymarket 盘口…';retain(key);
  try{
   const payload=await request('/api/predictions/search?'+new URLSearchParams({q:term}),controller.signal);if(ticket!==generation||disposed)return;const provider=payload.providers?.find(p=>p.provider==='polymarket');if(!provider||provider.error||!Array.isArray(provider.markets))throw Error(provider?.error||'平台数据暂不可用');
   pool=provider.markets.filter(m=>m.provider==='polymarket');feedStamp=stamp(payload);remember(key,pool,feedStamp);rotate();if(!pool.length)renderMarkets([]);freshness(payload.stale===true);
   status.textContent=payload.stale?'平台暂时不可用，展示上次快照（'+time(feedStamp)+'） · 买入前重新核对实时价格':pool.length?'找到 '+pool.length+' 个盘口 · 选择结果即可准备买入':'本次检索范围内没有匹配盘口，请换一个关键词。';retry.hidden=payload.stale!==true;
  }catch(error){if(ticket===generation&&!disposed&&error.name!=='AbortError')unavailable(key,error);}
  finally{if(ticket===generation){loading=false;submit.disabled=retry.disabled=false;shuffle.disabled=!pool.length;}}
 }
 form.onsubmit=e=>{e.preventDefault();presets.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));runSearch();};
 shuffle.onclick=()=>pool.length?rotate():(feedMode?loadFeed():runSearch());
 function openMarket(m,outcome){
  if(disposed||m.provider!=='polymarket'||purchase?.canLeave?.()===false)return;
  generation++;controller?.abort();loading=false;submit.disabled=retry.disabled=false;shuffle.disabled=false;disposePurchase();source=m;onSelect?.(m,outcome);header.hidden=true;discovery.hidden=true;selected.replaceChildren();
  const top=el('div',null,'prediction-selection-head'),returnButton=button('← 返回事件','prediction-back');returnButton.onclick=back;top.append(returnButton,el('span','Polymarket · Polygon','prediction-muted'));selected.append(top);
  const outcomes=el('div',null,'prediction-choice');outcomes.setAttribute('aria-label','选择预测结果');
  for(const o of m.outcomes){const b=button(o.label);b.setAttribute('aria-pressed',String(o.key===outcome));b.onclick=()=>openMarket(m,o.key);outcomes.append(b);}selected.append(outcomes);
  purchase=polymarketPurchase({market:m,outcome,getWallet,pickWallet});selected.append(purchase);
  const rules=el('details',null,'prediction-rules');rules.append(el('summary','事件规则与英文原文'),el('p',m.question),el('p',m.description||'请在平台核对完整结算规则。'),el('p','结算来源：'+(m.resolutionSource||'待核实')));
  try{const u=new URL(m.url);if(u.protocol==='https:'&&u.hostname==='polymarket.com'){const a=el('a','查看平台规则 ↗');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';rules.append(a);}}catch{}
  selected.append(rules);
  if(onDiscuss){const discuss=button('先和 Oasis 聊聊这个事件','prediction-discuss');discuss.onclick=()=>{if(purchase?.canLeave?.()!==false)onDiscuss(m,outcome);};selected.append(discuss);}
 }
 const timer=setInterval(()=>{if(!disposed&&!source&&feedMode&&!document.hidden&&root.isConnected&&root.getClientRects().length)loadFeed({background:true});},60000);
 root.dispose=()=>{disposed=true;generation++;controller?.abort();disposePurchase();clearInterval(timer);};
 queueMicrotask(()=>{if(!disposed){if(initialMarket?.provider==='polymarket')openMarket(initialMarket,initialOutcome);else if(initialQuery){query.value=initialQuery;runSearch();}else loadFeed();}});return root;
}
