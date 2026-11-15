let active=null;
export const accountWallet=()=>active;
export function publishAccountWallet(choice){active=choice;if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('oasis:account-wallet-ready',{detail:choice}));}
export function clearAccountWallet(){const previous=active;active=null;if(previous&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('oasis:account-wallet-cleared',{detail:previous}));}
export function matchesWalletIdentity(user,subject){return user?.linkedAccounts?.some(a=>a.type==='custom_auth'&&a.customUserId===subject)===true;}
export function guardWalletProvider(raw,{address,subject,isCurrent,getSession,signTypedData}){
 const reads=new Set(['eth_accounts','eth_requestAccounts','eth_chainId','net_version']);
 return {async request(packet){
  if(!isCurrent())throw Error('账号钱包会话已失效，请重新登录');
  if(!reads.has(packet.method)&&packet.method!=='eth_signTypedData_v4')throw Error('账号钱包当前仅支持 Hyperliquid 测试网授权');
  if(packet.method==='eth_accounts'||packet.method==='eth_requestAccounts')return [address];
  if(packet.method!=='eth_signTypedData_v4')return raw.request(packet);
  const [signer,data]=packet.params||[];let typed;try{typed=typeof data==='string'?JSON.parse(data):data;}catch{throw Error('签名内容无效');}
  if(signer?.toLowerCase()!==address.toLowerCase()||typed?.primaryType!=='HyperliquidTransaction:ApproveAgent'||typed.domain?.name!=='HyperliquidSignTransaction'||typed.message?.hyperliquidChain!=='Testnet'||typed.message?.agentName!=='OasisTest'||!/^0x[0-9a-f]{40}$/i.test(typed.message?.agentAddress||'')||typed.domain?.verifyingContract!=='0x'+'0'.repeat(40))throw Error('只允许你确认的测试网助手授权');
  const session=await getSession();
  if(!isCurrent()||!session?.active||'oasis:google:'+session.id!==subject)throw Error('登录账户已变化，请重新连接账号钱包');
  const signature=await signTypedData(typed);if(!isCurrent())throw Error('账号钱包会话已结束，签名未提交');return signature;
 }};
}
