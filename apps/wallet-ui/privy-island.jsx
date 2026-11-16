import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PrivyProvider,usePrivy,useWallets,useCreateWallet,useSubscribeToJwtAuthWithFlag,useSignTypedData,useUser} from '@privy-io/react-auth';
import {matchesWalletIdentity,guardWalletProvider} from '../frontend/account-wallet.js';
export function signingCopy(typed){
 const m=typed?.message||{};
 if(typed?.primaryType==='HyperliquidTransaction:Withdraw')return {title:'确认提款至我的 Arbitrum 钱包',description:m.amount+' USDC · 收款地址 '+m.destination+' · 协议扣费影响净到账。此签名申请提款，不代表已到账。'};
 if(typed?.primaryType==='HyperliquidTransaction:UsdClassTransfer')return {title:m.toPerp?'确认现货划转至资金账户':'确认资金账户划转至现货',description:m.amount+' USDC · 仅当前钱包自己的 Hyperliquid 账户。此操作不是买入订单。'};
 if(typed?.primaryType==='HyperliquidTransaction:UserSetAbstraction')return {title:'确认切换整个账户为独立现货模式',description:'钱包 '+m.user+' · 将 Hyperliquid 账户模式改为 disabled。不创建新钱包，不提交订单，不自动恢复原模式。'};
 return {title:m.hyperliquidChain==='Mainnet'?'授权 Oasis 主网交易会话':'授权 Oasis 测试网助手',description:m.hyperliquidChain==='Mainnet'?'Hyperliquid 主网 API 交易权限。仅本页面保存会话密钥；订单金额由你单独确认，协议权限本身不限本次金额。':'仅 Hyperliquid Testnet。协议授权范围请核对，订单仍需单独确认。'};
}
export function mountPrivyWallet(host,{config,getToken,onStatus,onReady}){
 const root=createRoot(host);let identity=null,retry=0,currentIdentity=null;
 function Bridge({identity,attempt}){
  const {ready,authenticated,user}=usePrivy();const {wallets,ready:walletsReady}=useWallets();
  const {createWallet}=useCreateWallet();const {signTypedData}=useSignTypedData();const {refreshUser}=useUser();
  const started=useRef(null),reported=useRef(null),[creation,setCreation]=useState(0);
  const getExternalJwt=useCallback(async()=>identity?.active?(await getToken()).token:undefined,[identity?.id,identity?.active,attempt]);
  const onError=useCallback(()=>onStatus('error','账号钱包登录失败，请稍后重试。'),[]);
  useSubscribeToJwtAuthWithFlag({isAuthenticated:Boolean(identity?.active),isLoading:false,getExternalJwt,onError});
  const subject=identity?'oasis:google:'+identity.id:null;
  const linked=ready&&authenticated&&matchesWalletIdentity(user,subject);
  useEffect(()=>{
   if(!identity?.active||!ready)return;
   if(!linked){onStatus('creating','正在同步账号钱包身份…');return;}
   if(!walletsReady)return;
   const embedded=user.linkedAccounts.find(a=>a.type==='wallet'&&a.chainType==='ethereum'&&['privy','privy-v2'].includes(a.walletClientType));
   if(embedded)return;
   const key=subject+':'+attempt;if(started.current===key)return;started.current=key;
   onStatus('creating','正在创建你的独立账号钱包…');
   createWallet().then(()=>setCreation(n=>n+1)).catch(async()=>{
    try{const latest=await refreshUser();if(matchesWalletIdentity(latest,subject)&&latest.linkedAccounts.some(a=>a.type==='wallet'&&a.chainType==='ethereum'&&['privy','privy-v2'].includes(a.walletClientType))){setCreation(n=>n+1);return;}}catch{}
    if(currentIdentity?.id===identity.id)onStatus('error','钱包创建未完成，可重试；不会重新创建已有钱包。');
   });
  },[linked,ready,walletsReady,user,subject,identity?.active,attempt,createWallet]);
  useEffect(()=>{
   if(!identity?.active||!linked||!walletsReady)return;
   const embedded=wallets.find(w=>['privy','privy-v2'].includes(w.walletClientType)&&user.linkedAccounts.some(a=>a.type==='wallet'&&a.address?.toLowerCase()===w.address.toLowerCase()&&['privy','privy-v2'].includes(a.walletClientType)));
   if(!embedded)return;
   const key=subject+':'+embedded.address+':'+attempt;if(reported.current===key)return;reported.current=key;
   let cancelled=false,completed=false;
   embedded.getEthereumProvider().then(raw=>{
    if(cancelled||currentIdentity?.id!==identity.id)return;
    const provider=guardWalletProvider(raw,{address:embedded.address,subject,isCurrent:()=>currentIdentity?.active&&currentIdentity.id===identity.id,
     getSession:async()=>{const r=await fetch('/api/auth/me',{cache:'no-store'});return r.ok?r.json():null;},
     signTypedData:async typed=>{const {signature}=await signTypedData(typed,{address:embedded.address,uiOptions:signingCopy(typed)});return signature;}});
    completed=true;onReady({name:'Oasis 账号钱包 · Privy',kind:'embedded',address:embedded.address,provider});onStatus('ready','独立账号钱包已就绪，可以读取正式网资产。');
   }).catch(()=>{if(!cancelled)onStatus('error','账号钱包恢复失败，请重试。');});
   return()=>{cancelled=true;if(!completed&&reported.current===key)reported.current=null;};
  },[linked,walletsReady,wallets,user,subject,attempt,creation,identity?.active,signTypedData]);
  return null;
 }
 function render(){currentIdentity=identity;root.render(<PrivyProvider appId={config.appId} clientId={config.clientId||undefined} config={{appearance:{theme:'dark',accentColor:'#b6ee86'},embeddedWallets:{showWalletUIs:true,ethereum:{createOnLogin:'off'}}}}><Bridge identity={identity} attempt={retry}/></PrivyProvider>);}
 return {update(user){identity=user;render();},retry(){retry++;render();},destroy(){currentIdentity=null;root.unmount();}};
}
