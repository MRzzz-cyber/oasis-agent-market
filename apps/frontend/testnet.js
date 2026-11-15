import {createL1ActionHash} from "./vendor/hl-hash.js";

const API="https://api.hyperliquid-testnet.xyz";
const TOKEN="0xe4371d8166f362d6578725f11e0a14f3";
const unit=100000000n;
async function post(path,body) {
  const response=await fetch(API+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("测试网请求失败（"+response.status+"）");
  return response.json();
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
// Exactly 10 USDC: with 8-decimal fixed-point price and size their product is 10^17.
// Enumerating its divisors avoids rounding the notional below the exchange minimum.
export function tenOrder(ask, free, decimals) {
  const best=atoms(ask), step=10n**BigInt(8-decimals), target=10n*unit*unit;
  if(best<=0n)throw Error("测试网暂无卖价，请稍后刷新");
  if(atoms(free)<10n*unit)throw Error("测试网现货余额不足，需要至少 10 测试 USDC。");
  let above=null, below=null;
  for(let a=0;a<=17;a++) for(let b=0;b<=17;b++) {
    const size=2n**BigInt(a)*5n**BigInt(b);
    if(size%step)continue;
    const px=target/size;
    const text=clean(decimal(px));
    if(text.includes(".") && (text.split(".")[1].length>8-decimals || text.replace(".","").replace(/^0+/,"").length>5))continue;
    if(px>=best && (above===null || px<above))above=px;
    if(px<best && (below===null || px>below))below=px;
  }
  const limit=above!==null && above*100n<=best*110n ? above : below;
  if(!limit)throw Error("当前没有合适的 10 USDC 限价组合，请稍后重试");
  return sizeOrder("10",clean(decimal(limit)),free,decimals);
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
    agentAddress:agentAddress.toLowerCase(),agentName:"Oasis Test Session",nonce};
  return {action,nonce,typed:{
    domain:{name:"HyperliquidSignTransaction",version:"1",chainId:Number(BigInt(chainId)),verifyingContract:"0x"+"0".repeat(40)},
    primaryType:"HyperliquidTransaction:ApproveAgent",
    types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}],
      "HyperliquidTransaction:ApproveAgent":[{name:"hyperliquidChain",type:"string"},{name:"agentAddress",type:"address"},{name:"agentName",type:"string"},{name:"nonce",type:"uint64"}]},
    message:action
  }};
}
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
      announcedWallets.set(entry.info.uuid,{name:String(entry.info.name || "浏览器钱包").slice(0,80),provider:entry.provider});
    }
  });
}
export function walletChoices(announced,ethereum) {
  const choices=[...announced];
  const legacy=Array.isArray(ethereum?.providers)?ethereum.providers:[ethereum];
  for(const provider of legacy) {
    if(typeof provider?.request!=="function" || choices.some(choice=>choice.provider===provider))continue;
    const name=provider.isRabby?"Rabby":provider.isOkxWallet || provider.isOKExWallet?"OKX Wallet":provider.isMetaMask?"MetaMask":"浏览器钱包";
    choices.push({name,provider});
  }
  return choices;
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
  root.className="ten-trade";
  const progress=element("ol","");progress.className="execution-flow";
  progress.setAttribute("aria-label","测试交易执行流程");
  const detail=element("div","");detail.className="execution-detail";
  detail.setAttribute("role","status");
  const steps=[
    ["确认计划","原始目标："+(run.goal || "历史策略")+"。策略模型："+(run.model || "未记录")+"。本次为手动买入 10 测试 USDC，原策略条件需要你核对。"],
    ["账户与资金","连接你的 EVM 钱包，检查 Hyperliquid 测试网现货可用余额。需要至少 10 测试 USDC，并预留交易费用。"],
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
      b.textContent=steps[i][0]+" · "+(i<stage?"完成":i===stage?"当前步骤":"待进行");
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
  const title=element("h3","用 10 测试 USDC 试买 ETH");
  root.append(title);
  const budget="10";
  const cloid="0x"+run.id.replaceAll("-","");
  if(!/^0x[0-9a-f]{32}$/i.test(cloid))return root;
  const key="oasis-hl-test-order:"+run.id;
  const note=element("p","本次最高买入金额 10 测试 USDC（费用另计）。连接钱包后先预览；兼容签名需要授权测试网交易助手，再单独确认订单。");
  const form=element("div",""),result=element("p","");
  result.setAttribute("role","status");
  root.append(note,form,result);
  function button(text,handler) {
    const b=element("button",text);b.type="button";b.className="ghost";
    b.onclick=async()=>{b.disabled=true;const label=b.textContent;b.textContent="处理中…";result.textContent="正在处理，请留意所选钱包扩展的连接或签名请求。";try{await handler();}catch(e){result.textContent=walletError(e);detail.textContent=result.textContent;}finally{b.disabled=false;b.textContent=label;}};
    form.append(b);return b;
  }
  function showRecord(rec) {
    advance(4,rec.message+"。本次账户："+rec.address+"。客户订单号："+cloid);
    title.textContent="测试网订单回执";
    form.replaceChildren();note.textContent="测试网 · "+rec.address+" · 买入 "+rec.s+" UETH · 限价 "+rec.p+" USDC";
    result.textContent=rec.message+" · 客户订单号 "+cloid;
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
  if(atoms(run.terms.maxOrder)<10n*unit) {
    result.textContent="这条策略的上限低于测试单最低金额 10，无法使用此入口。"; return root;
  }
  const details=element("details","");details.append(element("summary","查看交易规则与模型评审"));
  details.append(element("p","Hyperliquid 测试网 UETH/USDC · 手动限价买入 · 未立即成交的部分撤销。原策略上限 "+run.terms.maxOrder+" "+run.terms.quoteAsset+"，本次独立指定 10 测试 USDC。策略触发和暂停条件由你核对。"));
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
  const walletLabel=element("label","选择交易钱包");
  const walletSelect=element("select","");walletSelect.setAttribute("aria-label","选择交易钱包");
  walletLabel.append(walletSelect);walletBox.append(walletLabel);
  const walletStatus=element("p","连接用于读取账户；预览后可以单独授权测试网交易助手。");
  walletStatus.setAttribute("role","status");walletBox.append(walletStatus);
  root.insertBefore(walletBox,form);
  let choices=[];
  function updateWallets() {
    if(!root.isConnected)return;
    const selected=walletSelect.value===""?null:choices[Number(walletSelect.value)]?.provider;
    choices=walletChoices(announcedWallets.values(),window.ethereum);
    walletSelect.replaceChildren();
    const placeholder=element("option",choices.length?"请选择钱包":"未检测到钱包，请解锁扩展后重新检测");placeholder.value="";
    walletSelect.append(placeholder);
    choices.forEach((choice,index)=>{const option=element("option",choice.name);option.value=String(index);walletSelect.append(option);});
    const index=choices.findIndex(choice=>choice.provider===selected);
    walletSelect.value=index>=0?String(index):choices.length===1?"0":"";
  }
  function discoverWallets() {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    updateWallets();
    setTimeout(updateWallets,200);
  }
  button("重新检测钱包",async()=>{discoverWallets();walletStatus.textContent="请选择与领取测试币相同的钱包和账户。";});
  setTimeout(discoverWallets,0);
  button("连接钱包，预览 10U 测试单",async()=>{
    const selected=walletSelect.value;
    const choice=selected===""?null:choices[Number(selected)];
    if(!choice)throw Error("请先选择钱包；未显示时请解锁扩展并点击重新检测钱包。");
    const wallet=choice.provider;
    walletStatus.textContent="正在请求 "+choice.name+" 连接，请打开该钱包扩展查看待处理请求。";
    const accounts=await wallet.request({method:"eth_requestAccounts"});
    const address=accounts?.[0];
    if(!/^0x[0-9a-f]{40}$/i.test(address || ""))throw Error("未获得有效钱包地址，请解锁钱包并允许网站连接。");
    if(!root.isConnected)return;
    walletStatus.textContent="已连接 "+choice.name+" · "+address;
    note.textContent="当前读取 Hyperliquid 测试网现货账户。钱包已授权时可能直接返回地址；订单预览后再请求测试网助手授权。";
    advance(1,"钱包已连接："+address+"。正在检查测试网现货余额和盘口。余额不足时，请先在 Hyperliquid 测试网准备测试资金，再重新预览。");
    const market=spotMarket(await post("/info",{type:"spotMeta"}));
    const [free,book]=await Promise.all([funds(address),post("/info",{type:"l2Book",coin:market.coin})]);
    const ask=book.levels[1][0]?.px;
    if(!ask)throw Error("暂无卖单，可稍后重新预览");
    walletStatus.textContent="已连接 "+choice.name+" · "+address+" · 现货可用 "+free+" 测试 USDC";
    if(atoms(free)<10n*unit) {
      const perp=await post("/info",{type:"clearinghouseState",user:address}).catch(()=>null);
      const withdrawable=perp?.withdrawable;
      const extra=withdrawable?" 合约账户可划转余额 "+withdrawable+" 测试 USDC。":"";
      throw Error("当前地址 "+address+" 的测试网现货可用余额为 "+free+" USDC。"+extra+"请核对领取地址；若资金在 Perps，请在官方测试网划转到 Spot，再重新预览。");
    }
    const order=tenOrder(ask,free,market.decimals);
    if(!root.isConnected)return;
    form.replaceChildren();
    walletSelect.disabled=true;
    note.textContent="测试钱包 "+address+" · 可用 "+free+" 测试 USDC";
    result.textContent="买入 "+order.s+" UETH · 最高成交额 10 测试 USDC（费用另计）。当前卖一 "+ask+"，本单限价 "+order.p+" USDC/UETH。"+(atoms(order.p)<atoms(ask)?"限价低于卖一，若卖价不降，本单将撤销。":"实际成交取决于签名提交时的盘口。");
    advance(2,result.textContent+" 可用余额 "+free+" 测试 USDC。提交前重新核对最新盘口，保留本次限价和数量。");
      button("更换钱包或重新报价",()=>root.replaceWith(testnetPanel(run,review)));
      let signer=null,approved=false;
      const consent=element("label","");
      const checkbox=element("input","");checkbox.type="checkbox";
      consent.append(checkbox,element("span","我同意授权测试网交易助手。协议授权覆盖本测试账户交易，10 USDC 为 Oasis 本次订单限制。密钥仅保存在当前页面内存；刷新会丢失密钥，但授权仍需在官方 API 页面撤销。"));
      form.append(consent);
      const apiLink=element("a","在官方测试网管理或撤销 API 授权");
      apiLink.href="https://app.hyperliquid-testnet.xyz/API";apiLink.target="_blank";apiLink.rel="noopener noreferrer";form.append(apiLink);
      const checkAccount=async()=>{
        const accounts=await wallet.request({method:"eth_accounts"});
        if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error("钱包账户已变化，请重新连接");
      };
      button("授权测试网交易助手",async()=>{
        if(!checkbox.checked)throw Error("请先阅读并勾选测试网交易权限说明。");
        if(!root.isConnected)return;
        await checkAccount();
        if(!signer) {
          const {createTestnetSigner}=await import("./vendor/hl-agent.js");
          signer=createTestnetSigner();
        }
        // Reconcile any earlier uncertain approval before signing another approval.
        const isApproved=async()=>{
          const agents=await post("/info",{type:"extraAgents",user:address});
          return agents.some(agent=>agent.address?.toLowerCase()===signer.address.toLowerCase() && agent.validUntil>Date.now());
        };
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
        approved=await isApproved();
        if(!approved)throw Error("授权尚未在交易所确认，请稍后再次点击核对授权");
        result.textContent="测试网助手已授权："+signer.address+"。请单独确认本次 10 USDC 订单。";
        advance(3,result.textContent);
      });
      button("确认 10U 测试订单",async()=>{
        if(!root.isConnected)return;
        if(localStorage.getItem(key)){showRecord(JSON.parse(localStorage.getItem(key)));return;}
        if(!approved || !signer)throw Error("请先授权测试网交易助手，再确认订单。");
        await checkAccount();
        const book=await post("/info",{type:"l2Book",coin:market.coin});
        if(!book.levels[1][0]?.px || !Number.isFinite(book.time) || Date.now()-book.time>30000)throw Error("最新盘口不可用，请重新报价");
        if(atoms(book.levels[1][0].px)>atoms(order.p))throw Error("当前卖价高于预览限价，请重新报价后确认。");
        sizeOrder(budget,order.p,await funds(address),market.decimals);
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
  });
  return root;
}
