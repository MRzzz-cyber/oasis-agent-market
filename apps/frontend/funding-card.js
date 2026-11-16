import {verifiedReceiveDetails} from './deposit-address.js';
import {decimal} from './arbitrum-swap-core.js';
const el=(tag,value,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(value==null?{}:{textContent:value})});
export function walletFundingCard({wallet,getWallet,asset='USDC',requiredAtomic=null,balanceAtomic,refresh}){
 if(!['USDC','native'].includes(asset)||!wallet)throw Error('充值目标无效');const native=asset==='native',symbol=native?'ETH':'USDC',places=native?18:6;
 const root=el('section',null,'wallet-funding'),css=el('link');css.rel='stylesheet';css.href='/funding-card.css?v=prediction-v1';root.append(css);root.append(el('strong',native?'当前钱包需要网络费 ETH':'当前钱包 USDC 余额不足'));
 const known=requiredAtomic!=null,difference=known?BigInt(requiredAtomic)-BigInt(balanceAtomic):null;
 root.append(el('p',native?'Arbitrum 交易需要少量 ETH 支付网络费。':'当前钱包有 '+decimal(balanceAtomic,places)+' '+symbol+'。'+(wallet.kind==='embedded'?'如果资金在 Rabby，请切换上方钱包。':'')));
 if(known)root.append(el('p','本次至少需 '+decimal(requiredAtomic,places)+' '+symbol+' · 还差 '+decimal(difference>0n?difference:0n,places)+' '+symbol));else root.append(el('p','所需网络费尚未估算，补充后请重新核对。'));
 root.append(el('small','转入网络：Arbitrum One · 仅为当前钱包充值'));
 const address=el('code','正在核对收款地址…'),status=el('p',''),canvas=el('canvas');canvas.hidden=true;const actions=el('div'),copy=el('button','复制收款地址'),qr=el('button','显示收款码'),update=el('button','我已充值，刷新余额');for(const b of [copy,qr,update])b.type='button';copy.disabled=qr.disabled=true;actions.append(copy,qr,update);root.append(address,canvas,actions,status);status.setAttribute('role','status');
 let recipient=null;const current=()=>root.isConnected&&getWallet()===wallet;
 async function verify(){const details=await verifiedReceiveDetails(wallet,42161,asset);if(!current())throw Error('钱包已变化，请重新核对');return details;}
 copy.onclick=async()=>{try{const fresh=await verify();if(!recipient||fresh.address.toLowerCase()!==recipient.address.toLowerCase())throw Error('收款地址已变化');await navigator.clipboard.writeText(fresh.address);status.textContent='已复制 · Arbitrum One · '+symbol;}catch(e){status.textContent=e.message;copy.disabled=qr.disabled=true;}};
 qr.onclick=async()=>{qr.disabled=true;try{const fresh=await verify(),{drawReceiveQr}=await import('./vendor/privy/deposit-qr.js');if(!current())return;await drawReceiveQr(canvas,fresh.qr);if(!current())return;canvas.hidden=false;status.textContent='收款码为当前钱包地址。转出时请选择 Arbitrum One 和 '+symbol+'。';}catch(e){status.textContent=e.message;}finally{qr.disabled=!current();}};
 update.onclick=()=>{if(current())refresh();};
 queueMicrotask(async()=>{try{const fresh=await verify();recipient=fresh;address.textContent=fresh.address;copy.disabled=qr.disabled=false;status.textContent='充值到账后刷新余额；不会自动买入。';}catch(e){if(current()){address.textContent='地址待核对';status.textContent=e.message;}}});return root;
}
