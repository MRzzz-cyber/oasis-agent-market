// Pinned Uniswap V3 Arbitrum deployments and native Circle USDC. No arbitrary routes or recipients.
export const CHAIN='0xa4b1',USDC='0xaf88d065e77c8cc2239327c5edb3a432268e5831',WETH='0x82af49447d8a07e3bd95bd0d56f35241523fbab1',ROUTER='0xe592427a0aece92de3edee1f18e0157c05861564',QUOTER='0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6',FACTORY='0x1f98431c8ad98523631ae4a59f267346ea31f984';
export const FEES=[500,3000],TTL=90000;
export const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const WITHDRAWAL='0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65';
export function addr(x){if(typeof x!=='string'||!/^0x[0-9a-f]{40}$/i.test(x)||/^0x0{40}$/i.test(x))throw Error('钱包或合约地址无效');return x.toLowerCase();}
export function uint(x){if(typeof x!=='string'||!/^\d{1,78}$/.test(x)||BigInt(x)>=2n**256n)throw Error('链上整数无效');return BigInt(x);}
export function units(x){if(typeof x!=='string'||!/^\d{1,6}(?:\.\d{1,2})?$/.test(x))throw Error('买入金额最多两位小数');const [i,f='']=x.split('.'),v=BigInt(i)*1000000n+BigInt(f.padEnd(6,'0'));if(v<1000000n||v>100000000000n)throw Error('买入金额需在 1 至 100000 USDC 之间');return v;}
export function decimal(v,places){v=BigInt(v);if(v<0n)throw Error('金额无效');const s=v.toString().padStart(places+1,'0');return places?(s.slice(0,-places)+'.'+s.slice(-places)).replace(/\.?0+$/,'')||'0':s;}
export const word=x=>{const v=BigInt(x);if(v<0n||v>=2n**256n)throw Error('ABI 整数无效');return v.toString(16).padStart(64,'0');};
export const aw=x=>addr(x).slice(2).padStart(64,'0');
export function resultUint(x){if(typeof x!=='string'||!/^0x[0-9a-f]{64}$/i.test(x))throw Error('链上响应无效');return BigInt(x);}
export const balanceData=user=>'0x70a08231'+aw(user);
export const allowanceData=user=>'0xdd62ed3e'+aw(user)+aw(ROUTER);
export const poolData=fee=>{if(!FEES.includes(fee))throw Error('费率无效');return '0x1698ee82'+aw(USDC)+aw(WETH)+word(fee);};
export const quoteData=(amount,fee)=>{uint(amount);if(!FEES.includes(fee))throw Error('费率无效');return '0xf7729d43'+aw(USDC)+aw(WETH)+word(fee)+word(amount)+word(0);};
export function validateQuote(q,now=Date.now(),expired=false){
 if(!q||q.chain!==CHAIN||q.tokenIn!==USDC||q.tokenOut!==WETH||q.router!==ROUTER||addr(q.user)!==q.user||addr(q.pool)!==q.pool||!FEES.includes(q.fee)||units(q.budget)!==uint(q.amountIn)||uint(q.amountOut)<=0n||uint(q.minimumOut)<=0n||uint(q.minimumOut)!==uint(q.amountOut)*9950n/10000n||!Number.isSafeInteger(q.createdAt)||q.expiresAt!==q.createdAt+TTL||!Number.isSafeInteger(q.blockTime)||q.deadline!==q.blockTime+180)throw Error('兑换预览参数无效');
 if(!expired&&(!Number.isSafeInteger(now)||now<q.createdAt-5000||now>=q.expiresAt))throw Error('兑换报价已过期，请刷新并重新确认');return q;
}
export function approvalTx(q){validateQuote(q,0,true);return {from:q.user,to:USDC,chainId:CHAIN,value:'0x0',data:'0x095ea7b3'+aw(ROUTER)+word(q.amountIn)};}
export function swapTx(q){
 validateQuote(q,0,true);
 const swap='414bf389'+aw(USDC)+aw(WETH)+word(q.fee)+aw(ROUTER)+word(q.deadline)+word(q.amountIn)+word(q.minimumOut)+word(0);
 const unwrap='49404b7c'+word(q.minimumOut)+aw(q.user);
 const bytes=s=>word(s.length/2)+s.padEnd(Math.ceil(s.length/64)*64,'0'),a=bytes(swap),b=bytes(unwrap);
 return {from:q.user,to:ROUTER,chainId:CHAIN,value:'0x0',data:'0xac9650d8'+word(32)+word(2)+word(64)+word(64+a.length/2)+a+b};
}
export function checkTransaction(tx,q,kind,now=Date.now()){validateQuote(q,now);const expected=kind==='approval'?approvalTx(q):kind==='swap'?swapTx(q):null;if(!expected||JSON.stringify(tx)!==JSON.stringify(expected))throw Error('钱包交易与已确认的兑换内容不匹配');return expected;}
export function swapJournal(storage,user){
 user=addr(user);const key='oasis-arbitrum-swap-v1:'+user;
 function valid(r){if(!r||!['approval','swap'].includes(r.kind)||!['pending','unknown','cancelled','reverted','approved','filled'].includes(r.status)||typeof r.terminal!=='boolean'||typeof r.id!=='string'||!/^0x[0-9a-f]{32}$/.test(r.id)||r.quote?.user!==user)throw Error('兑换记录损坏，请先核对原交易');validateQuote(r.quote,0,true);if(r.hash&&!/^0x[0-9a-f]{64}$/i.test(r.hash))throw Error('原交易哈希无效');return r;}
 function list(){const raw=storage.getItem(key);if(raw===null)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('兑换记录损坏');return rows.map(valid);}
 return {list,load(){const rows=list();return rows.find(r=>!r.terminal)||rows.at(-1)||null;},save(r){valid(r);const safe={id:r.id,kind:r.kind,status:r.status,terminal:r.terminal,quote:r.quote,hash:r.hash,message:r.message,received:r.received},rows=list(),index=rows.findIndex(x=>x.id===r.id);if(index<0){if(rows.some(x=>!x.terminal))throw Error('有原兑换交易待核对，不能再次提交');rows.push(safe);}else{const old=rows[index];if(old.kind!==r.kind||JSON.stringify(old.quote)!==JSON.stringify(r.quote)||old.hash&&old.hash!==r.hash)throw Error('原兑换交易不可更改');rows[index]=safe;}storage.setItem(key,JSON.stringify(rows));return safe;}};
}
