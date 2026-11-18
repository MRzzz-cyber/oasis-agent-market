import {getLanguage,translateUI} from './i18n.js';
import {SOURCES,display,bridgeJournal} from './crosschain-core.js';
import {prepareBridge,executeBridge,recoverBridge} from './crosschain-engine.js';
const el=(tag,text,cls='')=>Object.assign(document.createElement(tag),{className:cls,...(text==null?{}:{textContent:String(text)})});
const t=(zh,en)=>getLanguage()==='en'?en:zh;
export function crosschainFunding({wallet,getWallet,getSession,maker,shortfallAtomic='10000000',storage=localStorage,locks=navigator.locks,onBusy=()=>{},onContinue=()=>{},fetchImpl=fetch}){
 const root=el('section',null,'crosschain-funding'),heading=el('strong'),intro=el('p'),controls=el('div',null,'crosschain-controls'),source=el('select'),amount=el('input'),quoteBox=el('dl'),actions=el('div',null,'crosschain-actions'),status=el('p','','crosschain-status'),receipt=el('div');
 for(const [id,chain]of Object.entries(SOURCES)){const o=el('option',chain.name);o.value=id;source.append(o);}source.value='42161';amount.type='number';amount.inputMode='decimal';amount.min='2';amount.max='1000';amount.step='0.01';const initial=(BigInt(shortfallAtomic)+9999n)/10000n*10000n;amount.value=display(initial<2000000n?2000000n:initial);
 const networkLabel=el('label',''),amountLabel=el('label',''),networkText=document.createTextNode(''),amountText=document.createTextNode('');networkLabel.append(networkText,source);amountLabel.append(amountText,amount);controls.append(networkLabel,amountLabel);root.append(heading,intro,controls,quoteBox,actions,status,receipt);status.setAttribute('role','status');
 const journal=()=>bridgeJournal(storage,wallet.address),current=()=>!closed&&root.isConnected&&getWallet()===wallet,initialRecord=journal().load();
 let prepared=null,busy=false,closed=false,record=null,activeId=initialRecord?.terminal===false?initialRecord.id:null,notice='';
 function btn(parent,label,fn){const b=el('button',label);b.type='button';b.onclick=()=>run(fn);parent.append(b);return b;}
 function paint(){if(closed)return;actions.replaceChildren();receipt.replaceChildren();const stored=journal().load();record=stored?.terminal===false||stored?.id===activeId?stored:null;const held=record?.terminal===false;source.disabled=amount.disabled=busy||held;quoteBox.hidden=!prepared||held;
  if(held){status.textContent=notice||translateUI(record.message);btn(actions,t('核对跨链进度','Check bridge progress'),poll).disabled=busy;
   if(!record.hash){const hashInput=el('input');hashInput.type='text';hashInput.placeholder=t('粘贴原转账哈希 0x…','Paste original transaction hash 0x…');hashInput.setAttribute('aria-label',hashInput.placeholder);receipt.append(hashInput);btn(receipt,t('核对原交易','Check original transaction'),()=>poll(hashInput.value.trim())).disabled=busy;}
   if(record.status==='needs-support'){const a=el('a',t('联系桥服务支持 ↗','Contact bridge support ↗'));a.href='https://intercom.help/funxyz/en/articles/10732578-contact-us';a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}
  }else if(record?.status==='completed'){status.textContent=t('pUSD 已到账，刷新价格后即可继续买入','pUSD has arrived. Refresh the price to continue.');btn(actions,t('返回原盘口，刷新价格','Return to market & refresh price'),onContinue).disabled=busy;}
  else btn(actions,prepared?t('确认跨链 · '+prepared.quote.amount+' USDC','Confirm bridge · '+prepared.quote.amount+' USDC'):t('查看跨链费用与到账','Review bridge cost & output'),async()=>{
   if(!prepared){const session=getSession();if(!session)throw Error(t('请先连接 Polymarket 交易账户','Connect your Polymarket account first'));const chain=SOURCES[source.value].chain;if(await wallet.provider.request({method:'eth_chainId'})!==chain)await wallet.provider.request({method:'wallet_switchEthereumChain',params:[{chainId:chain}]});if(!current())return;prepared=await prepareBridge({sourceChain:source.value,amount:amount.value,maker,session,wallet,getWallet,storage,fetchImpl});paintQuote();}
   else{record=await executeBridge({prepared,wallet,getWallet,storage,locks,fetchImpl,onStage:r=>{if(current())status.textContent=translateUI(r.message);}});activeId=record.id;prepared=null;paintQuote();status.textContent=translateUI(record.message);}
  }).disabled=busy;
  if(prepared&&!held)btn(actions,t('刷新预估','Refresh estimate'),()=>{prepared=null;quoteBox.replaceChildren();}).disabled=busy;
  if(record?.hash){const a=el('a',t('查看来源网络转账 ↗','View source transfer ↗'));a.href=SOURCES[record.quote.sourceChain].explorer+record.hash;a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}if(record?.destinationHash){const a=el('a',t('查看 pUSD 到账 ↗','View pUSD arrival ↗'));a.href='https://polygonscan.com/tx/'+record.destinationHash;a.target='_blank';a.rel='noopener noreferrer';receipt.append(a);}
 }
 function paintQuote(){quoteBox.replaceChildren();if(!prepared)return;const q=prepared.quote;const rows=[
 [t('来源','From'),SOURCES[q.sourceChain].name+' · '+q.amount+' USDC'],
 [t('来源可用余额','Source available balance'),display(prepared.balanceAtomic)+' USDC'],
 [t('预计到账','Estimated receipt'),display(q.estimateAtomic)+' pUSD'],
 [t('桥费用预估','Estimated bridge cost'),'$'+q.feeUsd],
 [t('桥网络费预估','Estimated bridge gas'),'$'+(q.bridgeGasUsd||'0')],
 [t('预计时间','Estimated time'),Math.max(1,Math.ceil(q.estMs/1000))+' s'],
 [t('源网络费预留','Source gas reserve'),(Number(prepared.gasFeeWei)/1e18).toFixed(8)+' ETH'],
 [t('到账账户','Receiving account'),q.maker.slice(0,6)+'…'+q.maker.slice(-4)]];
 for(const [label,value]of rows)quoteBox.append(el('dt',label),el('dd',value));status.textContent=t('通过 Polymarket 官方桥。到账为预估，最终以实际入账为准；跨链完成后由你确认买入。','Via the official Polymarket bridge. Output is an estimate; actual credit may differ. Confirm your purchase after funding.');
 }
 async function run(fn){if(busy||closed)return;busy=true;notice='';onBusy(true);paint();try{await fn();}catch(error){if(current()){notice=translateUI(error.message);status.textContent=notice;}}finally{busy=false;onBusy(false);if(current())paint();}}
 async function poll(sourceHash){const r=await recoverBridge({wallet,getWallet,storage,fetchImpl,sourceHash:typeof sourceHash==='string'?sourceHash:undefined});if(current()){record=r;status.textContent=translateUI(r?.message||'');}}
 source.onchange=amount.oninput=()=>{prepared=null;quoteBox.replaceChildren();status.textContent=t('选择已变化，请重新预览','Selection changed. Review a new estimate.');paint();};
 const lang=()=>{heading.textContent=t('使用其他网络 USDC 充值','Fund with USDC from another network');intro.textContent=t('跨链并自动转换为 Polymarket pUSD','Bridge and automatically convert to Polymarket pUSD');networkText.data=t('资金所在网络','Source network');amountText.data=t('充值金额 · USDC','Funding amount · USDC');source.setAttribute('aria-label',networkText.data);amount.setAttribute('aria-label',amountText.data);paintQuote();paint();};window.addEventListener('oasis:language-changed',lang);
 const timer=setInterval(()=>{if(current()&&!busy&&!document.hidden&&journal().load()?.terminal===false)run(poll);},15000);
 root.dispose=()=>{closed=true;clearInterval(timer);window.removeEventListener('oasis:language-changed',lang);};root.canLeave=()=>!busy;lang();return root;
}
