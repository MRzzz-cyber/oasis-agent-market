// Research calculations only. This module never creates an order or spending request.
export const SCALE=1_000_000n;
export function atomic(value){const text=String(value);if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(text))throw Error('金额格式无效，最多六位小数');const [whole,fraction='']=text.split('.');return BigInt(whole)*SCALE+BigInt(fraction.padEnd(6,'0'));}
export function display(value){const n=BigInt(value);if(n<0n)throw Error('金额不能为负');const whole=n/SCALE,tail=(n%SCALE).toString().padStart(6,'0').replace(/0+$/,'');return String(whole)+(tail?'.'+tail:'');}
export function sharesInput(value){const n=atomic(value);if(n<SCALE||n>100_000n*SCALE)throw Error('请输入 1–100000 份，最多六位小数');return n;}
const ceilDiv=(n,d)=>(n+d-1n)/d;
export function estimateDepth(levels,shares,{minimum='0',wholeContracts=false}={}){
 const requested=sharesInput(shares);if(wholeContracts&&requested%SCALE)throw Error('该平台按整数合约报价');
 const parsed=levels.map(row=>({price:atomic(row.price),size:atomic(row.size)}));if(parsed.some(row=>row.price<=0n||row.price>=SCALE||row.size<=0n))throw Error('盘口价格或深度无效');
 parsed.sort((a,b)=>a.price<b.price?-1:a.price>b.price?1:0);
 let remaining=requested,cost=0n,worst=0n;for(const row of parsed){const take=remaining<row.size?remaining:row.size;cost+=ceilDiv(take*row.price,SCALE);remaining-=take;if(take)worst=row.price;if(!remaining)break;}
 const enough=remaining===0n,minimumMet=requested>=atomic(minimum);
 return {requested:display(requested),filled:display(requested-remaining),subtotal:display(cost),averagePrice:requested>remaining?display(ceilDiv(cost*SCALE,requested-remaining)):null,worstPrice:worst?display(worst):null,depthEnough:enough,minimumMet,executable:false,totalCost:null,fees:null,reason:!minimumMet?'低于平台最小订单份额':!enough?'当前卖盘深度不足':'盘口成本未含手续费、网络费或跨链费；不是可提交订单'};
}
export function fundingNeed({requiredAtomic,balanceAtomic,asset,chainId,address}){
 if(typeof asset!=='string'||!asset||!Number.isSafeInteger(chainId)||chainId<=0||!/^0x[a-f0-9]{40}$/i.test(address||''))throw Error('充值目标无效');
 if(typeof requiredAtomic!=='string'||!/^\d{1,30}$/.test(requiredAtomic))throw Error('所需金额无效');
 if(balanceAtomic==null)return {status:'unknown',asset,chainId,address,shortfallAtomic:null};
 if(typeof balanceAtomic!=='string'||!/^\d{1,78}$/.test(balanceAtomic))throw Error('钱包余额无效');const difference=BigInt(requiredAtomic)-BigInt(balanceAtomic);
 return {status:difference>0n?'insufficient':'sufficient',asset,chainId,address,shortfallAtomic:difference>0n?difference.toString():'0'};
}
export function predictionIntent(messages){const last=[...(messages||[])].reverse().find(row=>row.role==='user');return typeof last?.content==='string'&&/预测市场|预测盘口|polymarket|kalshi/i.test(last.content);}
export function comparable(a,b){return !!a?.verifiedEventKey&&a.verifiedEventKey===b?.verifiedEventKey&&!!a?.verifiedOutcomeKey&&a.verifiedOutcomeKey===b?.verifiedOutcomeKey&&!!a?.rulesDigest&&a.rulesDigest===b?.rulesDigest&&!!a?.endDate&&a.endDate===b?.endDate&&!!a?.currency&&a.currency===b?.currency;}
