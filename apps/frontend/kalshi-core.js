import {atomic,display,SCALE} from './prediction-core.js';
export {atomic,display};
export const KALSHI_HOSTS={production:'https://external-api.kalshi.com',demo:'https://external-api.demo.kalshi.co'};
export const KALSHI_PATH='/trade-api/v2';
const ticker=/^[A-Za-z0-9_-]{1,180}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exact=(v,keys)=>!!v&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const check=(v,message)=>{if(!v)throw Error(message);};
export function environment(value){check(Object.hasOwn(KALSHI_HOSTS,value),'请选择 Kalshi 正式或模拟环境');return value;}
export function marketId(value){check(ticker.test(value||''),'Kalshi 盘口无效');return value;}
export function quantity(value){check(/^[1-9]\d{0,3}$/.test(String(value))&&Number(value)<=1000,'请输入 1–1000 的整数合约数');return String(value);}
export function kalshiPreview({market,estimate,series,outcome,count,mode='production',now=Date.now()}){
 environment(mode);marketId(market?.ticker);quantity(count);check(['yes','no'].includes(outcome),'请选择 YES 或 NO');
 check(['active','open'].includes(market.status)&&Date.parse(market.close_time)>now,'该盘口已关闭或截止时间未核实');
 check(['quadratic','quadratic_with_maker_fees','quadratic_with_combo_maker_fees'].includes(series?.fee_type)&&series.fee_multiplier===1,'该系列费率尚不支持安全估算');
 check(Number.isInteger(market.exchange_index)&&market.exchange_index>=0&&market.exchange_index<=1024,'Kalshi 交易分区尚未核实');
 check(estimate?.depthEnough===true&&estimate.minimumMet===true&&String(estimate.requested)===String(count),'卖盘深度不足或合约数不匹配');
 const price=((atomic(estimate.worstPrice)+9999n)/10000n)*10000n;check(price>0n&&price<SCALE,'价格无效');
 // Quadratic taker fee <= 7% * 1/4 per contract. Also reserve
 // one micro-dollar per possible 0.01-contract fill and one cent of rounding.
 const fee=((BigInt(count)*17600n+10000n+9999n)/10000n)*10000n;
 const cap=BigInt(count)*price+fee;check(cap<=1000n*SCALE,'本次最多支付不能超过 1000 USD');
 return {version:'kalshi-api-v1',environment:mode,ticker:market.ticker,question:String(market.title||'').slice(0,400),outcome,count:String(count),limitAtomic:String(price),feeReserveAtomic:String(fee),maxSpendAtomic:String(cap),exchangeIndex:market.exchange_index,at:now,expiresAt:now+30000,currency:'USD'};
}
export function checkKalshiQuote(q,now=Date.now()){
 check(exact(q,['version','environment','ticker','question','outcome','count','limitAtomic','feeReserveAtomic','maxSpendAtomic','exchangeIndex','at','expiresAt','currency'])&&q.version==='kalshi-api-v1'&&q.currency==='USD'&&typeof q.question==='string'&&q.question.length<=400,'报价版本无效');environment(q.environment);marketId(q.ticker);quantity(q.count);
 check(['yes','no'].includes(q.outcome)&&Number.isSafeInteger(q.at)&&Number.isSafeInteger(q.expiresAt)&&q.expiresAt===q.at+30000&&q.at<=now+5000&&q.expiresAt>now,'Kalshi 报价已过期，请刷新');
 check(Number.isInteger(q.exchangeIndex)&&q.exchangeIndex>=0&&q.exchangeIndex<=1024,'Kalshi 交易分区无效');
 check([q.limitAtomic,q.feeReserveAtomic,q.maxSpendAtomic].every(v=>typeof v==='string'&&/^\d{1,20}$/.test(v)),'Kalshi 金额格式无效');const p=BigInt(q.limitAtomic),fee=BigInt(q.feeReserveAtomic),cap=BigInt(q.maxSpendAtomic),expected=((BigInt(q.count)*17600n+19999n)/10000n)*10000n;
 check(p>0n&&p<SCALE&&p%10000n===0n&&fee===expected&&cap===BigInt(q.count)*p+fee&&cap<=1000n*SCALE,'Kalshi 价格或支付上限无效');return q;
}
export function kalshiOrder(q,clientId,now=Date.now()){
 checkKalshiQuote(q,now);check(uuid.test(clientId||''),'客户订单号无效');const yesPrice=q.outcome==='yes'?BigInt(q.limitAtomic):SCALE-BigInt(q.limitAtomic);
 return {ticker:q.ticker,side:q.outcome==='yes'?'bid':'ask',count:q.count,price:display(yesPrice),time_in_force:'fill_or_kill',self_trade_prevention_type:'taker_at_cross',client_order_id:clientId,subaccount:0,exchange_index:q.exchangeIndex};
}
export function checkKalshiOrder(body,q,now=Date.now()){const expected=kalshiOrder(q,body?.client_order_id,now);check(exact(body,Object.keys(expected))&&Object.keys(expected).every(k=>body[k]===expected[k]),'订单与确认的盘口、结果、金额或限价不匹配');return expected;}
export function receiptState(reply,q,clientId){
 if(reply?.client_order_id!==clientId||!uuid.test(reply.order_id||''))return null;
 let filled,remaining;try{filled=atomic(reply.fill_count);remaining=atomic(reply.remaining_count);}catch{return null;}
 if(filled<0n||filled>BigInt(q.count)*SCALE||remaining!==0n)return null;
 if(filled===0n)return {terminal:true,status:'unfilled',message:'平台未成交，本次订单已结束',orderId:reply.order_id};
 let price,fee;try{price=atomic(reply.average_fill_price);fee=atomic(reply.average_fee_paid);}catch{return null;}
 if(price<=0n||price>=SCALE)return null;const costPrice=q.outcome==='yes'?price:SCALE-price,cost=(filled*(costPrice+fee)+SCALE-1n)/SCALE;
 if(costPrice>BigInt(q.limitAtomic)||cost>BigInt(q.maxSpendAtomic))return null;
 return {terminal:true,status:filled===BigInt(q.count)*SCALE?'filled':'partial',message:'Kalshi 平台报告已成交',orderId:reply.order_id,filled:display(filled),spent:display(cost)};
}
const prefix='oasis-kalshi-order:';
export function kalshiJournal(storage,accountHash){check(/^[a-f0-9]{64}$/.test(accountHash||''),'Kalshi 账号标识无效');const key=prefix+accountHash;
 function load(){let value;try{value=storage.getItem(key);if(!value)return null;value=JSON.parse(value);}catch{throw Error('Kalshi 订单记录无法读取，请先核对');}check(value?.version==='kalshi-api-v1'&&value.accountHash===accountHash&&/^0x[a-f0-9]{40}$/.test(value.owner||'')&&uuid.test(value.clientId||'')&&typeof value.terminal==='boolean'&&Number.isSafeInteger(value.at)&&value.at>=0&&['preparing','submitting','unknown','not-submitted','rejected','filled','partial','unfilled'].includes(value.status)&&(!value.orderId||uuid.test(value.orderId)),'Kalshi 订单记录无效，请先核对');checkKalshiQuote(value.quote,value.quote?.at+1);check(value.filled==null||typeof value.filled==='string'&&/^\d+(?:\.\d{1,6})?$/.test(value.filled),'Kalshi 订单记录无效');check(value.spent==null||typeof value.spent==='string'&&/^\d+(?:\.\d{1,6})?$/.test(value.spent),'Kalshi 订单记录无效');return value;}
 return {load,save(value){const record={version:'kalshi-api-v1',accountHash,owner:value.owner.toLowerCase(),clientId:value.clientId,terminal:value.terminal,status:String(value.status||''),at:value.at,quote:{...value.quote},orderId:value.orderId||null,filled:value.filled||null,spent:value.spent||null,message:String(value.message||'')};check(/^0x[a-f0-9]{40}$/.test(record.owner)&&uuid.test(record.clientId),'Kalshi 订单记录无效');const safe=JSON.stringify(record);check(!/PRIVATE KEY|KALSHI-ACCESS|signature|passphrase|keyId/.test(safe),'订单记录包含认证数据');storage.setItem(key,safe);return load();}};
}
export function assertKalshiClear(storage,owner){if(!storage)throw Error('浏览器订单存储不可用');let count=0;for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(prefix))continue;if(++count>100)throw Error('请先核对历史 Kalshi 订单');const r=kalshiJournal(storage,key.slice(prefix.length)).load();if(r?.terminal===false&&r.owner===owner.toLowerCase())throw Error('有 Kalshi 原订单待核对，不能重复交易');}}
