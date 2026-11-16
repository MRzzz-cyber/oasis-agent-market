export const MAINNET_INFO='https://api.hyperliquid.xyz/info';
// Circle-issued USDC contracts, verified against Circle's official mainnet registry.
export const USDC_CONTRACTS={1:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',42161:'0xaf88d065e77c8cc2239327c5edb3a432268e5831',8453:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',10:'0x0b2c639c533813f4aa9d7837caf62653d097ff85',999:'0xb88339cb7199b77e23db6e890353e22632ba630f'};
export const MAINNET_CHAINS={1:{name:'Ethereum',symbol:'ETH'},42161:{name:'Arbitrum',symbol:'ETH'},8453:{name:'Base',symbol:'ETH'},10:{name:'Optimism',symbol:'ETH'},999:{name:'HyperEVM',symbol:'HYPE'}};
export function decimal(value){if(typeof value!=='string'||!/^\d{1,30}(?:\.\d{1,30})?$/.test(value))throw Error('资产数据格式无效');return value;}
export function subtractDecimal(total,held){decimal(total);decimal(held);const a=total.split('.'),b=held.split('.'),scale=Math.max(a[1]?.length||0,b[1]?.length||0),units=p=>BigInt(p[0]+(p[1]||'').padEnd(scale,'0'));const free=units(a)-units(b);if(free<0n)throw Error('资产余额不一致');const text=free.toString().padStart(scale+1,'0');return scale?(text.slice(0,-scale)+'.'+text.slice(-scale)).replace(/\.?0+$/,'')||'0':text;}
export function displayAmount(value,precision=8){decimal(value);const [whole,fraction='']=value.split('.');const head=BigInt(whole).toLocaleString('en-US'),tail=fraction.slice(0,precision).replace(/0+$/,'');if(BigInt(whole)===0n&&!tail&&/[1-9]/.test(fraction))return '<0.'+'0'.repeat(precision-1)+'1';return head+(tail?'.'+tail:'');}
export function parseSpot(data){
 if(!data||!Array.isArray(data.balances))throw Error('现货账户数据暂不可用');
 const seen=new Set();const assets=data.balances.map(row=>{if(typeof row.coin!=='string'||!row.coin||!Number.isInteger(row.token)||seen.has(row.token))throw Error('现货资产数据无效');seen.add(row.token);return {coin:row.coin,token:row.token,total:decimal(row.total),available:subtractDecimal(row.total,row.hold)};});
 const usdc=assets.find(a=>a.coin==='USDC'&&a.token===0);return {available:usdc?.available||'0',assets:assets.filter(a=>/[1-9]/.test(a.total)).sort((a,b)=>a.coin==='USDC'?-1:b.coin==='USDC'?1:a.coin.localeCompare(b.coin))};
}
export async function readMainnetAccount(address,fetchImpl=fetch){
 if(!/^0x[0-9a-f]{40}$/i.test(address))throw Error('钱包地址无效');
 const request=async type=>{const r=await fetchImpl(MAINNET_INFO,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,user:address}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('正式网账户暂不可用');return r.json();};
 const [spot,perp]=await Promise.allSettled([request('spotClearinghouseState'),request('clearinghouseState')]);
 let spotResult=null,perpResult=null;
 if(spot.status==='fulfilled'){try{spotResult=parseSpot(spot.value);}catch{}}
 if(perp.status==='fulfilled'){try{perpResult={withdrawable:decimal(perp.value.withdrawable)};}catch{}}
 return {network:'hyperliquid-mainnet',spot:spotResult,perp:perpResult,observedAt:Date.now()};
}
// A wallet RPC may never settle. This read-only deadline must not block the order UI indefinitely.
export async function readNativeBalance(provider,address,{timeoutMs=6000}={}){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('余额读取超时参数无效');
 let timer;try{return await Promise.race([nativeBalance(provider,address),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('钱包链上余额读取超时，请刷新')),timeoutMs);})]);}finally{clearTimeout(timer);}
}
async function nativeBalance(provider,address){
 const chain=await provider.request({method:'eth_chainId'});if(!/^0x[0-9a-f]+$/i.test(chain))throw Error('无法识别钱包网络');const info=MAINNET_CHAINS[Number(BigInt(chain))];if(!info)return {status:'unsupported'};
 const contract=USDC_CONTRACTS[Number(BigInt(chain))];
 const [nativeResult,usdcResult]=await Promise.allSettled([provider.request({method:'eth_getBalance',params:[address,'latest']}),provider.request({method:'eth_call',params:[{to:contract,data:'0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0')},'latest']})]);
 if(nativeResult.status!=='fulfilled'||!/^0x[0-9a-f]+$/i.test(nativeResult.value))throw Error('链上余额暂不可用');const raw=nativeResult.value;
 let usdc=null;if(usdcResult.status==='fulfilled'&&/^0x[0-9a-f]{64}$/i.test(usdcResult.value)){const units=BigInt(usdcResult.value).toString().padStart(7,'0');usdc=units.slice(0,-6)+'.'+units.slice(-6);}
 const [after,accounts]=await Promise.all([provider.request({method:'eth_chainId'}),provider.request({method:'eth_accounts'})]);
 if(BigInt(after)!==BigInt(chain)||accounts?.[0]?.toLowerCase()!==address.toLowerCase())throw Error('钱包账户或网络已变化');
 const text=BigInt(raw).toString().padStart(19,'0'),amount=text.slice(0,-18)+'.'+text.slice(-18);
 return {status:'ready',chain:info.name,symbol:info.symbol,amount,usdc};
}
