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
async function funds(address) {
  const state=await post("/info",{type:"spotClearinghouseState",user:address});
  const usdc=state.balances.find(b=>b.token===0 && b.coin==="USDC");
  return usdc?clean(decimal(atoms(usdc.total)-atoms(usdc.hold))):"0";
}
const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text});
export function testnetPanel(run,review) {
  const root=document.createElement("section");
  root.className="ten-trade";
  const title=element("h3","用 10 测试 USDC 试买 ETH");
  root.append(title);
  const budget="10";
  const cloid="0x"+run.id.replaceAll("-","");
  if(!/^0x[0-9a-f]{32}$/i.test(cloid))return root;
  const key="oasis-hl-test-order:"+run.id;
  const note=element("p","本次最高买入金额 10 测试 USDC（费用另计）。连接钱包后先预览，再由你签名。");
  const form=element("div",""),result=element("p","");
  result.setAttribute("role","status");
  root.append(note,form,result);
  function button(text,handler) {
    const b=element("button",text);b.type="button";b.className="ghost";
    b.onclick=async()=>{b.disabled=true;try{await handler();}catch(e){result.textContent=e?.message||"操作失败";}finally{b.disabled=false;}};
    form.append(b);return b;
  }
  function showRecord(rec) {
    title.textContent="测试网订单回执";
    form.replaceChildren();note.textContent="测试网 · "+rec.address+" · 买入 "+rec.s+" UETH · 限价 "+rec.p+" USDC";
    result.textContent=rec.message+" · 客户订单号 "+cloid;
    button("查询交易所状态",async()=>{
      const q=await post("/info",{type:"orderStatus",user:rec.address,oid:cloid});
      if(q.status!=="order"){result.textContent=rec.message+" · 暂未查到订单，请稍后查询。";return;}
      const o=q.order,oid=o.order.oid;
      const fills=await post("/info",{type:"userFillsByTime",user:rec.address,startTime:rec.nonce-60000,endTime:rec.nonce+600000});
      const matches=fills.filter(f=>f.oid===oid);
      const size=matches.reduce((n,f)=>n+Number(f.sz),0);
      const avg=size?matches.reduce((n,f)=>n+Number(f.sz)*Number(f.px),0)/size:0;
      const labels={filled:"已成交",open:"已挂单",canceled:"已撤销",rejected:"已拒绝",iocCancelRejected:"未立即成交"};
      rec.message=(labels[o.status]||o.status)+" · 交易所订单 "+oid+(size?" · 已成交 "+size.toFixed(4)+" UETH · 均价 "+avg.toFixed(4)+" USDC":"");
      localStorage.setItem(key,JSON.stringify(rec));result.textContent=rec.message;
    });
  }
  let previous;
  try { previous=localStorage.getItem(key); } catch {root.append(element("p","请启用浏览器本地存储以保存测试订单回执"));return root;}
  if(previous){showRecord(JSON.parse(previous));return root;}
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
  button("连接钱包，预览 10U 测试单",async()=>{
    const wallet=window.ethereum;
    if(!wallet)throw Error("请用已安装 EVM 钱包的浏览器打开");
    const [address]=await wallet.request({method:"eth_requestAccounts"});
    const market=spotMarket(await post("/info",{type:"spotMeta"}));
    const [free,book]=await Promise.all([funds(address),post("/info",{type:"l2Book",coin:market.coin})]);
    const ask=book.levels[1][0]?.px;
    if(!ask)throw Error("暂无卖单，可稍后重新预览");
    const order=tenOrder(ask,free,market.decimals);
    if(!root.isConnected)return;
    form.replaceChildren();
    note.textContent="测试钱包 "+address+" · 可用 "+free+" 测试 USDC";
    result.textContent="买入 "+order.s+" UETH · 最高成交额 10 测试 USDC（费用另计）。当前卖一 "+ask+"，本单限价 "+order.p+" USDC/UETH。"+(atoms(order.p)<atoms(ask)?"限价低于卖一，若卖价不降，本单将撤销。":"实际成交取决于签名提交时的盘口。");
      button("重新报价",()=>root.replaceWith(testnetPanel(run,review)));
      button("确认 10U，去钱包签名",async()=>{
        if(!root.isConnected)return;
        if(localStorage.getItem(key)){showRecord(JSON.parse(localStorage.getItem(key)));return;}
        const check=async()=>{
          const accounts=await wallet.request({method:"eth_accounts"});
          if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error("钱包账户已变化，请重新连接");
        };
        await check();
        sizeOrder(budget,order.p,await funds(address),market.decimals);
        const {action,typed,nonce,expiresAfter}=envelope(market.asset,order,cloid,Date.now());
        const sig=await wallet.request({method:"eth_signTypedData_v4",params:[address,JSON.stringify(typed)]});
        await check();
        if(!root.isConnected || Date.now()>=expiresAfter)throw Error("预览已过期，请重新确认");
        if(!/^0x[0-9a-f]{130}$/i.test(sig))throw Error("钱包返回的签名格式无效");
        let v=parseInt(sig.slice(-2),16);if(v<2)v+=27;
        if(v!==27 && v!==28)throw Error("签名恢复位无效");
        const rec={address,nonce,...order,message:"已签名，提交状态待核对"};
        if(localStorage.getItem(key)){showRecord(JSON.parse(localStorage.getItem(key)));return;}
        localStorage.setItem(key,JSON.stringify(rec));
        try {
          const reply=await post("/exchange",{action,nonce,expiresAfter,signature:{r:sig.slice(0,66),s:"0x"+sig.slice(66,130),v}});
          const item=reply.response?.data?.statuses?.[0];
          rec.message=reply.status==="err"?"交易所拒绝："+String(reply.response):item?.error?"交易所拒绝："+item.error:item?.filled?(Number(item.filled.totalSz)<Number(order.s)?"部分成交 · 剩余已撤销 · ":"已成交 · ")+item.filled.totalSz+" UETH · 均价 "+item.filled.avgPx+" · 订单 "+item.filled.oid:item?.resting?"已挂单 · "+item.resting.oid:"已提交，请查询状态";
        } catch {rec.message="提交结果未确认，请查询原订单";}
        localStorage.setItem(key,JSON.stringify(rec));showRecord(rec);
      });
  });
  return root;
}
