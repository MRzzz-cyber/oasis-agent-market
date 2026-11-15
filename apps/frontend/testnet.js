import {accountWallet} from "./account-wallet.js";
import {createL1ActionHash} from "./vendor/hl-hash.js";

const API="https://api.hyperliquid-testnet.xyz";
const TOKEN="0xe4371d8166f362d6578725f11e0a14f3";
const unit=100000000n;
async function post(path,body) {
  if(path==="/info" && body.type==="l2Book") {
    const response=await fetch("/api/testnet/book?coin="+encodeURIComponent(body.coin),{cache:"no-store",signal:AbortSignal.timeout(18000)});
    const book=await response.json();
    if(!response.ok)throw Error(book.error || "测试网报价获取失败");
    return book;
  }
  const response=await fetch(API+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("测试网请求失败（"+response.status+"）");
  return response.json();
}
export function checkBook(book,coin) {
  if(book?.coin!==coin)throw Error("报价交易对不匹配，请重新预览");
  if(!book.levels?.[1]?.[0]?.px)throw Error("测试网暂无卖单，当前无法买入；请稍后重新报价");
  if(!Number.isFinite(book.time) || !Number.isFinite(book.checkedAt))throw Error("报价时间信息异常，请重新报价");
  const age=book.checkedAt-book.time;
  if(age>30000)throw Error("测试网盘口已过期 "+Math.floor(age/1000)+" 秒，请重新报价；持续过期时请稍后再试");
  if(age < -5000)throw Error("交易所报价时间异常，请稍后重新报价");
  if(Math.abs(Date.now()-book.checkedAt)>60000)throw Error("电脑时间与报价服务器相差超过 1 分钟，请先同步系统时间，再重新预览");
  if(!/^\d+(?:\.\d{1,8})?$/.test(String(book.markPx)) || Number(book.markPx)<=0)throw Error("测试网参考价格不可用，无法核对最低交易金额，请重新报价");
  return book.levels[1][0].px;
}
function atoms(value) {
  if(!/^\d{1,14}(\.\d{1,8})?$/.test(String(value)))throw Error("金额或价格格式无效");
  const [i,f=""]=String(value).split(".");
  return BigInt(i)*unit+BigInt(f.padEnd(8,"0"));
}
function decimal(value) {
  return (value/unit).toString()+"."+String(value%unit).padStart(8,"0");
}
const clean=x=>x.replace(/(\.\d*?)0+$/,"$1").replace(/\.$/,"");
export function sizeOrder(budget,price,balance,szDecimals) {
  const p=atoms(price), cap=atoms(budget), free=atoms(balance);
  const px=clean(decimal(p));
  if(p<=0n || !Number.isInteger(szDecimals) || szDecimals<0 || szDecimals>8)throw Error("无效限价或市场精度");
  if(px.includes(".") && (px.split(".")[1].length>8-szDecimals || px.replace(".","").replace(/^0+/,"").length>5))throw Error("限价超出该市场价格精度");
  const step=10n**BigInt(8-szDecimals);
  const size=(cap*unit/p)/step*step;
  const cost=(size*p+unit-1n)/unit;
  if(cost<10n*unit)throw Error("订单名义金额需至少 10 测试 USDC");
  if(cost>free)throw Error("测试网现货可用 USDC 不足");
  return {p:px,s:clean(decimal(size)),cost:clean(decimal(cost))};
}
// Preserve the confirmed cap. Never inflate the limit to manufacture notional.
export function tenOrder(ask, free, decimals, referencePrice, budget="10") {
  if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(String(budget)) || atoms(budget)<10n*unit || atoms(budget)>1000n*unit)throw Error("测试金额需在 10–1000 USDC 之间，最多两位小数");
  if(!Number.isInteger(decimals) || decimals<0 || decimals>8)throw Error("无效市场数量精度");
  const price=atoms(ask),reference=atoms(referencePrice),cap=atoms(budget);
  if(price<=0n || reference<=0n)throw Error("测试网报价或参考价格无效");
  if(atoms(free)<cap)throw Error("测试网现货余额不足，需要至少 "+budget+" 测试 USDC，并预留费用。");
  const step=10n**BigInt(8-decimals);
  // Both the expected fill and the reference notional must clear the floor.
  const floorPrice=price<reference?price:reference;
  const minimumLots=(10n*unit*unit+floorPrice*step-1n)/(floorPrice*step);
  const minimumSize=minimumLots*step;
  const minimumCost=(minimumSize*price+unit-1n)/unit;
  if(minimumCost>cap)throw Error("当前盘口无法在 "+budget+" 测试 USDC 上限内下单：最低数量 "+clean(decimal(minimumSize))+" UETH，按卖一 "+ask+" 计算至少需要 "+clean(decimal(minimumCost))+" 测试 USDC（费用另计）。未请求签名，也未提交订单；请等待报价变化或明确调整测试预算。");
  const order=sizeOrder(budget,ask,free,decimals);
  checkTenMinimum(order,ask,referencePrice,budget);
  return order;
}
export function checkTenMinimum(order,ask,referencePrice,budget="10") {
  if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(String(budget)) || atoms(budget)<10n*unit || atoms(budget)>1000n*unit)throw Error("测试金额需在 10–1000 USDC 之间，最多两位小数");
  const price=atoms(ask),reference=atoms(referencePrice),size=atoms(order.s),limit=atoms(order.p);
  if(price<=0n || reference<=0n || limit*size>atoms(budget)*unit)throw Error("测试订单超过 "+budget+" USDC 上限或报价无效");
  if(price>limit)throw Error("当前卖价高于预览限价，请重新报价后确认。");
  if(size*(price<reference?price:reference)<10n*unit*unit)throw Error("当前预计成交金额或参考金额不足最低 10 USDC，请重新报价。不会提高限价或自动增加预算。");
}
export function spotMarket(meta) {
  const token=meta.tokens.find(t=>t.tokenId?.toLowerCase()===TOKEN && t.name==="UETH");
  const usd=meta.tokens.find(t=>t.name==="USDC" && t.index===0);
  const pair=meta.universe.find(p=>!p.isDelisted && p.tokens[0]===token?.index && p.tokens[1]===usd?.index);
  if(!token || !usd || !pair || !Number.isInteger(pair.index))throw Error("测试网 UETH/USDC 未挂牌");
  return {coin:pair.name,asset:10000+pair.index,decimals:token.szDecimals};
}
export function envelope(asset,order,cloid,nonce) {
  const action={type:"order",orders:[{a:asset,b:true,p:order.p,s:order.s,r:false,t:{limit:{tif:"Ioc"}},c:cloid}],grouping:"na"};
  const expiresAfter=nonce+120000;
  const typed={domain:{name:"Exchange",version:"1",chainId:1337,verifyingContract:"0x"+"0".repeat(40)},primaryType:"Agent",
    types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],Agent:[{name:"source",type:"string"},{name:"connectionId",type:"bytes32"}]},
    message:{source:"b",connectionId:createL1ActionHash({action,nonce,expiresAfter})}};
  return {action,nonce,expiresAfter,typed};
}
export function approvalEnvelope(agentAddress,chainId,nonce) {
  if(!/^0x[0-9a-f]{40}$/i.test(agentAddress) || !/^0x[0-9a-f]+$/i.test(chainId) || !Number.isSafeInteger(Number(BigInt(chainId))))throw Error("无效的授权地址或签名网络");
  const action={type:"approveAgent",hyperliquidChain:"Testnet",signatureChainId:chainId,
    agentAddress:agentAddress.toLowerCase(),agentName:"OasisTest",nonce};
  return {action,nonce,typed:{
    domain:{name:"HyperliquidSignTransaction",version:"1",chainId:Number(BigInt(chainId)),verifyingContract:"0x"+"0".repeat(40)},
    primaryType:"HyperliquidTransaction:ApproveAgent",
    types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],
      "HyperliquidTransaction:ApproveAgent":[{name:"hyperliquidChain",type:"string"},{name:"agentAddress",type:"address"},{name:"agentName",type:"string"},{name:"nonce",type:"uint64"}]},
    message:action
  }};
}
export function isActiveAgent(agents,address,now=Date.now()) {
  if(!Array.isArray(agents) || !/^0x[0-9a-f]{40}$/i.test(address))return false;
  return agents.some(agent=>agent.address?.toLowerCase()===address.toLowerCase() &&
    (agent.validUntil===null || (Number.isFinite(agent.validUntil) && agent.validUntil>now)));
}
// Keep keys in page memory across panel redraws; never serialize session signers.
const testnetSessions=new Map();
if(typeof window!=="undefined")window.addEventListener("oasis:account-wallet-cleared",()=>testnetSessions.clear());
export function splitSignature(sig) {
  if(!/^0x[0-9a-f]{130}$/i.test(sig))throw Error("钱包返回的签名格式无效");
  let v=parseInt(sig.slice(-2),16);if(v<2)v+=27;
  if(v!==27 && v!==28)throw Error("签名恢复位无效");
  return {r:sig.slice(0,66),s:"0x"+sig.slice(66,130),v};
}
async function funds(address) {
  const state=await post("/info",{type:"spotClearinghouseState",user:address});
  const usdc=state.balances.find(b=>b.token===0 && b.coin==="USDC");
  return usdc?clean(decimal(atoms(usdc.total)-atoms(usdc.hold))):"0";
}
const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
// Keep the provider chosen by the user for account access and signing.
const announcedWallets=new Map();
if(typeof window!=="undefined") {
  window.addEventListener("eip6963:announceProvider",event=>{
    const entry=event.detail;
    if(entry?.provider && typeof entry.provider.request==="function" && typeof entry.info?.uuid==="string") {
      announcedWallets.set(entry.info.uuid,{name:String(entry.info.name || "浏览器钱包").slice(0,80),icon:entry.info.icon,provider:entry.provider});
    }
  });
}
export function walletChoices(announced,ethereum) {
  const choices=[...announced];
  const legacy=Array.isArray(ethereum?.providers)?ethereum.providers:[ethereum];
  for(const provider of legacy) {
    if(typeof provider?.request!=="function" || choices.some(choice=>choice.provider===provider))continue;
    const name=provider.isRabby?"Rabby":provider.isOkxWallet || provider.isOKExWallet?"OKX Wallet":provider.isMetaMask?"MetaMask":"浏览器钱包";
    // Prefer EIP-6963 over legacy proxies announcing the same known wallet.
    const brand=value=>String(value).toLowerCase().replace(/ wallet|\s/g,"");
    if(name!=="浏览器钱包" && choices.some(choice=>brand(choice.name)===brand(name)))continue;
    choices.push({name,provider});
  }
  return choices;
}
export function availableWallets() {
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  const embedded=accountWallet();
  return [...(embedded?[embedded]:[]),...walletChoices(announcedWallets.values(),window.ethereum)];
}
export function walletError(error) {
  if(/chainid.*(?:same|match)/i.test(error?.message || ""))return "钱包拒绝了 Hyperliquid 订单签名域。请使用测试网交易助手授权，再单独确认订单。";
  if(error?.code===4001)return "你取消了钱包请求。请重新选择钱包后连接。";
  if(error?.code===-32002)return "钱包已有待处理请求，请点击浏览器右上角对应钱包扩展，完成或取消请求后再试。";
  if(error?.code===4100)return "钱包尚未授权 Oasis，请在所选钱包中允许此网站连接。";
  if(error?.code===4900 || error?.code===4901)return "钱包连接已断开，请解锁所选钱包后重新连接。";
  return error?.message || "操作失败，请检查钱包扩展中的提示。";
}
export function testnetPanel(run,review) {
  const root=document.createElement("section");
  let selectedProvider=null;
  const onCleared=event=>{if(!root.isConnected){window.removeEventListener("oasis:account-wallet-cleared",onCleared);return;}if(selectedProvider===event.detail?.provider){root.dataset.walletRevoked="true";root.querySelectorAll("button,input").forEach(b=>{b.disabled=true;b.dataset.blocked="true";});root.prepend(element("p","账号钱包会话已结束，请重新登录后打开交易。"));}};
  window.addEventListener("oasis:account-wallet-cleared",onCleared);
  root.className="ten-trade";
  let budget=run.testBudget || "20";
  try{budget=localStorage.getItem("oasis-hl-test-budget:"+run.id) || budget;}catch{}
  if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(String(budget)) || Number(budget)<10 || Number(budget)>1000){root.textContent="测试金额需在 10–1000 USDC 之间，请重新确认计划";return root;}
  const progress=element("ol","");progress.className="execution-flow";
  progress.setAttribute("aria-label","测试交易执行流程");
  const detail=element("div","");detail.className="execution-detail";
  detail.setAttribute("role","status");
  const steps=[
    ["确认计划",run.source==="direct"?"本次为用户确认的单次 ETH 测试交易，上限 "+budget+" 测试 USDC，费用另计。不自动运行策略或模型交易信号。":"原始目标："+(run.goal || "历史策略")+"。策略模型："+(run.model || "未记录")+"。本次为手动买入，上限 "+budget+" 测试 USDC，原策略条件需要你核对。"],
    ["账户与资金","连接你的 EVM 钱包，检查 Hyperliquid 测试网现货可用余额。本次预算上限 "+budget+" 测试 USDC，请预留交易费用。"],
    ["预览订单","读取测试网盘口，计算数量及限价。未立即成交的部分自动撤销。"],
    ["签名与提交","核对账户、数量和限价后，先由钱包授权测试网助手，再由你单独确认本次订单。"],
    ["核对结果","根据交易所回执和成交记录显示结果。结果未知时，查询原订单后再处理。"]
  ];
  let stage=0;
  const stepButtons=[];
  function selectStep(index) {
    detail.textContent=steps[index][1];
    stepButtons.forEach((b,i)=>b.setAttribute("aria-expanded",String(i===index)));
  }
  function advance(index,message) {
    stage=index;
    if(message)steps[index][1]=message;
    stepButtons.forEach((b,i)=>{
      b.dataset.state=i<stage?"done":i===stage?"current":"pending";
      const number=element("span",i<stage?"✓":String(i+1).padStart(2,"0"));
      number.className="execution-number";
      b.replaceChildren(number,element("strong",steps[i][0]),element("small",i<stage?"已完成":i===stage?"当前步骤":"待进行"));
      if(i===stage)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");
    });
    selectStep(index);
  }
  steps.forEach((step,index)=>{
    const li=element("li",""),b=element("button","");b.type="button";
    b.onclick=()=>selectStep(index);stepButtons.push(b);li.append(b);progress.append(li);
  });
  root.append(progress,detail);
  advance(0);
  const title=element("h3","用最多 "+budget+" 测试 USDC 试买 ETH");
  title.className="trade-title";root.append(title);
  const cloid="0x"+run.id.replaceAll("-","");
  if(!/^0x[0-9a-f]{32}$/i.test(cloid))return root;
  const key="oasis-hl-test-order:"+run.id;
  const note=element("p","本次买入上限 "+budget+" 测试 USDC，费用另计。先连接钱包预览，再授权助手并确认订单。");
  const form=element("div",""),result=element("p","");
  form.className="trade-actions";result.className="trade-feedback";
  result.setAttribute("role","status");
  note.className="trade-intro";
  root.append(note,result,form);
  function button(text,handler) {
    const b=element("button",text);b.type="button";b.className="ghost";
    b.onclick=async()=>{if(root.dataset.walletRevoked==="true")return;b.disabled=true;b.dataset.busy="true";const label=b.textContent;b.textContent="处理中…";result.textContent="正在处理，请留意所选钱包扩展的连接或签名请求。";try{await handler();}catch(e){result.textContent=walletError(e);detail.textContent=result.textContent;}finally{delete b.dataset.busy;b.disabled=b.dataset.blocked==="true"||root.dataset.walletRevoked==="true";b.textContent=label;}};
    form.append(b);return b;
  }
  function showRecord(rec) {
    advance(4,rec.message+"。本次账户："+rec.address+"。客户订单号："+cloid);
    title.textContent="测试网订单回执";
    const changeWallet=root.querySelector(".wallet-connection button");if(changeWallet)changeWallet.hidden=true;
    const amountBox=root.querySelector(".test-amount");if(amountBox)amountBox.hidden=true;
    if(/^(已成交|部分成交)/.test(rec.message)) {
      window.dispatchEvent(new Event("oasis:trade-settled"));
      const status=root.querySelector(".wallet-connection p");
      if(status){status.textContent="正在刷新成交后余额…";funds(rec.address).then(free=>{if(root.isConnected)status.textContent=rec.address.slice(0,6)+"…"+rec.address.slice(-4)+" · 成交后可用 "+free+" 测试 USDC";}).catch(()=>{status.textContent="成交已确认，余额刷新失败，请在钱包与资金面板重新读取。";});}
    }
    form.replaceChildren();note.textContent="测试网 · "+rec.address+" · 买入 "+rec.s+" UETH · 限价 "+rec.p+" USDC";
    result.textContent=rec.message+" · 客户订单号 "+cloid;
    if(/minimum value of 10/.test(rec.message))result.textContent+="。此订单未成交：限价上限不等于实际成交金额。请在新预览中检查最低数量与当前预算；本回执保留，不自动重试。";
    button("查询交易所状态",async()=>{
      const q=await post("/info",{type:"orderStatus",user:rec.address,oid:cloid});
      if(q.status!=="order"){result.textContent=rec.message+" · 暂未查到订单，请稍后查询。";advance(4,result.textContent);return;}
      const o=q.order,oid=o.order.oid;
      const fills=await post("/info",{type:"userFillsByTime",user:rec.address,startTime:rec.nonce-60000,endTime:rec.nonce+600000});
      const matches=fills.filter(f=>f.oid===oid);
      const size=matches.reduce((n,f)=>n+Number(f.sz),0);
      const avg=size?matches.reduce((n,f)=>n+Number(f.sz)*Number(f.px),0)/size:0;
      const partial=size>0 && size<Number(rec.s);
      const labels={filled:"已成交",open:"已挂单",canceled:"已撤销",rejected:"已拒绝",iocCancelRejected:"未立即成交"};
      rec.message=(partial?"部分成交 · ":"")+(labels[o.status]||o.status)+" · 交易所订单 "+oid+(size?" · 已成交 "+size.toFixed(4)+" UETH · 均价 "+avg.toFixed(4)+" USDC":"");
      localStorage.setItem(key,JSON.stringify(rec));result.textContent=rec.message;advance(4,rec.message);
    });
  }
  let previous;
  try { previous=localStorage.getItem(key); } catch {root.append(element("p","请启用浏览器本地存储以保存测试订单回执"));return root;}
  if(previous){
    try {
      const record=JSON.parse(previous);
      if(!record || !/^0x[0-9a-f]{40}$/i.test(record.address) || !Number.isFinite(record.nonce))throw Error("invalid record");
      showRecord(record);
    } catch {
      result.textContent="本地订单回执损坏，请核对交易所订单记录后处理。此运行已锁定，避免重复下单。";
      advance(4,result.textContent);
    }
    return root;
  }
  const amountBox=element("div","");amountBox.className="test-amount";
  const amountLabel=element("label","本次测试金额上限（测试 USDC，费用另计）");
  const amountInput=element("input","");amountInput.type="number";amountInput.min="10";amountInput.max="1000";amountInput.step="0.01";amountInput.value=budget;amountInput.setAttribute("aria-label","本次测试金额上限");
  amountLabel.append(amountInput);
  const applyAmount=element("button","应用金额");applyAmount.type="button";applyAmount.className="ghost";
  applyAmount.onclick=()=>{
    const value=amountInput.value.trim();
    if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(value) || Number(value)<10 || Number(value)>1000){result.textContent="请输入 10–1000 测试 USDC，最多两位小数";return;}
    try{localStorage.setItem("oasis-hl-test-budget:"+run.id,value);root.replaceWith(testnetPanel({...run,testBudget:value},review));}catch{result.textContent="无法保存本次测试金额，请检查浏览器存储权限";}
  };
  amountBox.append(amountLabel,applyAmount,element("small","本次是独立手动测试，金额以此处预览为准，不自动执行原策略。"));root.insertBefore(amountBox,result);
  const details=element("details","");details.append(element("summary",run.source==="direct"?"查看测试交易规则":"查看交易规则与模型评审"));
  details.append(element("p","Hyperliquid 测试网 UETH/USDC · 手动限价买入 · 未立即成交的部分撤销。原策略上限 "+run.terms.maxOrder+" "+run.terms.quoteAsset+"，本次独立指定上限 "+budget+" 测试 USDC。策略触发和暂停条件由你核对。"));
  root.append(details);
  if(review && run.modelId) {
    const output=element("p","");
    const assess=button("用策略模型评审盘口",async()=>{
      const market=spotMarket(await post("/info",{type:"spotMeta"}));
      const book=await post("/info",{type:"l2Book",coin:market.coin});
      await review(run,{pair:"UETH/USDC",network:"testnet",time:book.time,bid:book.levels[0][0]?.px,ask:book.levels[1][0]?.px},output);
    });
    details.append(assess,output);
  }
  const walletBox=element("div","");walletBox.className="wallet-connection";
  const walletBadge=element("span","◇");walletBadge.className="wallet-account-icon";walletBadge.setAttribute("aria-hidden","true");
  const walletCopy=element("div","");
  const walletName=element("strong","连接你的交易钱包");
  const walletStatus=element("p","选择领取测试币的钱包，连接后读取账户余额。");
  walletStatus.setAttribute("role","status");walletCopy.append(walletName,walletStatus);
  const walletTrigger=element("button","连接钱包");walletTrigger.type="button";walletTrigger.className="primary";
  walletTrigger.setAttribute("aria-haspopup","dialog");
  walletBox.append(walletBadge,walletCopy,walletTrigger);
  root.insertBefore(walletBox,result);

  const dialog=element("dialog","");dialog.className="wallet-dialog";
  const headingId="wallet-heading-"+run.id;
  dialog.setAttribute("aria-labelledby",headingId);
  const dialogHead=element("div","");dialogHead.className="wallet-dialog-head";
  const heading=element("h2","连接交易钱包");heading.id=headingId;
  const close=element("button","×");close.type="button";close.className="wallet-dialog-close";close.setAttribute("aria-label","关闭钱包选择");close.onclick=()=>dialog.close();
  dialogHead.append(heading,close);
  const description=element("p","选择领取测试币的钱包。连接后预览订单，交易需要另行授权和确认。");
  const descriptionId="wallet-description-"+run.id;description.id=descriptionId;dialog.setAttribute("aria-describedby",descriptionId);
  const walletList=element("div","");walletList.className="wallet-list";
  const dialogFoot=element("div","");dialogFoot.className="wallet-dialog-foot";
  const network=element("span","Hyperliquid Testnet");
  const refresh=element("button","重新检测");refresh.type="button";
  dialogFoot.append(network,refresh);
  dialog.append(dialogHead,description,walletList,dialogFoot);root.append(dialog);
  dialog.addEventListener("click",event=>{
    const box=dialog.getBoundingClientRect();
    if(event.target===dialog && (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom))dialog.close();
  });
  let connecting=false;
  function updateWallets() {
    if(!root.isConnected || connecting)return;
    const choices=walletChoices(announcedWallets.values(),window.ethereum);
    walletList.replaceChildren();
    if(!choices.length) {
      const empty=element("div","");empty.className="wallet-empty";
      empty.append(element("strong","还未检测到钱包"),element("p","请安装或解锁 EVM 钱包扩展，再点击重新检测。"));walletList.append(empty);
    }
    for(const choice of choices) {
      const row=element("button","");row.type="button";row.className="wallet-option";
      const icon=element("span",choice.name.slice(0,1).toUpperCase());icon.className="wallet-option-icon";icon.setAttribute("aria-hidden","true");
      if(typeof choice.icon==="string" && /^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/i.test(choice.icon)) {
        const img=document.createElement("img");img.src=choice.icon;img.alt="";
        img.onerror=()=>icon.replaceChildren(document.createTextNode(choice.name.slice(0,1).toUpperCase()));icon.replaceChildren(img);
      }
      const copy=element("span","");copy.className="wallet-option-copy";copy.append(element("strong",choice.name),element("small",choice.kind==="embedded"?"独立账号钱包 · Privy":"已检测到 · 浏览器钱包"));
      const arrow=element("span","↗");arrow.className="wallet-option-arrow";arrow.setAttribute("aria-hidden","true");row.append(icon,copy,arrow);
      row.onclick=async()=>{
        if(connecting)return;
        connecting=true;walletTrigger.disabled=true;dialog.close();
        walletTrigger.textContent="连接中…";
        result.textContent="正在连接钱包，请留意浏览器中的钱包请求。";
        try {await connectWallet(choice);}
        catch(error){result.textContent=walletError(error);detail.textContent=result.textContent;}
        finally{connecting=false;walletTrigger.disabled=false;walletTrigger.textContent="更换钱包";}
      };
      walletList.append(row);
    }
  }
  function discoverWallets() {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    updateWallets();setTimeout(updateWallets,200);
  }
  refresh.onclick=discoverWallets;
  walletTrigger.onclick=()=>{discoverWallets();dialog.showModal();};
  async function connectWallet(choice) {
    if(amountInput.value.trim()!==budget)throw Error("金额已修改，请先点击应用金额，再连接钱包预览。");
    const wallet=choice.provider;selectedProvider=wallet;
    walletStatus.textContent="正在请求 "+choice.name+" 连接，请打开该钱包扩展查看待处理请求。";
    const accounts=await wallet.request({method:"eth_requestAccounts"});
    const address=accounts?.[0];
    if(!/^0x[0-9a-f]{40}$/i.test(address || ""))throw Error("未获得有效钱包地址，请解锁钱包并允许网站连接。");
    if(!root.isConnected)return;
    walletName.textContent=choice.name;walletBadge.textContent="✓";
    window.dispatchEvent(new CustomEvent("oasis:wallet-connected",{detail:{address,name:choice.name,provider:wallet,kind:choice.kind}}));
    walletStatus.textContent=address.slice(0,6)+"…"+address.slice(-4)+" · 已连接";walletStatus.title=address;
    note.textContent="当前读取 Hyperliquid 测试网现货账户。钱包已授权时可能直接返回地址；订单预览后再请求测试网助手授权。";
    advance(1,"钱包已连接："+address+"。正在检查测试网现货余额和盘口。余额不足时，请先在 Hyperliquid 测试网准备测试资金，再重新预览。");
    const market=spotMarket(await post("/info",{type:"spotMeta"}));
    const [free,book]=await Promise.all([funds(address),post("/info",{type:"l2Book",coin:market.coin})]);
    const ask=checkBook(book,market.coin);
    walletStatus.textContent=address.slice(0,6)+"…"+address.slice(-4)+" · 现货可用 "+free+" 测试 USDC";
    if(atoms(free)<10n*unit) {
      const perp=await post("/info",{type:"clearinghouseState",user:address}).catch(()=>null);
      const withdrawable=perp?.withdrawable;
      const extra=withdrawable?" 合约账户可划转余额 "+withdrawable+" 测试 USDC。":"";
      throw Error("当前地址 "+address+" 的测试网现货可用余额为 "+free+" USDC。"+extra+"请核对领取地址；若资金在 Perps，请在官方测试网划转到 Spot，再重新预览。");
    }
    const order=tenOrder(ask,free,market.decimals,book.markPx,budget);
    if(!root.isConnected)return;
    form.replaceChildren();
    amountInput.disabled=true;applyAmount.disabled=true;
    walletTrigger.onclick=()=>{const next=testnetPanel(run,review);root.replaceWith(next);next.querySelector(".wallet-connection button")?.click();};
    note.textContent="测试钱包 "+address+" · 可用 "+free+" 测试 USDC";
    result.textContent="买入 "+order.s+" UETH · 预计成交额 "+order.cost+" 测试 USDC，预算上限 "+budget+"（费用另计）。当前卖一 "+ask+"，本单限价 "+order.p+" USDC/UETH。"+(atoms(order.p)<atoms(ask)?"限价低于卖一，若卖价不降，本单将撤销。":"实际成交取决于签名提交时的盘口。");
    result.textContent+=" 盘口买一 "+(book.levels[0]?.[0]?.px || "暂无")+"，卖一 "+ask+"，参考价 "+book.markPx+"；测试网报价不代表真实 ETH 行情。";
    advance(2,result.textContent+" 可用余额 "+free+" 测试 USDC。提交前重新核对最新盘口，保留本次限价和数量。");
      button("更换钱包或重新报价",()=>root.replaceWith(testnetPanel(run,review)));
      const sessionKey=run.id+":"+address.toLowerCase()+":"+budget;
      if(!testnetSessions.has(sessionKey))testnetSessions.set(sessionKey,{signer:null,approved:false});
      const session=testnetSessions.get(sessionKey);
      let signer=session.signer,approved=session.approved;
      const approvalStatus=element("p",approved?"测试网助手已验证，请确认订单。":"测试网助手待授权，授权验证成功后开放交易。");
      approvalStatus.setAttribute("role","status");approvalStatus.className="trade-approval-status";form.append(approvalStatus);
      const isApproved=async()=>{
        if(!signer)return false;
        const agents=await post("/info",{type:"extraAgents",user:address});
        return isActiveAgent(agents,signer.address);
      };
      const reconcileApproval=async()=>{
        confirmOrder.dataset.blocked="true";
        confirmOrder.disabled=true;
        approved=await isApproved();session.approved=approved;
        confirmOrder.dataset.blocked=String(!approved);
        confirmOrder.disabled=!approved || confirmOrder.dataset.busy==="true";
        approvalStatus.textContent=approved?"交易所已确认测试网助手："+signer.address+"。现在可以确认上限 "+budget+" USDC 的订单。":"交易所暂未确认此助手，请完成授权后点击核对状态。";
        if(approved)advance(3,approvalStatus.textContent);
        return approved;
      };
      const consent=element("label","");consent.className="trade-consent";
      const checkbox=element("input","");checkbox.type="checkbox";
      consent.append(checkbox,element("span","我同意授权测试网交易助手。协议授权覆盖本测试账户交易，"+budget+" USDC 为 Oasis 本次订单限制。密钥仅保存在当前页面内存；刷新会丢失密钥，但授权仍需在官方 API 页面撤销。"));
      form.append(consent);
      const apiLink=element("a","在官方测试网管理或撤销 API 授权");
      apiLink.href="https://app.hyperliquid-testnet.xyz/API";apiLink.target="_blank";apiLink.rel="noopener noreferrer";apiLink.className="trade-permission-link";form.append(apiLink);
      const checkAccount=async()=>{
        const accounts=await wallet.request({method:"eth_accounts"});
        if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error("钱包账户已变化，请重新连接");
      };
      button("核对授权状态",async()=>{
        await checkAccount();
        await reconcileApproval();
        result.textContent=approvalStatus.textContent;
      });
      button("授权测试网交易助手",async()=>{
        approvalStatus.textContent="正在检查授权，请留意钱包弹窗。";
        try {
          if(!checkbox.checked)throw Error("请先阅读并勾选测试网交易权限说明。");
          if(!root.isConnected)return;
          await checkAccount();
          if(!signer) {
            const {createTestnetSigner}=await import("./vendor/hl-agent.js?v=privy-v8-20261115");
            signer=createTestnetSigner(budget);session.signer=signer;
          }
          // Reconcile an uncertain earlier request before sending another approval.
          if(!await isApproved()) {
            const chainId=await wallet.request({method:"eth_chainId"});
            const packet=approvalEnvelope(signer.address,chainId,Date.now());
            advance(3,"请在钱包确认测试网 Agent 授权。授权成功后仍需点击确认订单。Agent 地址："+signer.address);
            const signature=splitSignature(await wallet.request({method:"eth_signTypedData_v4",params:[address,JSON.stringify(packet.typed)]}));
            await checkAccount();
            if(!root.isConnected || await wallet.request({method:"eth_chainId"})!==chainId)throw Error("页面或签名网络已变化，请重新检查授权状态");
            const reply=await post("/exchange",{action:packet.action,nonce:packet.nonce,signature});
            if(reply.status!=="ok")throw Error("测试网授权未成功："+String(reply.response));
          }
          for(let attempt=0;attempt<4;attempt++) {
            if(await reconcileApproval())break;
            if(attempt<3)await new Promise(resolve=>setTimeout(resolve,700));
          }
          if(!approved)throw Error("钱包签名已处理，但交易所尚未确认授权。请点击核对授权状态。");
          result.textContent="测试网助手已授权："+signer.address+"。请单独确认本次上限 "+budget+" USDC 的订单。";
          advance(3,result.textContent);
        } catch(error) {
          approvalStatus.textContent="授权未完成："+walletError(error);
          throw error;
        }
      });
      const confirmOrder=button("确认上限 "+budget+" USDC 测试订单",async()=>{
        if(!root.isConnected)return;
        if(localStorage.getItem(key)){showRecord(JSON.parse(localStorage.getItem(key)));return;}
        await checkAccount();
        if(!signer || !await reconcileApproval())throw Error("测试网助手尚未获得有效授权，请先完成授权或核对状态。");
        const book=await post("/info",{type:"l2Book",coin:market.coin});
        const freshAsk=checkBook(book,market.coin);
        checkTenMinimum(order,freshAsk,book.markPx,budget);
        sizeOrder(order.cost,order.p,await funds(address),market.decimals);
        const packet=envelope(market.asset,order,cloid,Date.now());
        const {action,nonce,expiresAfter}=packet;
        if(!root.isConnected)throw Error("页面已变化，请重新确认");
        const signature=splitSignature(await signer.signOrder(packet));
        await checkAccount();
        if(!root.isConnected || Date.now()>=expiresAfter)throw Error("订单已过期，请重新确认");
        const rec={address,nonce,...order,message:"已签名，提交状态待核对"};
        if(localStorage.getItem(key)){showRecord(JSON.parse(localStorage.getItem(key)));return;}
        localStorage.setItem(key,JSON.stringify(rec));
        try {
          const reply=await post("/exchange",{action,nonce,expiresAfter,signature});
          const item=reply.response?.data?.statuses?.[0];
          rec.message=reply.status==="err"?"交易所拒绝："+String(reply.response):item?.error?"交易所拒绝："+item.error:item?.filled?(Number(item.filled.totalSz)<Number(order.s)?"部分成交 · 剩余已撤销 · ":"已成交 · ")+item.filled.totalSz+" UETH · 均价 "+item.filled.avgPx+" · 订单 "+item.filled.oid:item?.resting?"已挂单 · "+item.resting.oid:"已提交，请查询状态";
        } catch {rec.message="提交结果未确认，请查询原订单";}
        localStorage.setItem(key,JSON.stringify(rec));showRecord(rec);
      });
      confirmOrder.classList.replace("ghost","primary");
      confirmOrder.dataset.blocked=String(!approved);
      confirmOrder.disabled=!approved;
  }
  return root;
}
