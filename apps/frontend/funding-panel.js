import {ARBITRUM,BRIDGE,USDC,currentWallet,readFunding,prepareFunding,submitFunding,reconcileFunding,fundingJournal} from './funding-core.js';
const titles={deposit:'Arbitrum USDC 入金',toSpot:'资金账户 → 现货',toPerp:'现货 → 资金账户',withdraw:'提款至我的 Arbitrum 钱包',standardize:'切换为独立现货模式'};
const el=(tag,value,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(value==null?{}:{textContent:value})});
export function fundingPanel({wallet,getWallet,onChanged=()=>{}}){
 const root=el('section',null,'native-funding-panel'),status=el('p','点击刷新读取当前账户余额','note'),balances=el('dl',null,'conversation-plan-terms'),preview=el('div'),history=el('div');status.setAttribute('role','status');
 root.append(el('h3','站内资金管理'),el('p','所有资金操作均需单独预览并由你在钱包确认。入金、划转和买入是独立步骤，不会自动连续执行。','note'),el('code',wallet.address,'mainnet-plan-address'),balances);
 const controls=el('div',null,'action-row'),select=el('select'),amount=el('input');select.setAttribute('aria-label','资金操作');amount.type='text';amount.inputMode='decimal';amount.placeholder='USDC 金额';amount.setAttribute('aria-label','资金操作金额');
 for(const [value,title]of Object.entries(titles)){const option=el('option',title);option.value=value;select.append(option);}select.value='toSpot';
 root.append(controls,el('label','操作'),select,el('label','金额（USDC）'),amount,preview,status,history);
 let busy=false,prepared=null,version=0,destroyed=false;const alive=()=>!destroyed&&root.isConnected&&getWallet()===wallet;
 function invalidate(){version++;prepared=null;preview.replaceChildren();amount.disabled=busy||select.value==='standardize';}
 select.onchange=()=>{invalidate();status.textContent='请预览本次操作；切换模式会改变此钱包整个 Hyperliquid 账户的资金管理方式。';};amount.oninput=invalidate;
 function lock(value){busy=value;select.disabled=value;amount.disabled=value||select.value==='standardize';root.querySelectorAll('button').forEach(b=>b.disabled=value);}
 async function run(fn){if(busy||!alive())return;lock(true);try{await fn();}catch(e){if(alive())status.textContent=e?.code===4001?'你取消了钱包请求，未自动重试。':e.message||'操作未完成';}finally{if(alive())lock(false);}}
 function button(parent,title,fn){const b=el('button',title,'ghost');b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function record(){const r=fundingJournal(localStorage,wallet.address).load();history.replaceChildren();if(!r)return;history.append(el('strong','最近资金操作：'+titles[r.kind]),el('p',r.message||r.status,'note'),el('p','请求编号 '+r.nonce,'note'));if(r.hash){const a=el('a','查看 Arbitrum 交易 ↗','wallet-official-link');a.href='https://arbiscan.io/tx/'+r.hash;a.target='_blank';a.rel='noopener noreferrer';history.append(a);}button(history,'核对原资金请求',async()=>{const latest=fundingJournal(localStorage,wallet.address).load();if(!latest)return;const checked=await reconcileFunding({record:latest,wallet,getWallet,storage:localStorage});if(!alive())return;status.textContent=checked.message;record();await refresh();});}
 async function refresh(){const ticket=version;status.textContent='正在核对余额与账户模式…';const data=await readFunding(wallet.address);await currentWallet(wallet,getWallet);if(!alive()||ticket!==version)return;balances.replaceChildren();for(const [name,value]of [['账户模式',data.mode],['Hyperliquid 现货 USDC',data.spot],['Hyperliquid 资金账户可划转 / 可提 USDC',data.perp]])balances.append(el('dt',name),el('dd',value));status.textContent=['default','disabled'].includes(data.mode)?'独立现货模式：可在本站预览入金、划转或提款。':'当前为 '+data.mode+'。先选择“切换为独立现货模式”预览；有仓位、挂单或借贷时会停止切换。';record();}
 button(controls,'刷新资金余额',refresh);
 button(controls,'切换至 Arbitrum',async()=>{invalidate();await currentWallet(wallet,getWallet);await wallet.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:ARBITRUM}]});await currentWallet(wallet,getWallet,ARBITRUM);status.textContent='已切换 Arbitrum，请重新预览资金操作。';});
 button(controls,'预览资金操作',async()=>{
  invalidate();const ticket=version,kind=select.value,p=await prepareFunding({kind,amount:amount.value,wallet,getWallet});if(!alive()||ticket!==version)return;prepared=p;
  preview.replaceChildren(el('h4','确认本次资金操作'),el('p',titles[kind]),el('p','钱包 / 交易账户：'+p.user,'note'));
  if(kind!=='standardize')preview.append(el('p','本次金额：'+p.amount+' USDC'));
  if(kind==='deposit')preview.append(el('p','网络：Arbitrum One · 资产：原生 USDC。到账后需刷新核对，再单独划转到现货。','note'),el('p','USDC 合约：'+USDC,'note'),el('p','入金桥：'+BRIDGE,'note'),el('p','预计执行网络费 '+p.gasEstimate+' wei；总网络费与最终交易以钱包显示为准。Oasis 本入口单笔最低 10 USDC，不授权无限额度。','note'));
  if(kind==='toSpot'||kind==='toPerp')preview.append(el('p','只在当前钱包自己的 Hyperliquid 资金账户和现货账户之间划转 USDC，不转给其他地址。','note'));
  if(kind==='withdraw')preview.append(el('p','从 Hyperliquid 资金账户申请提款。收款网络固定为 Arbitrum One，收款地址固定为上方当前钱包。协议扣费会减少净到账；实际费用以协议账本为准。若资金在现货，请先单独划转到资金账户。','note'),el('p','受理请求不等于链上到账，不会自动再次提款。','note'));
  if(kind==='standardize')preview.append(el('p','将整个 Hyperliquid 账户从 '+p.mode+' 改为 disabled（独立现货 / 合约模式）。这不是钱包重建。仅在全部合约账户无仓位、无挂单且无借贷或供给资产时允许；不自动恢复原模式。','note'));
  const consent=el('label'),check=el('input');check.type='checkbox';consent.append(check,el('span','我已核对金额、方向、网络、收款地址及费用说明；继续后在钱包单独确认。'));preview.append(consent);
  button(preview,'确认并打开钱包',async()=>{if(!check.checked||prepared!==p)throw Error('请先核对并勾选本次操作说明');status.textContent='请在钱包核对并确认；不要重复点击。';const r=await submitFunding({prepared:p,wallet,getWallet,storage:localStorage,locks:navigator.locks});prepared=null;preview.replaceChildren();if(!alive())return;status.textContent=r.message;record();try{onChanged();}catch{};});
  status.textContent='预览 60 秒内有效。点击确认后才会请求钱包签名或交易。';
 });
 const changed=()=>{if(getWallet()!==wallet){destroyed=true;prepared=null;root.replaceChildren(el('p','钱包已变化，请重新打开资金管理。','note'));window.removeEventListener('oasis:funds-updated',changed);}};window.addEventListener('oasis:funds-updated',changed);
 const observer=new MutationObserver(()=>{if(!root.isConnected){destroyed=true;prepared=null;observer.disconnect();window.removeEventListener('oasis:funds-updated',changed);}});queueMicrotask(()=>{if(alive()){observer.observe(root.parentNode||root,{childList:true});run(refresh);}});
 return root;
}
