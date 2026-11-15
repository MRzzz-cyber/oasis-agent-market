import {RECEIVE_NETWORKS,verifiedReceiveDetails} from './deposit-address.js?v=mainnet-guide-v14-20261116';
const $=id=>document.getElementById(id);
export function initDeposit({getWallet,openWalletChooser,onRefresh}){
 const dialog=$('deposit-dialog'),network=$('deposit-network'),asset=$('deposit-asset');let generation=0,recipient=null;
 for(const chain of RECEIVE_NETWORKS){const option=document.createElement('option');option.value=chain.id;option.textContent=chain.name;network.append(option);}
 function clear(){recipient=null;$('deposit-qr').hidden=true;$('deposit-address').textContent='—';$('deposit-copy').disabled=true;$('deposit-qr-status').hidden=false;$('deposit-contract').textContent='';}
 async function render(){
  const attempt=++generation;clear();const wallet=getWallet(),chain=RECEIVE_NETWORKS.find(n=>n.id===Number(network.value));
  $('deposit-native-option').textContent=chain?.symbol||'原生币';$('deposit-selected-network').textContent=(chain?.name||'')+' Mainnet';$('deposit-wallet-name').textContent=wallet?.name?.replace(' · Privy','')||'尚未选择钱包';$('deposit-connect').hidden=Boolean(wallet);$('deposit-verify').hidden=!wallet;
  $('deposit-qr-status').textContent=wallet?'正在核对收款地址…':'创建或连接钱包后显示收款码';$('deposit-status').textContent='';
  if(!wallet)return;
  try{const details=await verifiedReceiveDetails(wallet,network.value,asset.value);if(attempt!==generation||getWallet()!==wallet||!dialog.open)return;
   $('deposit-address').textContent=details.address;$('deposit-contract').textContent=details.contract?'原生 USDC · 合约 '+details.contract:'网络原生币 · '+details.symbol;
   const {drawReceiveQr}=await import('./vendor/privy/deposit-qr.js');if(attempt!==generation||getWallet()!==wallet||!dialog.open)return;
   const canvas=document.createElement('canvas');await drawReceiveQr(canvas,details.qr);if(attempt!==generation||getWallet()!==wallet||!dialog.open)return;const target=$('deposit-qr');target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);
   recipient=details;$('deposit-copy').disabled=false;$('deposit-qr-status').hidden=true;$('deposit-qr').hidden=false;$('deposit-status').textContent='从其他钱包或交易所转入 '+details.symbol+'，转出网络请选择 '+details.network+'。';
  }catch(e){if(attempt!==generation)return;clear();$('deposit-qr-status').textContent=e.message||'收款码暂不可用，请重新核对';}
 }
 async function open(){network.value='1';asset.value='USDC';dialog.showModal();await render();const wallet=getWallet();if(!wallet)return;const attempt=generation;try{const chain=await wallet.provider.request({method:'eth_chainId'});if(attempt!==generation||!dialog.open||getWallet()!==wallet)return;if(RECEIVE_NETWORKS.some(n=>n.id===Number(BigInt(chain)))){network.value=String(Number(BigInt(chain)));render();}}catch{}}
 function close(){generation++;clear();dialog.close();}
 $('deposit-close').onclick=close;dialog.addEventListener('cancel',()=>{generation++;clear();});
 network.onchange=render;asset.onchange=render;$('deposit-verify').onclick=render;
 $('deposit-connect').onclick=()=>{close();openWalletChooser();};
 $('deposit-copy').onclick=async()=>{const current=recipient;if(!current)return;try{const fresh=await verifiedReceiveDetails(getWallet(),network.value,asset.value);if(recipient!==current||fresh.address.toLowerCase()!==current.address.toLowerCase()||fresh.chainId!==current.chainId)return;await navigator.clipboard.writeText(fresh.address);$('deposit-status').textContent='已复制收款地址 · '+fresh.network+' · '+fresh.symbol;}catch{clear();$('deposit-qr-status').textContent='账户或网络已变化，请重新核对。';}};
 $('deposit-done').onclick=()=>{close();onRefresh();};
 return {open,invalidate(){generation++;clear();if(dialog.open)render();}};
}
