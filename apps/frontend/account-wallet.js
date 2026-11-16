import {approvalPacket,address as mainnetAddress,text} from './mainnet-order-core.js';
import {USDC_CONTRACTS} from './mainnet-wallet.js';
import {ARBITRUM,BRIDGE,USDC,fundingPacket,depositTransaction} from './funding-core.js';
let active=null;
export const accountWallet=()=>active;
export function publishAccountWallet(choice){active=choice;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('oasis:account-wallet-ready',{detail:choice}));}
export function clearAccountWallet(){const previous=active;active=null;if(previous&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('oasis:account-wallet-cleared',{detail:previous}));}
export function matchesWalletIdentity(user,subject){return user?.linkedAccounts?.some(a=>a.type==='custom_auth'&&a.customUserId===subject)===true;}
export function guardWalletProvider(raw,{address,subject,isCurrent,getSession,signTypedData}){
 let armedAgent=null,armedFunding=null,armedDeposit=null;
 const reads=new Set(['eth_accounts','eth_requestAccounts','eth_chainId','net_version','eth_getBalance','eth_call','eth_getCode','eth_estimateGas','eth_gasPrice','eth_getTransactionReceipt']);
 function checkedDeposit(tx){if(typeof tx?.data!=='string'||!/^0xa9059cbb[0-9a-f]{128}$/i.test(tx.data))throw Error('入金交易无效');const amount=text(BigInt('0x'+tx.data.slice(-64))*100n),expected=depositTransaction(address,amount);if(JSON.stringify(tx)!==JSON.stringify(expected))throw Error('只允许当前钱包向固定 Arbitrum 桥转入已预览的 USDC');return expected;}
 async function session(){const user=await getSession();if(!isCurrent()||!user?.active||'oasis:google:'+user.id!==subject)throw Error('登录账户已变化，请重新连接账号钱包');}
 return {
  armMainnetAgent(agent){if(!isCurrent())throw Error('会话已失效');armedAgent=mainnetAddress(agent);},
  armMainnetFunding(packet){
   if(!isCurrent())throw Error('会话已失效');const a=packet?.action,kind=a?.type==='withdraw3'?'withdraw':a?.type==='userSetAbstraction'?'standardize':a?.type==='usdClassTransfer'&&typeof a.toPerp==='boolean'?(a.toPerp?'toPerp':'toSpot'):null;
   const expected=fundingPacket(kind,address,a?.amount||'',a?.signatureChainId,packet?.nonce);
   if(JSON.stringify(expected)!==JSON.stringify(packet))throw Error('资金签名必须与本次预览完全一致');armedFunding={packet:JSON.stringify(expected.typed),chain:a.signatureChainId,nonce:packet.nonce};
  },
  armMainnetDeposit(tx){if(!isCurrent())throw Error('会话已失效');armedDeposit={tx:JSON.stringify(checkedDeposit(tx)),until:Date.now()+60000};},
  async request(packet){
   if(!isCurrent())throw Error('账号钱包会话已失效，请重新登录');
   if(packet.method==='wallet_switchEthereumChain'){
    if(JSON.stringify(packet.params)!==JSON.stringify([{chainId:ARBITRUM}]))throw Error('仅允许切换至 Arbitrum One');await session();return raw.request(packet);
   }
   if(packet.method==='eth_sendTransaction'){
    const approved=armedDeposit;armedDeposit=null;
    if(!approved||Date.now()>=approved.until||packet.params?.length!==1||JSON.stringify(checkedDeposit(packet.params[0]))!==approved.tx||await raw.request({method:'eth_chainId'})!==ARBITRUM)throw Error('入金未由本次预览准备或网络已变化');
    await session();return raw.request(packet);
   }
   if(!reads.has(packet.method)&&packet.method!=='eth_signTypedData_v4')throw Error('只允许已预览并确认的交易或资金操作');
   if(packet.method==='eth_accounts'||packet.method==='eth_requestAccounts')return [address];
   if(packet.method==='eth_getBalance'&&(packet.params?.[0]?.toLowerCase()!==address.toLowerCase()||packet.params?.[1]!=='latest'))throw Error('只允许读取当前钱包余额');
   if(packet.method==='eth_call'){const chain=await raw.request({method:'eth_chainId'}),contract=USDC_CONTRACTS[Number(BigInt(chain))],call=packet.params?.[0];if(!contract||packet.params?.length!==2||packet.params[1]!=='latest'||call?.to?.toLowerCase()!==contract||call?.data?.toLowerCase()!=='0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0')||Object.keys(call).some(k=>!['to','data'].includes(k)))throw Error('只允许读取当前钱包的主网 USDC 余额');}
   if(packet.method==='eth_getCode'&&(packet.params?.length!==2||packet.params[0]?.toLowerCase()!==BRIDGE||packet.params[1]!=='latest'||await raw.request({method:'eth_chainId'})!==ARBITRUM))throw Error('只允许核对 Arbitrum 桥合约');
   if(packet.method==='eth_estimateGas'){if(packet.params?.length!==1||await raw.request({method:'eth_chainId'})!==ARBITRUM)throw Error('入金估算网络无效');checkedDeposit(packet.params[0]);}
   if(packet.method==='eth_getTransactionReceipt'&&(packet.params?.length!==1||!/^0x[0-9a-f]{64}$/i.test(packet.params[0])||await raw.request({method:'eth_chainId'})!==ARBITRUM))throw Error('仅核对 Arbitrum 交易回执');
   if(packet.method!=='eth_signTypedData_v4')return raw.request(packet);
   const [signer,data]=packet.params||[];let typed;try{typed=typeof data==='string'?JSON.parse(data):data;}catch{throw Error('签名内容无效');}
   if(typed?.message?.hyperliquidChain==='Mainnet'&&typed.primaryType!=='HyperliquidTransaction:ApproveAgent'){
    const approved=armedFunding;armedFunding=null;
    if(!approved||signer?.toLowerCase()!==address.toLowerCase()||JSON.stringify(typed)!==approved.packet||Date.now()<approved.nonce-5000||Date.now()>=approved.nonce+60000||await raw.request({method:'eth_chainId'})!==approved.chain)throw Error('资金签名未由本次预览准备，或内容、账户、网络已变化');
   }else if(typed?.message?.hyperliquidChain==='Mainnet'){
    const chain=await raw.request({method:'eth_chainId'});let expected;try{expected=approvalPacket(typed.message.agentAddress,chain,typed.message.nonce).typed;}catch{throw Error('主网授权数据无效');}
    if(signer?.toLowerCase()!==address.toLowerCase()||!armedAgent||typed.message.agentAddress?.toLowerCase()!==armedAgent||JSON.stringify(typed)!==JSON.stringify(expected))throw Error('主网会话未由本次订单准备，或签名内容不匹配');armedAgent=null;
   }else if(signer?.toLowerCase()!==address.toLowerCase()||typed?.primaryType!=='HyperliquidTransaction:ApproveAgent'||typed.domain?.name!=='HyperliquidSignTransaction'||typed.message?.hyperliquidChain!=='Testnet'||typed.message?.agentName!=='OasisTest'||!/^0x[0-9a-f]{40}$/i.test(typed.message?.agentAddress||'')||typed.domain?.verifyingContract!=='0x'+'0'.repeat(40))throw Error('只允许用户确认的交易会话授权');
   await session();const signature=await signTypedData(typed);if(!isCurrent())throw Error('账号钱包会话已结束，签名未提交');return signature;
  }
 };
}
