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
export function testnetPanel(run) {
  const root=document.createElement("details");
  root.className="advanced-budget";
  root.append(element("summary","测试网现货交易 · UETH/USDC"));
  if(run.terms?.quoteAsset!=="USDC") {
    root.append(element("p","请新建 ETH 策略，将投资金额币种设为 USDC，再运行策略。"));return root;
  }
  const cloid="0x"+run.id.replaceAll("-","");
  if(!/^0x[0-9a-f]{32}$/i.test(cloid))return root;
  const key="oasis-hl-test-order:"+run.id;
  const note=element("p","用户钱包签名 · 仅测试网 · 限价立即成交，剩余撤销。");
  const form=element("div",""),result=element("p","");
  result.setAttribute("role","status");
  root.append(note,form,result);
  function button(text,handler) {
    const b=element("button",text);b.type="button";b.className="ghost";
    b.onclick=async()=>{b.disabled=true;try{await handler();}catch(e){result.textContent=e?.message||"操作失败";}finally{b.disabled=false;}};
    form.append(b);return b;
  }
  function showRecord(rec) {
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
  button("连接测试钱包并查看报价",async()=>{
    const wallet=window.ethereum;
    if(!wallet)throw Error("请用已安装 EVM 钱包的浏览器打开");
    const [address]=await wallet.request({method:"eth_requestAccounts"});
    const market=spotMarket(await post("/info",{type:"spotMeta"}));
    const [free,book]=await Promise.all([funds(address),post("/info",{type:"l2Book",coin:market.coin})]);
    note.textContent="测试钱包 "+address+" · 可用 "+free+" 测试 USDC · 买一 "+(book.levels[0][0]?.px||"—")+" / 卖一 "+(book.levels[1][0]?.px||"—")+" · 单次上限 "+run.terms.maxOrder+" USDC";
    form.replaceChildren();
    const label=element("label","买入限价（USDC / UETH）"),input=document.createElement("input");
    input.inputMode="decimal";label.append(input);form.append(label);
    button("预览订单",async()=>{
      const order=sizeOrder(run.terms.maxOrder,input.value.trim(),free,market.decimals);
      form.replaceChildren();
      result.textContent="买入 "+order.s+" UETH × 限价 "+order.p+" USDC，最高成交额 "+order.cost+" 测试 USDC（费用另计）。";
      button("返回修改",()=>root.replaceWith(testnetPanel(run)));
      button("用钱包签名并提交测试单",async()=>{
        if(!root.isConnected)return;
        if(localStorage.getItem(key)){showRecord(JSON.parse(localStorage.getItem(key)));return;}
        const check=async()=>{
          const accounts=await wallet.request({method:"eth_accounts"});
          if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw Error("钱包账户已变化，请重新连接");
        };
        await check();
        sizeOrder(run.terms.maxOrder,order.p,await funds(address),market.decimals);
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
  });
  return root;
}
