import {address,canonical,PUSD,display} from './polymarket-purchase-core.js';
export {display};
export const VERSION='polymarket-bridge-v1',TTL=60000;
export const SOURCES=Object.freeze({
 '42161':Object.freeze({name:'Arbitrum',chain:'0xa4b1',token:'0xaf88d065e77c8cc2239327c5edb3a432268e5831',rpc:'https://arb1.arbitrum.io/rpc',explorer:'https://arbiscan.io/tx/'}),
 '8453':Object.freeze({name:'Base',chain:'0x2105',token:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',rpc:'https://mainnet.base.org',explorer:'https://basescan.org/tx/'}),
 '10':Object.freeze({name:'Optimism',chain:'0xa',token:'0x0b2c639c533813f4aa9d7837caF62653d097ff85'.toLowerCase(),rpc:'https://mainnet.optimism.io',explorer:'https://optimistic.etherscan.io/tx/'})
});
export const POLYGON_RPC='https://polygon-bor-rpc.publicnode.com';
export const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v);
export const word=v=>BigInt(v).toString(16).padStart(64,'0');
export const topic=a=>'0x'+address(a).slice(2).padStart(64,'0');
export function amountAtomic(value){if(typeof value!=='string'||!/^\d{1,4}(?:\.\d{1,2})?$/.test(value))throw Error('充值金额最多两位小数');const [i,f='']=value.split('.'),n=BigInt(i)*1000000n+BigInt(f.padEnd(6,'0'));if(n<2000000n||n>1000000000n)throw Error('单次充值金额为 2–1000 USDC');return n.toString();}
const integer=v=>typeof v==='string'&&/^\d{1,30}$/.test(v);
export function checkBridgeQuote(q,now=Date.now(),expired=false){
 if(!q||q.version!==VERSION||!Object.hasOwn(SOURCES,q.sourceChain)||address(q.owner)!==q.owner||address(q.maker)!==q.maker||address(q.depositAddress)!==q.depositAddress||q.depositAddress===q.owner||q.depositAddress===q.maker||q.fromToken!==SOURCES[q.sourceChain].token||q.toToken!==PUSD||q.toChain!=='137'||amountAtomic(q.amount)!==q.amountAtomic||!integer(q.estimateAtomic)||BigInt(q.estimateAtomic)<=0n||BigInt(q.estimateAtomic)>BigInt(q.amountAtomic)*2n||!hash(q.quoteId)||!Number.isSafeInteger(q.createdAt)||q.expiresAt!==q.createdAt+TTL||!Number.isSafeInteger(q.estMs)||q.estMs<0||q.estMs>86400000||!/^\d+(?:\.\d{1,18})?$/.test(q.feeUsd)||Number(q.feeUsd)>Number(q.amount)||!Array.isArray(q.seen)||q.seen.length>300||q.seen.some(s=>typeof s!=='string'||s.length>250))throw Error('跨链预览参数无效');
 if(!expired&&(!Number.isSafeInteger(now)||now<q.createdAt-5000||now>=q.expiresAt))throw Error('跨链报价已过期，请重新预览');return q;
}
export function bridgeTx(q){checkBridgeQuote(q,0,true);return {from:q.owner,to:q.fromToken,chainId:SOURCES[q.sourceChain].chain,value:'0x0',data:'0xa9059cbb'+q.depositAddress.slice(2).padStart(64,'0')+word(q.amountAtomic)};}
export function checkBridgeTx(tx,q){checkBridgeQuote(q);const expected=bridgeTx(q);if(canonical(tx)!==canonical(expected))throw Error('跨链转账与已确认金额、账户或地址不匹配');return expected;}
export function bridgeRead(tx,q){if(!q)return false;const expected=bridgeTx(q);delete expected.chainId;return canonical(tx)===canonical(expected);}
const statuses=['submitting','pending','unknown','source-confirmed','needs-support','completed','reverted','cancelled'];
export function bridgeJournal(storage,owner){owner=address(owner);const key='oasis-polymarket-bridge-v1:'+owner;
 function valid(r){if(!r||r.owner!==owner||typeof r.id!=='string'||r.id.length>100||typeof r.terminal!=='boolean'||!statuses.includes(r.status)||r.quote?.owner!==owner)throw Error('跨链记录损坏，请核对原请求');checkBridgeQuote(r.quote,0,true);if(r.hash&&!hash(r.hash)||r.destinationHash&&!hash(r.destinationHash)||r.receivedAtomic!=null&&!integer(r.receivedAtomic))throw Error('跨链回执无效');if(r.terminal!==['completed','reverted','cancelled'].includes(r.status))throw Error('跨链记录状态无效');return r;}
 function list(){const raw=storage.getItem(key);if(raw===null)return [];const rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>500)throw Error('跨链记录损坏');return rows.map(valid);}
 return {list,load(){const rows=list();return rows.find(r=>!r.terminal)||rows.at(-1)||null;},save(r){valid(r);const rows=list(),index=rows.findIndex(x=>x.id===r.id),safe={owner,id:r.id,quote:r.quote,status:r.status,terminal:r.terminal,hash:r.hash,destinationHash:r.destinationHash,receivedAtomic:r.receivedAtomic,message:String(r.message||'').slice(0,400)};
 if(index<0){if(rows.some(x=>!x.terminal)||rows.some(x=>x.quote.quoteId===r.quote.quoteId))throw Error('原跨链请求不可再次提交');rows.push(safe);}else{const old=rows[index];if(canonical(old.quote)!==canonical(r.quote)||old.hash&&old.hash!==r.hash||old.terminal&&canonical(old)!==canonical(safe))throw Error('原跨链请求不可修改');rows[index]=safe;}storage.setItem(key,JSON.stringify(rows.slice(-500)));return safe;}};
}
export function assertCrosschainClear(storage,owner){if(bridgeJournal(storage,owner).load()?.terminal===false)throw Error('有跨链资金待核对，请先核对原跨链，不能重复转账或买入');}
export const bridgeFingerprint=t=>[t.fromChainId,String(t.fromTokenAddress).toLowerCase(),t.fromAmountBaseUnit,t.createdTimeMs??'',t.txHash??''].join(':');
export function transferAmount(receipt,token,from,to){if(!Array.isArray(receipt?.logs))return 0n;return receipt.logs.filter(l=>!l.removed&&l.address?.toLowerCase()===token&&l.topics?.length===3&&l.topics[0]?.toLowerCase()===TRANSFER&&(!from||l.topics[1]?.toLowerCase()===topic(from))&&l.topics[2]?.toLowerCase()===topic(to)&&/^0x[0-9a-f]{64}$/i.test(l.data)).reduce((n,l)=>n+BigInt(l.data),0n);}
