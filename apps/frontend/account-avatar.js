// Small, account-stable identicon. No remote image requests or browser storage.
export function renderAccountButton(button,user){
 const ns='http://www.w3.org/2000/svg',seed=String(user?.id||'oasis-guest');
 let hash=2166136261;for(const char of seed)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 const palettes=[['#203a2c','#b6ee86'],['#293348','#becdff'],['#3d3029','#e5bf91'],['#343b28','#d0df9f']];
 const [background,foreground]=palettes[hash%palettes.length];
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 40 40');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('account-avatar');
 const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx','20');circle.setAttribute('cy','20');circle.setAttribute('r','20');circle.setAttribute('fill',background);svg.append(circle);
 if(user){for(let row=0;row<5;row++)for(let col=0;col<3;col++){
  if(!((hash>>>(row*3+col))&1)&&!(row===2&&col===2))continue;
  for(const x of col===2?[2]:[col,4-col]){const cell=document.createElementNS(ns,'rect');cell.setAttribute('x',String(8+x*5));cell.setAttribute('y',String(8+row*5));cell.setAttribute('width','4');cell.setAttribute('height','4');cell.setAttribute('rx','1');cell.setAttribute('fill',foreground);svg.append(cell);}
 }}else{const silhouette=document.createElementNS(ns,'path');silhouette.setAttribute('d','M14 29c0-7 12-7 12 0M24 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0');silhouette.setAttribute('fill','none');silhouette.setAttribute('stroke',foreground);silhouette.setAttribute('stroke-width','2');silhouette.setAttribute('stroke-linecap','round');svg.append(silhouette);}
 const label=document.createElement('span');label.className='account-name';label.textContent=user?.email?.split('@')[0]||'登录';
 const chevron=document.createElement('span');chevron.className='account-chevron';chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');
 button.replaceChildren(svg,label,chevron);button.classList.add('account-chip');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label',user?'账号设置，'+(user.email||'已登录'):'使用 Google 登录');button.title=user?.email||'使用 Google 登录';
}
