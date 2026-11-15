// Minimal O / eye identity. Only the pupil moves; no requests, storage or continuous idle loop.
const NS='http://www.w3.org/2000/svg';
const resting={x:48,y:24};
export function eyeTarget(rect,x,y) {
  const dx=x-rect.left-rect.width/2,dy=y-rect.top-rect.height/2;
  const distance=Math.max(160,Math.hypot(dx,dy));
  return {x:40+dx/distance*12,y:28+dy/distance*7};
}
export function initEyeMotion(root=document) {
  const eyes=new Map(),motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let pointer=null,frame=0,disposed=false;
  function register(host) {
    if(eyes.has(host))return;
    const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 80 56');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const ring=document.createElementNS(NS,'ellipse');
    for(const [key,value] of Object.entries({cx:40,cy:28,rx:31,ry:19,fill:'none',stroke:'currentColor','stroke-width':8}))ring.setAttribute(key,String(value));
    const pupil=document.createElementNS(NS,'circle');
    for(const [key,value] of Object.entries({cx:resting.x,cy:resting.y,r:5.25,fill:'currentColor','data-eye-pupil':''}))pupil.setAttribute(key,String(value));
    svg.append(ring,pupil);host.replaceChildren(svg);host.classList.add('oasis-eye');host.setAttribute('aria-hidden','true');
    eyes.set(host,{pupil,x:resting.x,y:resting.y});
  }
  function discover(node) {
    if(node.nodeType!==1 && node!==root)return;
    if(node.matches?.('[data-oasis-eye]'))register(node);
    node.querySelectorAll?.('[data-oasis-eye]').forEach(register);
  }
  function schedule(){if(!frame&&!disposed)frame=window.requestAnimationFrame(tick);}
  function tick() {
    frame=0;let moving=false;
    for(const [host,state] of eyes) {
      if(!host.isConnected){eyes.delete(host);continue;}
      const rect=host.getBoundingClientRect();
      if(!rect.width||!rect.height||rect.bottom<0||rect.top>window.innerHeight)continue;
      const target=pointer&&!motion.matches?eyeTarget(rect,pointer.x,pointer.y):resting;
      const dx=target.x-state.x,dy=target.y-state.y;
      if(Math.abs(dx)+Math.abs(dy)<.025){state.x=target.x;state.y=target.y;}
      else{state.x+=dx*.18;state.y+=dy*.18;moving=true;}
      state.pupil.setAttribute('cx',state.x.toFixed(2));state.pupil.setAttribute('cy',state.y.toFixed(2));
    }
    if(moving&&!motion.matches)schedule();
  }
  const move=event=>{if(motion.matches||event.pointerType==='touch')return;pointer={x:event.clientX,y:event.clientY};schedule();};
  const reset=()=>{pointer=null;schedule();};
  const reduce=()=>{pointer=null;for(const state of eyes.values()){state.x=resting.x;state.y=resting.y;state.pupil.setAttribute('cx',String(resting.x));state.pupil.setAttribute('cy',String(resting.y));}if(frame)window.cancelAnimationFrame(frame);frame=0;};
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(discover)));
  discover(root);observer.observe(root===document?document.body:root,{childList:true,subtree:true});
  window.addEventListener('pointermove',move,{passive:true});
  document.documentElement.addEventListener('pointerleave',reset);
  window.addEventListener('blur',reset);motion.addEventListener('change',reduce);
  const cleanup=()=>{disposed=true;if(frame)window.cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',reset);window.removeEventListener('blur',reset);motion.removeEventListener('change',reduce);eyes.clear();};
  window.addEventListener('pagehide',event=>{if(!event.persisted)cleanup();},{once:true});
  return cleanup;
}
