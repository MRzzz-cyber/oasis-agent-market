import {normalize, intervals, buildCatalog} from "./candles.js";

async function directInfo(payload, signal) {
  const response=await fetch("https://api.hyperliquid.xyz/info",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),signal});
  if(!response.ok)throw Error("Hyperliquid unavailable");
  return response.json();
}
export function indicators(rows, duration, now=Date.now()) {
  const closed=rows.filter(r=>r.t+duration<=now);
  if(closed.length<21)return null;
  const period=closed.slice(-20), last=period.at(-1), prior=closed.slice(-21,-1);
  const average=(bars,key)=>bars.reduce((sum,r)=>sum+r[key],0)/bars.length;
  const meanVolume=average(prior,"v");
  return {change:(last.c/period[0].o-1)*100, low:Math.min(...period.map(r=>r.l)),high:Math.max(...period.map(r=>r.h)),
    sma:average(period,"c"),close:last.c,volumeRatio:meanVolume?last.v/meanVolume:null};
}
export function marketView(analyze) {
  const el = id => document.getElementById(id);
  const canvas = el("market-chart"), status = el("market-status"), action = el("market-analyze");
  const price = n => n.toLocaleString("en-US",{maximumFractionDigits:5});
  let rows = [], generation = 0, socket, timer, controller, active = false, hover = -1, refreshed = 0;
  let coin, interval, feedKey, catalogRetry;
  function insights() {
    const root=el("market-insights"); root.replaceChildren();
    const m=indicators(rows,intervals[interval]);
    if(!m)return;
    for(const [title,value,detail] of [
      ["区间涨跌",(m.change>=0?"+":"")+m.change.toFixed(2)+"%","近20根已收盘 · "+interval],
      ["价格区间",price(m.low)+" – "+price(m.high),"近20根最低 / 最高"],
      ["20周期均价",price(m.sma),"收盘价"+(m.close>=m.sma?"高于或等于":"低于")+"简单移动均线"],
      ["相对成交量",m.volumeRatio==null?"—":m.volumeRatio.toFixed(2)+"×","最新已收盘量 / 此前20根均量"]
    ]) {
      const card=document.createElement("div");
      for(const [tag,text] of [["small",title],["strong",value],["small",detail]]) {
        const element=document.createElement(tag);element.textContent=text;card.append(element);
      }
      root.append(card);
    }
  }
  const common = ["BTC","ETH","SOL","XRP","HYPE","xyz:TSLA","xyz:NVDA","xyz:AAPL","xyz:SP500","xyz:GOLD"];
  let catalog=[], loading=false;
  const selected = ()=>catalog.find(m=>m.id===coin) || {label:coin,quote:"USD",group:"加密永续"};
  function options() {
    const group=el("market-group").value, select=el("market-coin"), previous=select.value;
    const list=group==="常用" ? common.map(id=>catalog.find(m=>m.id===id)).filter(Boolean) : catalog.filter(m=>group==="全部" || m.group===group).sort((a,b)=>a.label.localeCompare(b.label));
    select.replaceChildren(...list.map(m=>new Option(m.label+(m.alias?" · "+m.alias:"")+(m.id.includes(":")?" · "+m.id.split(":")[0]:""),m.id)));
    if(list.some(m=>m.id===previous))select.value=previous;
    el("market-count").textContent=group+" · "+list.length+" 个市场";
    if(active && select.value!==coin)start();
  }
  async function directory() {
    if(loading || catalog.length)return;
    loading=true; el("market-group").disabled=true;
    try {
      let markets;
      try {
        const r=await fetch("/api/market/catalog",{signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw Error();
        markets=(await r.json()).markets;
        if(!markets?.length)throw Error();
      } catch {
        const signal=AbortSignal.timeout(10000);
        const [perps,spot]=await Promise.all(["allPerpMetas","spotMeta"].map(type=>directInfo({type},signal)));
        markets=buildCatalog(perps,spot);
        if(!markets.length)throw Error();
      }
      catalog=markets;options();
    } catch {
      el("market-count").textContent="使用常用目录 · 完整目录等待重试";
      clearTimeout(catalogRetry);if(active)catalogRetry=setTimeout(directory,30000);
    }
    finally{loading=false;el("market-group").disabled=!catalog.length;}
  }
  el("market-group").onchange=options;
  function draw() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = width*scale; canvas.height = height*scale;
    const g = canvas.getContext("2d");
    g.scale(scale,scale);
    if (!rows.length) return;
    const hi = Math.max(...rows.map(r=>r.h)), lo = Math.min(...rows.map(r=>r.l));
    const range = hi-lo || hi*0.001, bottom=height-68, right=width-78;
    const y = n => bottom-8-(n-lo)/range*(bottom-24);
    const step = right/rows.length, volume = Math.max(1,...rows.map(r=>r.v));
    g.font="11px system-ui";
    for(let i=0;i<=4;i++) {
      const value = lo+range*i/4, line=y(value);
      g.fillStyle="#e0e5df"; g.fillRect(0,line,right,1);
      g.fillStyle="#57695f"; g.fillText(price(value),right+5,line+3);
    }
    rows.forEach((r,i)=>{
      const x=(i+.5)*step, w=Math.max(1,step*.68);
      g.fillStyle=r.c>=r.o?"#247455":"#ba4d47";
      g.fillRect(x,y(r.h),1,Math.max(1,y(r.l)-y(r.h)));
      g.fillRect(x-w/2,y(Math.max(r.o,r.c)),w,Math.max(1,Math.abs(y(r.o)-y(r.c))));
      const bar=r.v/volume*32;
      g.globalAlpha=.55; g.fillRect(x-w/2,height-24-bar,w,bar); g.globalAlpha=1;
    });
    const stamp = t=>new Date(t).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
    g.fillStyle="#57695f"; g.fillText(stamp(rows[0].t),0,height-5);
    g.textAlign="right";g.fillText(stamp(rows.at(-1).t),right,height-5);
    const r=rows[hover] || rows.at(-1);
    if(rows[hover]) {g.fillStyle="#afc7be"; g.fillRect((hover+.5)*step,0,1,height-24);}
    el("market-detail").textContent=stamp(r.t)+"　开 "+price(r.o)+"　高 "+price(r.h)+"　低 "+price(r.l)+"　收 "+price(r.c)+"　量 "+price(r.v)+" "+selected().label.split("/")[0];
    el("market-price").textContent=price(rows.at(-1).c)+" "+selected().quote;
  }
  function stop() {
    generation++; clearTimeout(timer); controller?.abort();
    if(socket){socket.onclose=null;socket.close();socket=null;}
    action.disabled=true;
  }
  async function start() {
    stop(); if(!active || document.hidden) return;
    const gen=generation;
    coin=el("market-coin").value; interval=el("market-interval").value;
    const key=coin+"|"+interval;
    if(key!==feedKey) {
      feedKey=key; rows=[]; hover=-1;
      try {
        const saved=JSON.parse(sessionStorage.getItem("oasis-last-market"));
        if(saved?.key===key && Array.isArray(saved.rows)) {rows=saved.rows;refreshed=saved.time;}
      } catch {}
      el("market-detail").textContent="";el("market-price").textContent="—";draw();insights();
    }
    status.textContent=rows.length?"上次行情 · "+new Date(refreshed).toLocaleString()+" · 正在刷新":"正在读取 Hyperliquid 行情…";
    if(!coin){status.textContent="此类别暂无市场";return;}
    controller=new AbortController();
    try {
      const symbol=coin, timeframe=interval, signal=controller.signal;
      let candles;
      try {
        const response=await fetch("/api/market/candles?coin="+encodeURIComponent(coin)+"&interval="+interval,{signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
        if(!response.ok)throw Error();
        candles=(await response.json()).candles;
        if(!candles?.length)throw Error();
      } catch {
        if(gen!==generation)return;
        const endTime=Date.now();
        const raw=await directInfo({type:"candleSnapshot",req:{coin:symbol,interval:timeframe,startTime:endTime-100*intervals[timeframe],endTime}},AbortSignal.any([signal,AbortSignal.timeout(10000)]));
        candles=normalize(raw,symbol,timeframe);
        if(!candles.length)throw Error();
      }
      if(gen!==generation)return;
      rows=candles;refreshed=Date.now();draw();insights();
      try {sessionStorage.setItem("oasis-last-market",JSON.stringify({key,rows,time:refreshed}));} catch {}
      action.disabled=false;status.textContent="历史快照 · 正在连接实时行情";
      socket=new WebSocket("wss://api.hyperliquid.xyz/ws");
      socket.onopen=()=>{if(gen===generation)socket.send(JSON.stringify({method:"subscribe",subscription:{type:"candle",coin,interval}}));};
      function reconnect() {
        if(gen!==generation)return;
        status.textContent="连接中断 · 正在重新读取行情"; action.disabled=true;
        clearTimeout(timer);timer=setTimeout(start,4000);
      }
      socket.onclose=reconnect;
      socket.onmessage=event=>{
        if(gen!==generation)return;
        let msg;try{msg=JSON.parse(event.data);}catch{return;}
        if(msg.channel!=="candle")return;
        const updates=normalize(Array.isArray(msg.data)?msg.data:[msg.data],coin,interval);
        if(!updates.length)return;
        const merged=new Map(rows.map(r=>[r.t,r]));updates.forEach(r=>merged.set(r.t,r));
        rows=[...merged.values()].sort((a,b)=>a.t-b.t).slice(-100);
        refreshed=Date.now(); action.disabled=false; draw(); insights();
        status.textContent="实时更新 · "+new Date(refreshed).toLocaleTimeString("zh-CN");
        clearTimeout(timer);timer=setTimeout(start,45000);
      };
      timer=setTimeout(start,45000);
    } catch {
      if(gen!==generation)return;
      status.textContent=(rows.length?"显示上次行情 · "+new Date(refreshed).toLocaleString():"行情暂不可用")+" · 10 秒后重试"; action.disabled=true;
      timer=setTimeout(start,10000);
    }
  }
  el("market-reload").onclick=()=>{start();directory();};
  canvas.onpointermove=e=>{hover=Math.floor((e.clientX-canvas.getBoundingClientRect().left)/(canvas.clientWidth-78)*rows.length);draw();};
  canvas.onpointerleave=()=>{hover=-1;draw();};
  new ResizeObserver(draw).observe(canvas);
  el("market-coin").onchange=el("market-interval").onchange=start;
  document.addEventListener("visibilitychange",()=>{if(active)start();});
  action.onclick=()=>{
    if(!rows.length || action.disabled)return;
    const latest=rows.at(-1), window=rows.slice(-20);
    const high=Math.max(...window.map(r=>r.h)),low=Math.min(...window.map(r=>r.l));
    const tail=window.slice(-6).map(r=>[new Date(r.t).toISOString(),r.o,r.h,r.l,r.c,r.v].join(",")).join("\n");
    analyze("请分析 "+coin+"（"+selected().label+" · "+selected().group+"）的 "+interval+" K 线，解释走势、成交量和判断局限。Hyperliquid 行情读取于 "+new Date(refreshed).toISOString()+"。最新收盘价 "+latest.c+" "+selected().quote+"（末根可能未收盘）。最近 "+window.length+" 根区间 "+low+"–"+high+" "+selected().quote+"。最近样本按 UTC 开盘时间、开、高、低、收、成交量（"+coin+"）排列：\n"+tail);
  };
  return visible=>{active=visible;if(visible){start();directory();}else {stop();clearTimeout(catalogRetry);}};
}
