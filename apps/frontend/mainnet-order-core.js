import {createL1ActionHash} from './vendor/hl-hash.js';
export const MAINNET_API='https://api.hyperliquid.xyz';
export const UETH_ID='0xe1edd30daaf5caac3fe63569e24748da';
export const U=100000000n;
export const zero='0x'+'0'.repeat(40);
export function address(value){if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value)||value.toLowerCase()===zero)throw Error('钱包地址无效');return value.toLowerCase();}
export function atoms(value){const text=String(value);if(!/^\d{1,14}(?:\.\d{1,8})?$/.test(text))throw Error('金额或价格格式无效');const [i,f='']=text.split('.');return BigInt(i)*U+BigInt(f.padEnd(8,'0'));}
export function text(value){const v=BigInt(value);if(v<0n)throw Error('金额不能为负');const n=v.toString().padStart(9,'0');return (n.slice(0,-8)+'.'+n.slice(-8)).replace(/\.?0+$/,'')||'0';}
export function budgetAtoms(value){if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(String(value))||atoms(value)<10n*U)throw Error('买入金额至少 10 USDC，最多两位小数');return atoms(value);}
const ceil=(a,b)=>(a+b-1n)/b;
export function mainnetMarket(meta){
 if(!Array.isArray(meta?.tokens)||!Array.isArray(meta.universe))throw Error('主网市场数据无效');
 const matches=meta.tokens.filter(t=>t.name==='UETH'&&t.tokenId?.toLowerCase()===UETH_ID);if(matches.length!==1)throw Error('未找到已验证的主网 ETH 现货');const token=matches[0];
 const usd=meta.tokens.find(t=>t.name==='USDC'&&t.index===0&&t.tokenId?.toLowerCase()==='0x6d1e7cde53ba9467b783cb7c530ce054');
 const pairs=meta.universe.filter(p=>!p.isDelisted&&p.tokens?.[0]===token.index&&p.tokens?.[1]===usd?.index);const pair=pairs[0];
 if(!usd||pairs.length!==1||!Number.isInteger(pair.index)||pair.index<0||pair.name!=='@'+pair.index||!Number.isInteger(token.szDecimals)||token.szDecimals<0||token.szDecimals>8)throw Error('主网 ETH/USDC 交易对不匹配');
 return {coin:pair.name,asset:10000+pair.index,decimals:token.szDecimals,tokenId:UETH_ID};
}
// Unified cash spending is bounded by BOTH unheld USDC and the venue's maintenance allowance.
// No collateral valuation, borrowing, account conversion or perp transfer is inferred here.
export function spotFree(state,accountMode='default'){
 if(!Array.isArray(state?.balances))throw Error('现货余额读取失败');
 const rows=state.balances.filter(x=>x.coin==='USDC'&&x.token===0);if(rows.length>1)throw Error('重复的 USDC 余额');
 const free=rows.length?atoms(rows[0].total)-atoms(rows[0].hold):0n;if(free<0n)throw Error('USDC 可用余额无效');
 if(accountMode!=='unifiedAccount')return text(free);
 if(state.portfolioMarginEnabled===true)throw Error('暂不支持组合保证金账户');
 if(state.balances.some(x=>atoms(x.borrowed??'0')>0n||atoms(x.supplied??'0')>0n))throw Error('当前账户存在借贷，无法确认纯现金买入额度');
 const entries=state.tokenToAvailableAfterMaintenance;
 if(!Array.isArray(entries)||entries.some(x=>!Array.isArray(x)||x.length!==2))throw Error('统一账户可交易额度暂不可用，请刷新报价');
 const allowed=entries.filter(x=>x[0]===0);if(allowed.length!==1)throw Error('统一账户 USDC 可交易额度暂不可用，请刷新报价');
 const maintenance=atoms(allowed[0][1]);return text(free<maintenance?free:maintenance);
}
export function makeQuote({market,book,markPx,available,budget,checkedAt,accountMode='default'}){
 const cap=budgetAtoms(budget);if(!Number.isSafeInteger(checkedAt)||book?.coin!==market.coin||!Number.isSafeInteger(book.time)||checkedAt-book.time>10000||book.time-checkedAt>5000)throw Error('主网盘口已过期，请刷新报价');
 const ask=atoms(book.levels?.[1]?.[0]?.px),bid=atoms(book.levels?.[0]?.[0]?.px),mark=atoms(markPx),free=atoms(available);if(!ask||!bid||!mark||bid>ask||ask*100n>mark*102n||mark*100n>ask*102n)throw Error('现货盘口或参考价异常，请稍后重试');
 const raw=ceil(ask*10050n,10000n);const exponent=raw.toString().length-1-8;const decimals=Math.min(8-market.decimals,Math.max(0,4-exponent));const tick=10n**BigInt(8-decimals),limit=ceil(raw,tick)*tick,step=10n**BigInt(8-market.decimals);
 const floor=ask<mark?ask:mark,minSize=ceil(10n*U*U,floor*step)*step;
 const minimumBudget=ceil(ceil(minSize*limit,U),1000000n)*1000000n;
 const size=(cap*U/limit)/step*step,cost=ceil(size*limit,U),reserve=ceil(cost,100n);
 const reason=!['default','disabled','unifiedAccount'].includes(accountMode)?'暂不支持当前组合保证金账户':size<minSize?'当前精度和限价下，至少需 '+text(minimumBudget)+' USDC（费用另计）；金额不会自动提高':cost+reserve>free?'可交易 USDC 不足：可用 '+text(free)+'，本单含费用预留需 '+text(cost+reserve)+' USDC':'';
 return {network:'hyperliquid-mainnet',address:null,market,budget:text(cap),available:text(free),p:text(limit),s:text(size),cost:text(cost),feeReserve:text(reserve),minimumBudget:text(minimumBudget),ask:text(ask),bid:text(bid),markPx:text(mark),checkedAt,bookTime:book.time,expiresAt:checkedAt+15000,ready:!reason,reason,accountMode};
}
export function validateQuote(q,now){
 address(q?.address);budgetAtoms(q.budget);
 if(q.network!=='hyperliquid-mainnet'||q.market?.tokenId!==UETH_ID||!Number.isSafeInteger(q.market?.asset)||q.market.asset<10000||q.market.asset>1000000||q.market.coin!=='@'+(q.market.asset-10000)||!Number.isInteger(q.market.decimals)||q.market.decimals<0||q.market.decimals>8||!Number.isSafeInteger(now)||!Number.isSafeInteger(q.checkedAt)||q.expiresAt!==q.checkedAt+15000||now>=q.expiresAt||now<q.checkedAt-5000)throw Error('预览无效或已过期，请重新预览');
 const rebuilt=makeQuote({market:q.market,book:{coin:q.market.coin,time:q.bookTime,levels:[[{px:q.bid}],[{px:q.ask}]]},markPx:q.markPx,available:q.available,budget:q.budget,checkedAt:q.checkedAt,accountMode:q.accountMode});
 if(!q.ready||!rebuilt.ready||['p','s','cost','feeReserve','minimumBudget'].some(k=>q[k]!==rebuilt[k]))throw Error('订单数量、最低金额或余额校验失败');return true;
}
export function validateFresh(old,fresh,now){
 validateQuote(old,now);
 if(address(old.address)!==address(fresh.address)||old.market.asset!==fresh.market.asset||old.market.decimals!==fresh.market.decimals||fresh.market.tokenId!==UETH_ID||fresh.market.coin!==old.market.coin||fresh.network!=='hyperliquid-mainnet'||!['default','disabled','unifiedAccount'].includes(fresh.accountMode)||fresh.accountMode!==old.accountMode||!Number.isSafeInteger(fresh.checkedAt)||now-fresh.checkedAt>10000||fresh.checkedAt>now+5000||now-fresh.bookTime>10000||atoms(fresh.bid)>atoms(fresh.ask)||atoms(fresh.ask)>atoms(old.p)||atoms(old.s)*(atoms(fresh.ask)<atoms(fresh.markPx)?atoms(fresh.ask):atoms(fresh.markPx))<10n*U*U||atoms(old.cost)+atoms(old.feeReserve)>atoms(fresh.available))throw Error('行情或余额已变化，请重新预览并确认');
}
export function orderPacket(q,cloid,nonce){validateQuote(q,nonce);if(!/^0x[0-9a-f]{32}$/.test(cloid)||!Number.isSafeInteger(nonce))throw Error('订单标识无效');const action={type:'order',orders:[{a:q.market.asset,b:true,p:q.p,s:q.s,r:false,t:{limit:{tif:'Ioc'}},c:cloid}],grouping:'na'},expiresAfter=nonce+30000;
 const typed={domain:{name:'Exchange',version:'1',chainId:1337,verifyingContract:zero},types:{Agent:[{name:'source',type:'string'},{name:'connectionId',type:'bytes32'}]},primaryType:'Agent',message:{source:'a',connectionId:createL1ActionHash({action,nonce,expiresAfter})}};return {action,nonce,expiresAfter,typed};}
export function approvalPacket(agent,chainId,nonce){address(agent);if(!/^0x[0-9a-f]+$/i.test(chainId)||![1,42161,8453,10,999].includes(Number(BigInt(chainId)))||!Number.isSafeInteger(nonce))throw Error('请切换到支持的主网后再授权');const action={type:'approveAgent',hyperliquidChain:'Mainnet',signatureChainId:chainId,agentAddress:agent.toLowerCase(),agentName:'OasisMainnet',nonce};return {action,nonce,typed:{domain:{name:'HyperliquidSignTransaction',version:'1',chainId:Number(BigInt(chainId)),verifyingContract:zero},primaryType:'HyperliquidTransaction:ApproveAgent',types:{'HyperliquidTransaction:ApproveAgent':[{name:'hyperliquidChain',type:'string'},{name:'agentAddress',type:'address'},{name:'agentName',type:'string'},{name:'nonce',type:'uint64'}]},message:action}};}
export function splitSignature(sig){if(!/^0x[0-9a-f]{130}$/i.test(sig))throw Error('签名格式无效');let v=Number.parseInt(sig.slice(-2),16);if(v<2)v+=27;if(![27,28].includes(v))throw Error('签名恢复位无效');return {r:sig.slice(0,66),s:'0x'+sig.slice(66,130),v};}
export function activeAgent(rows,agent,now){return Array.isArray(rows)&&rows.some(r=>r.address?.toLowerCase()===agent.toLowerCase()&&(r.validUntil===null||Number.isFinite(r.validUntil)&&r.validUntil>now));}
export function exchangeResult(reply,quote){
 const expectedSize=quote.s;
 if(reply?.status==='err')return {status:'rejected',message:'交易所拒绝：'+String(reply.response),terminal:true};
 const item=reply?.status==='ok'&&reply?.response?.type==='order'&&reply.response.data?.statuses?.length===1?reply.response.data.statuses[0]:null;
 if(item?.error)return {status:'rejected',message:'交易所拒绝：'+String(item.error),terminal:true};
 if(item?.filled){const {oid,totalSz,avgPx}=item.filled;if(!Number.isSafeInteger(oid)||atoms(totalSz)<=0n||atoms(totalSz)>atoms(expectedSize)||atoms(avgPx)<=0n||atoms(avgPx)>atoms(quote.p))return {status:'unknown',message:'成交回执格式异常，需核对原订单',terminal:false};return {status:atoms(totalSz)<atoms(expectedSize)?'partial':'filled',message:(atoms(totalSz)<atoms(expectedSize)?'部分成交':'已成交')+' · '+totalSz+' UETH · 均价 '+avgPx+' USDC',oid,size:totalSz,avgPx,terminal:true};}
 return {status:'unknown',message:item?.resting?'订单仍在市场，需核对原订单':'提交结果未确认，请查询原订单',oid:item?.resting?.oid,terminal:false};
}
export function journal(storage,user){
 const master=address(user),key='oasis-mainnet-order-v1:'+master;
 function validate(r){if(!r||r.network!=='hyperliquid-mainnet'||r.address!==master||!/^0x[0-9a-f]{32}$/.test(r.cloid)||!Number.isSafeInteger(r.nonce)||r.expiresAfter!==r.nonce+30000||!Number.isSafeInteger(r.asset)||r.asset<10000||typeof r.terminal!=='boolean'||atoms(r.p)<=0n||atoms(r.s)<=0n||budgetAtoms(r.budget)<=0n)throw Error('订单记录损坏，停止新下单，请先核对');return r;}
 function list(){const raw=storage.getItem(key);if(raw===null)return [];const data=JSON.parse(raw),rows=Array.isArray(data)?data:[data];return rows.map(validate);}
 return {list,load(){const rows=list();return rows.find(r=>!r.terminal)||rows.at(-1)||null;},save(r){const safe=validate({network:'hyperliquid-mainnet',address:master,cloid:r.cloid,nonce:r.nonce,expiresAfter:r.expiresAfter,asset:r.asset,p:r.p,s:r.s,budget:r.budget,status:r.status,message:r.message,terminal:r.terminal===true,oid:r.oid,size:r.size,avgPx:r.avgPx});const rows=list(),index=rows.findIndex(x=>x.cloid===safe.cloid);if(index<0){if(rows.some(x=>!x.terminal))throw Error('仍有原订单待核对，停止新下单');rows.push(safe);}else{const old=rows[index];if(['nonce','expiresAfter','asset','p','s','budget'].some(k=>old[k]!==safe[k]))throw Error('原订单参数不允许更改');rows[index]=safe;}storage.setItem(key,JSON.stringify(rows));return safe;}};
}
