import {normalize, intervals} from "./candles.js";

export function marketView(analyze) {
  const el = id => document.getElementById(id);
  const canvas = el("market-chart"), status = el("market-status"), action = el("market-analyze");
  const price = n => n.toLocaleString("en-US",{maximumFractionDigits:5});
  let rows = [], generation = 0, socket, timer, controller, active = false, hover = -1, refreshed = 0;
  let coin, interval;
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
    el("market-detail").textContent=stamp(r.t)+"　开 "+price(r.o)+"　高 "+price(r.h)+"　低 "+price(r.l)+"　收 "+price(r.c)+"　量 "+price(r.v)+" "+coin;
    el("market-price").textContent=price(rows.at(-1).c)+" USD";
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
    rows=[];hover=-1;draw();el("market-detail").textContent="";el("market-price").textContent="—";
    status.textContent="正在读取 Hyperliquid 行情…";
    controller=new AbortController();
    try {
      const response=await fetch("/api/market/candles?coin="+coin+"&interval="+interval,{signal:controller.signal});
      if(!response.ok) throw Error();
      const data=await response.json();
      if(gen!==generation)return;
      if(!data.candles?.length)throw Error();
      rows=data.candles;refreshed=Date.now();draw();
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
        refreshed=Date.now(); action.disabled=false; draw();
        status.textContent="实时更新 · "+new Date(refreshed).toLocaleTimeString("zh-CN");
        clearTimeout(timer);timer=setTimeout(start,45000);
      };
      timer=setTimeout(start,45000);
    } catch {
      if(gen!==generation)return;
      status.textContent="行情暂不可用 · 10 秒后重试"; action.disabled=true;
      timer=setTimeout(start,10000);
    }
  }
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
    analyze("请分析 "+coin+" 永续合约的 "+interval+" K 线，解释走势、成交量和判断局限。Hyperliquid 行情读取于 "+new Date(refreshed).toISOString()+"。最新收盘价 "+latest.c+" USD（末根可能未收盘）。最近 "+window.length+" 根区间 "+low+"–"+high+" USD。最近样本按 UTC 开盘时间、开、高、低、收、成交量（"+coin+"）排列：\n"+tail);
  };
  return visible=>{active=visible;if(visible)start();else stop();};
}
