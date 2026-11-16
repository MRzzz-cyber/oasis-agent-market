import {atomic,display,SCALE} from './prediction-core.js';
export {atomic,display};
export const POLYGON='0x89',PUSD='0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb',FACTORY='0x00000000000fb5c9adea0298d729a0cb3823cc07',BEACON='0x7a18edfe055488a3128f01f563e5b479d92ffc3a';
export const EXCHANGES={standard:'0xe111180000d2663c0091e4f400237545b87b996b',negative:'0xe2222d279d744050d28e00520010520000310f59',v2:'0xe3333700ca9d93003f00f0f71f8515005f6c00aa'},NEG_ADAPTER='0xd91e80cf2e7be2e162c6513ced06f1dd0da35296';
export const ZERO32='0x'+'0'.repeat(64);
export const address=v=>{if(!/^0x[0-9a-f]{40}$/i.test(v||''))throw Error('钱包地址无效');return v.toLowerCase();};
export const uint=v=>{if(!/^\d{1,78}$/.test(String(v)))throw Error('数量格式无效');return BigInt(v);};
export const canonical=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
const exactKeys=(obj,keys)=>obj&&Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const fields=s=>s.split(',').map(v=>{const [name,type]=v.split(':');return {name,type};});
const schemas={ClobAuth:fields('address:address,timestamp:string,nonce:uint256,message:string'),Order:fields('salt:uint256,maker:address,signer:address,tokenId:uint256,makerAmount:uint256,takerAmount:uint256,side:uint8,signatureType:uint8,timestamp:uint256,metadata:bytes32,builder:bytes32'),TypedDataSign:fields('contents:Order,name:string,version:string,chainId:uint256,verifyingContract:address,salt:bytes32'),Batch:fields('wallet:address,nonce:uint256,deadline:uint256,calls:Call[]'),Call:fields('target:address,value:uint256,data:bytes')};
function checkSchema(t,names){assert(exactKeys(t,['domain','types','primaryType','message']),'签名结构不匹配');const domainTypes=Object.keys(t.domain).map(name=>({name,type:name==='chainId'?'uint256':name==='verifyingContract'?'address':name==='salt'?'bytes32':'string'}));assert(Object.keys(t.types).every(k=>names.includes(k)||k==='EIP712Domain')&&names.every(k=>canonical(t.types[k])===canonical(schemas[k])),'签名字段不匹配');if(t.types.EIP712Domain){const actual=t.types.EIP712Domain;assert(actual.length===domainTypes.length&&domainTypes.every(e=>actual.some(a=>a.name===e.name&&a.type===e.type)),'签名域字段不匹配');}}
export function checkAuth(t,owner,now=Date.now()){
 checkSchema(t,['ClobAuth']);assert(t.primaryType==='ClobAuth'&&exactKeys(t.domain,['name','version','chainId'])&&t.domain.name==='ClobAuthDomain'&&t.domain.version==='1'&&Number(t.domain.chainId)===137,'只允许 Polygon 平台登录签名');
 const m=t.message;assert(exactKeys(m,['address','timestamp','nonce','message'])&&address(m.address)===address(owner)&&m.message==='This message attests that I control the given wallet'&&uint(m.nonce)===0n&&/^\d{10}$/.test(String(m.timestamp))&&Math.abs(now-Number(m.timestamp)*1000)<300000,'登录签名账户或时间无效');return true;
}
export function purchasePreview({market,book,feeInfo,budget,outcome,now=Date.now()}){
 const cap=atomic(String(budget));assert(cap>=SCALE&&cap<=1000n*SCALE&&cap%10000n===0n,'买入金额为 1–1000 pUSD，最多两位小数');
 assert(['yes','no'].includes(outcome)&&market?.state?.acceptingOrders===true&&market.state.active!==false&&!market.state.closed&&!market.state.archived&&['v1','v2'].includes(market.version),'当前盘口不接受买入');
 const assetId=market.version==='v2'?market.outcomes?.[outcome]?.positionId:market.outcomes?.[outcome]?.tokenId;
 assert(assetId&&String(book.assetId)===String(assetId)&&market.conditionId&&book.conditionId?.toLowerCase()===market.conditionId.toLowerCase(),'市场与交易资产不匹配');
 assert(Number.isSafeInteger(Number(book.timestamp))&&Number(book.timestamp)<=now+5000&&Number(book.timestamp)>=now-30000,'盘口时间过期，请刷新');
 const rate=atomic(String(feeInfo?.rate)),exponent=feeInfo?.exponent;assert(rate<=SCALE&&[0,1,2].includes(exponent),'平台费率未核实，暂停买入');
 const tick=atomic(String(book.tickSize));assert([10000n,1000n,100n,10n].includes(tick),'价格精度暂不支持');
 const levels=(book.asks||[]).map(x=>({p:atomic(String(x.price)),s:atomic(String(x.size))})).sort((a,b)=>a.p<b.p?-1:a.p>b.p?1:0);
 assert(levels.length&&levels.length<=2000&&levels.every(x=>x.p>0n&&x.p<SCALE&&x.s>0n),'卖盘价格或深度无效');
 // For exponents >=1, the fee is at most notional*rate. For exponent 0,
 // fee/share=rate, so a separate fixed worst-case below is required.
 assert(exponent>=1||rate===0n,'该盘口费率模型暂不支持');
 const net=cap*SCALE/(SCALE+rate)/10000n*10000n;let remaining=net,worst=0n;
 for(const l of levels){const cost=(l.s*l.p+SCALE-1n)/SCALE;worst=l.p;if(cost>=remaining){remaining=0n;break;}remaining-=cost;}
 assert(remaining===0n,'卖盘深度不足，请降低金额');
 let limit=((worst*1005n+999n)/1000n+tick-1n)/tick*tick;if(limit>=SCALE)limit=SCALE-tick;
 const minShares=net*SCALE/limit/10000n*10000n,available=levels.filter(l=>l.p<=limit).reduce((a,l)=>a+l.s,0n);
 assert(minShares>=atomic(String(book.minOrderSize))&&available>=minShares&&minShares>0n,'当前金额或盘口深度未达到最小订单');
 const negRisk=book.negRisk===true,exchange=market.version==='v2'?EXCHANGES.v2:negRisk?EXCHANGES.negative:EXCHANGES.standard;
 return {marketId:String(market.id),question:market.question,outcome,assetId:String(assetId),conditionId:market.conditionId.toLowerCase(),protocol:market.version,negRisk,exchange,chainId:137,collateral:PUSD,budgetAtomic:cap.toString(),netAtomic:net.toString(),feeReserveAtomic:(cap-net).toString(),limitAtomic:limit.toString(),minimumSharesAtomic:minShares.toString(),feeRate:String(feeInfo.rate),feeExponent:exponent,tickSize:String(book.tickSize),createdAt:now,expiresAt:now+30000,bookTime:Number(book.timestamp),orderType:'FOK'};
}
export function checkQuote(q,now=Date.now()){assert(q&&Object.keys(q).every(k=>['marketId','question','outcome','assetId','conditionId','protocol','negRisk','exchange','chainId','collateral','budgetAtomic','netAtomic','feeReserveAtomic','limitAtomic','minimumSharesAtomic','feeRate','feeExponent','tickSize','createdAt','expiresAt','bookTime','orderType','balanceAtomic','approvalNeeded','maker'].includes(k))&&/^[a-zA-Z0-9_-]{1,180}$/.test(q.marketId)&&['yes','no'].includes(q.outcome)&&/^(?:\d{1,78}|0x[0-9a-f]{64})$/i.test(q.assetId)&&/^0x(?:[0-9a-f]{62}|[0-9a-f]{64})$/.test(q.conditionId),'报价字段无效');assert(q?.chainId===137&&q.collateral===PUSD&&q.orderType==='FOK'&&Number.isSafeInteger(q.createdAt)&&q.expiresAt===q.createdAt+30000&&now>=q.createdAt-5000&&now<q.expiresAt&&q.exchange===(q.protocol==='v2'?EXCHANGES.v2:q.protocol==='v1'?(q.negRisk?EXCHANGES.negative:EXCHANGES.standard):null),'报价已过期或交易路线无效');assert(uint(q.budgetAtomic)>=SCALE&&uint(q.budgetAtomic)<=1000n*SCALE&&uint(q.netAtomic)>0n&&uint(q.netAtomic)+uint(q.feeReserveAtomic)===uint(q.budgetAtomic)&&uint(q.minimumSharesAtomic)>0n&&uint(q.limitAtomic)>0n&&uint(q.limitAtomic)<SCALE,'报价金额无效');assert([0,1,2].includes(q.feeExponent)&&atomic(q.feeRate)<=SCALE&&(q.feeExponent>=1||atomic(q.feeRate)===0n)&&uint(q.netAtomic)===uint(q.budgetAtomic)*SCALE/(SCALE+atomic(q.feeRate))/10000n*10000n&&uint(q.minimumSharesAtomic)===uint(q.netAtomic)*SCALE/uint(q.limitAtomic)/10000n*10000n,'费率或份额模型无效');if(q.maker)address(q.maker);return true;}
export function checkOrder(t,q,identity,now=Date.now()){
 checkQuote(q,now);const deposit=identity.walletType===3;assert(q.maker&&address(q.maker)===address(identity.wallet),'交易账户与报价不匹配');assert(deposit||identity.walletType===0,'当前仅支持平台 Deposit Wallet 或已获准交易的 EOA');checkSchema(t,deposit?['Order','TypedDataSign']:['Order']);
 assert(t.primaryType===(deposit?'TypedDataSign':'Order')&&exactKeys(t.domain,['name','version','chainId','verifyingContract'])&&t.domain.name==='Polymarket CTF Exchange'&&t.domain.version===(q.protocol==='v2'?'3':'2')&&Number(t.domain.chainId)===137&&address(t.domain.verifyingContract)===q.exchange,'订单签名网络或合约不匹配');
 if(deposit){const w=t.message;assert(exactKeys(w,['contents','name','version','chainId','verifyingContract','salt'])&&w.name==='DepositWallet'&&w.version==='1'&&Number(w.chainId)===137&&address(w.verifyingContract)===address(identity.wallet)&&w.salt===ZERO32,'平台钱包签名不匹配');}
 const m=deposit?t.message.contents:t.message;assert(exactKeys(m,schemas.Order.map(f=>f.name))&&address(m.maker)===address(identity.wallet)&&address(m.signer)===address(deposit?identity.wallet:identity.signer)&&String(m.tokenId)===q.assetId&&Number(m.side)===0&&Number(m.signatureType)===(deposit?3:0)&&m.metadata===ZERO32&&m.builder===ZERO32,'订单账户、资产或方向不匹配');
 assert(uint(m.salt)<=BigInt(Number.MAX_SAFE_INTEGER)&&Math.abs(now-Number(m.timestamp))<30000,'订单盐值或时间无效');
 const spend=uint(m.makerAmount),shares=uint(m.takerAmount),reserve=(spend*atomic(q.feeRate)+SCALE-1n)/SCALE;
 assert(spend>0n&&spend<=uint(q.netAtomic)&&spend+reserve<=uint(q.budgetAtomic)&&shares>=uint(q.minimumSharesAtomic)&&spend*SCALE<shares*(uint(q.limitAtomic)+10n),'订单超过支付上限、低于份额下限或超出价格上限');return m;
}
export function approvalData(spender,amount){return '0x095ea7b3'+address(spender).slice(2).padStart(64,'0')+uint(amount).toString(16).padStart(64,'0');}
export function approvalCalls(q){checkQuote(q,q.createdAt);return [q.exchange,...(q.negRisk&&q.protocol==='v1'?[NEG_ADAPTER]:[])].map(s=>({target:PUSD,value:'0',data:approvalData(s,q.budgetAtomic)}));}
export function checkBatch(t,q,maker,now=Date.now()){
 checkQuote(q,now);checkSchema(t,['Batch','Call']);const m=t.message;assert(t.primaryType==='Batch'&&exactKeys(t.domain,['chainId','name','verifyingContract','version'])&&Number(t.domain.chainId)===137&&t.domain.name==='DepositWallet'&&t.domain.version==='1'&&address(t.domain.verifyingContract)===address(maker),'授权签名合约不匹配');
 assert(exactKeys(m,['calls','deadline','nonce','wallet'])&&address(m.wallet)===address(maker)&&uint(m.nonce)>=0n&&Number(m.deadline)>Math.floor(now/1000)&&Number(m.deadline)<=Math.floor(now/1000)+610,'授权时间或钱包不匹配');
 const expected=approvalCalls(q);assert(Array.isArray(m.calls)&&m.calls.length===expected.length&&m.calls.every((c,i)=>exactKeys(c,['target','value','data'])&&address(c.target)===expected[i].target&&uint(c.value)===0n&&c.data.toLowerCase()===expected[i].data),'只允许本次金额向固定平台合约授权');return true;
}
export function predictionJournal(storage,owner){
 owner=address(owner);const key='oasis-polymarket-order-v1:'+owner;
 function validate(r){assert(r&&r.owner===owner&&r.network==='polygon-polymarket'&&/^[a-z0-9-]{1,80}$/.test(r.id)&&['approval','order'].includes(r.kind)&&typeof r.terminal==='boolean'&&Number.isSafeInteger(r.at)&&r.quote&&r.identity?.signer?.toLowerCase()===owner,'预测订单记录损坏，请先核对');checkQuote(r.quote,r.quote.createdAt);address(r.identity.wallet);assert(Object.keys(r.identity).every(k=>['signer','wallet','walletType','signerType'].includes(k)),'账户记录字段无效');if(r.hashes)assert(Array.isArray(r.hashes)&&r.hashes.length<=100&&r.hashes.every(h=>/^0x[0-9a-f]{64}$/i.test(h)),'回执哈希无效');if(r.tradeIds)assert(Array.isArray(r.tradeIds)&&r.tradeIds.length<=100&&r.tradeIds.every(h=>/^[a-z0-9-]{1,128}$/i.test(h)),'成交标识无效');if(r.transactionId)assert(/^[a-z0-9-]{1,128}$/i.test(r.transactionId),'授权标识无效');if(r.signedAmounts)assert(exactKeys(r.signedAmounts,['makerAmount','takerAmount'])&&uint(r.signedAmounts.makerAmount)>0n&&uint(r.signedAmounts.takerAmount)>0n,'签名数量无效');if(r.orderId)assert(/^0x[0-9a-f]{64}$/.test(r.orderId),'原订单标识无效');return r;}
 function list(){const raw=storage.getItem(key);if(raw==null)return [];const rows=JSON.parse(raw);assert(Array.isArray(rows)&&rows.length<=500,'预测订单记录损坏或已满');return rows.map(validate);}
 return {list,load(){const r=list();return r.find(r=>!r.terminal)||r.at(-1)||null;},save(record){
 const allowed=['network','owner','id','kind','terminal','at','quote','identity','status','message','orderId','transactionId','hashes','tradeIds','matchedShares','signedAmounts'];
 const safe=Object.fromEntries(allowed.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));validate(safe);
 const rows=list(),index=rows.findIndex(r=>r.id===safe.id);if(index<0){assert(!rows.some(r=>!r.terminal),'原预测订单尚未核对，禁止重复提交');rows.push(safe);}else{const old=rows[index];assert(['owner','kind','at','quote','identity'].every(k=>canonical(old[k])===canonical(safe[k]))&&(!old.orderId||old.orderId===safe.orderId),'原订单参数不允许更改');rows[index]=safe;}
 storage.setItem(key,JSON.stringify(rows));return safe;}};
}
export function assertPredictionClear(storage,owner){if(predictionJournal(storage,owner).load()?.terminal===false)throw Error('有预测订单待核对，请先核对原订单');}
