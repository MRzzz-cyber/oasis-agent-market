import {MAINNET_CHAINS,USDC_CONTRACTS} from './mainnet-wallet.js';
export const RECEIVE_NETWORKS=[1,42161,8453,10,999].map(id=>({id,...MAINNET_CHAINS[id]}));
export function receiveDetails(address,chainId,asset='USDC'){
 if(typeof address!=='string'||!/^0x[0-9a-f]{40}$/i.test(address)||/^0x0{40}$/i.test(address))throw Error('收款地址无效');
 const network=RECEIVE_NETWORKS.find(n=>n.id===Number(chainId));if(!network)throw Error('请选择支持的主网');
 if(!['USDC','native'].includes(asset))throw Error('不支持该充值币种');
 return {address,chainId:network.id,network:network.name,symbol:asset==='USDC'?'USDC':network.symbol,contract:asset==='USDC'?USDC_CONTRACTS[network.id]:null,qr:address};
}
export async function verifiedReceiveDetails(wallet,chainId,asset){
 if(!wallet?.provider)throw Error('请先创建或连接钱包');
 const accounts=await wallet.provider.request({method:'eth_accounts'});
 if(!accounts?.[0]||accounts[0].toLowerCase()!==wallet.address?.toLowerCase())throw Error('钱包账户已变化，请重新连接');
 const chain=await wallet.provider.request({method:'eth_chainId'});
 if(!/^0x[0-9a-f]+$/i.test(chain))throw Error('无法核对钱包网络');
 // Privy account wallets are EVM EOAs. External wallets may be chain-specific smart accounts.
 if(wallet.kind!=='embedded'&&Number(BigInt(chain))!==Number(chainId))throw Error('请先在外部钱包中切换至 '+(MAINNET_CHAINS[chainId]?.name||'所选')+' 主网，再点击重新核对');
 const afterChain=await wallet.provider.request({method:'eth_chainId'});if(afterChain!==chain)throw Error('钱包网络已变化，请重新核对');
 const after=await wallet.provider.request({method:'eth_accounts'});
 if(after?.[0]?.toLowerCase()!==wallet.address.toLowerCase())throw Error('钱包账户已变化，请重新连接');
 return receiveDetails(accounts[0],chainId,asset);
}
