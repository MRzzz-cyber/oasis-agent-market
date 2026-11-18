import {createPublicClient,createSecureClient,production} from '@polymarket/client';
import {fetchMarketInfo,prepareGaslessTransaction,postOrder,fetchTransaction} from '@polymarket/client/actions';
import {hashTypedData,keccak256,toHex} from 'viem';
import {POLYGON,PUSD,address,atomic,canonical,checkAuth,checkOrder,checkBatch,purchasePreview,checkQuote,approvalCalls,EXCHANGES} from '../frontend/polymarket-purchase-core.js';
import {depositWallets} from '../frontend/polymarket-identity.js';
export {depositWallets};
const json=(x)=>JSON.parse(canonical(x)),hosts=new Set(['gamma-api.polymarket.com','clob.polymarket.com','relayer-v2.polymarket.com',new URL(production.rpc).hostname]);
const TIMEOUT=15000;
export async function purchaseSession(wallet,{getWallet,fetchImpl=fetch,onPrepared=()=>{},onAcknowledged=()=>{},accountWallet}={}){
 let proof=null,context=null,authenticating=true,closed=false,deploySent=false,client;
 const owner=address(wallet.address),ensure=async()=>{if(closed||getWallet()!==wallet)throw Error('钱包已变化');const [chain,accounts]=await Promise.all([wallet.provider.request({method:'eth_chainId'}),wallet.provider.request({method:'eth_accounts'})]);if(closed||getWallet()!==wallet||chain!==POLYGON||address(accounts?.[0])!==owner)throw Error('钱包或网络已变化，请重新核对');};
 const request=async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);if(!hosts.has(url.hostname)||url.protocol!=='https:')throw Error('平台请求地址未获准');
  if(req.method!=='GET'){
   const text=await req.clone().text();
   if(url.hostname===new URL(production.rpc).hostname){
    const rpc=JSON.parse(text);if(!['eth_call','eth_getCode','eth_chainId','eth_getTransactionReceipt'].includes(rpc.method))throw Error('仅允许 Polygon 合约只读查询');
   }else if(url.hostname==='relayer-v2.polymarket.com'&&url.pathname==='/submit'&&req.method==='POST'){
    const payload=JSON.parse(text);await ensure();
    if(payload.type==='WALLET-CREATE'){if(!authenticating||deploySent)throw Error('平台账户创建请求已发出');deploySent=true;}
    else{if(context?.kind!=='approval'||!context.batch||context.started)throw Error('授权请求与本次确认不匹配');checkBatch(context.batch,context.quote,client.account.wallet);context.started=true;}
    const response=await fetchImpl('/api/predictions/relay',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:canonical({body:text,proof,...(context?.kind==='approval'?{quote:context.quote,batch:context.batch}:{})}),signal:AbortSignal.timeout(TIMEOUT)});
    const body=await response.clone().json().catch(()=>null);if(context&&body?.submitted===false)context.notSubmitted=true;
    if(response.ok&&context&&typeof body?.transactionID==='string')onAcknowledged({transactionId:body.transactionID});
    return response;
   }else if(url.hostname==='clob.polymarket.com'&&url.pathname==='/auth/api-key'&&req.method==='POST'){if(!authenticating)throw Error('只允许首次连接创建平台登录凭据');}
   else if(url.hostname==='clob.polymarket.com'&&url.pathname==='/order'&&req.method==='POST'){
    await ensure();if(!context?.order||context.kind!=='order'||context.started)throw Error('本次订单不可重复提交');checkQuote(context.quote);
    const payload=JSON.parse(text),signed=context.order;
    if(payload.orderType!=='FOK'||payload.deferExec!==false||payload.postOnly||payload.order?.expiration!=='0')throw Error('仅允许本次 FOK 买入');
    const expected={...signed,expiration:String(signed.expiration),salt:Number(signed.salt)};delete expected.orderType;delete expected.postOnly;
    if(canonical(Object.keys(payload.order).sort().map(k=>[k,payload.order[k]]))!==canonical(Object.keys(expected).sort().map(k=>[k,expected[k]])))throw Error('实际提交订单与钱包签名不一致');
    context.started=true;
   }else throw Error('平台写入请求未获准');
  }
  return fetchImpl(new Request(req,{redirect:'manual',signal:AbortSignal.any([req.signal,AbortSignal.timeout(TIMEOUT)])}));
 };
 const signer={
  getAddress:async()=>{await ensure();return owner;},
  signMessage:async()=>{throw Error('本流程不使用通用消息签名');},
  sendTransaction:async()=>{throw Error('本流程只使用固定平台合约的免网络费授权，不发送 EOA 交易');},
  async signTypedData(typed){
   await ensure();const data=json(typed);
   let kind='auth';
   if(authenticating){checkAuth(data,owner);}
   else if(context?.kind==='approval'){if(context.signed)throw Error('本次授权已签名，禁止自动重试');checkBatch(data,context.quote,client.account.wallet);context.batch=data;context.signed=true;kind='approval';}
   else if(context?.kind==='order'){
    if(context.signed)throw Error('本次订单已签名，禁止自动重试');const m=checkOrder(data,context.quote,client.account);
    const orderId=hashTypedData({domain:data.domain,types:{Order:data.types.Order},primaryType:'Order',message:m});
    context.typed=data;context.signed=true;kind='order';onPrepared({orderId,signedAmounts:{makerAmount:String(m.makerAmount),takerAmount:String(m.takerAmount)}});
   }else throw Error('没有待确认的交易');
   wallet.provider.armPredictionSignature?.(data,{kind,quote:context?.quote,identity:client?.account});
   const signature=await wallet.provider.request({method:'eth_signTypedData_v4',params:[owner,canonical(data)]});
   await ensure();if(!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('钱包未返回有效签名');
   if(authenticating)proof={payload:data,signature};else if(kind==='order')checkOrder(data,context.quote,client.account);else checkBatch(data,context.quote,client.account.wallet);
   return signature;
  }
 };
 await ensure();
 client=await createSecureClient({signer,...(accountWallet?{wallet:accountWallet}:{}),apiKey:{isBuilderKey:false,supportGasless:true,authorize:async()=>({})},fetch:request});
 authenticating=false;
 if(client.account.walletType!==3||address(client.account.signer)!==owner||!depositWallets(owner).includes(address(client.account.wallet)))throw Error('平台交易账户与当前钱包不匹配');
 async function rpc(method,params){const r=await request(production.rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok)throw Error('Polygon 网络读取失败');const p=await r.json();if(p.error)throw Error('Polygon 网络读取失败');return p.result;}
 async function balances(q){await ensure();const maker=address(client.account.wallet),word=a=>a.slice(2).padStart(64,'0'),call=data=>rpc('eth_call',[{to:PUSD,data},'latest']);
 const spenders=[q.exchange,...(q.negRisk&&q.protocol==='v1'?['0xd91e80cf2e7be2e162c6513ced06f1dd0da35296']:[])];
 const [balance,...allowances]=await Promise.all([call('0x70a08231'+word(maker)),...spenders.map(s=>call('0xdd62ed3e'+word(maker)+word(s)))]);
 if([balance,...allowances].some(v=>!/^0x[0-9a-f]{64}$/i.test(v)))throw Error('pUSD 余额或授权额度返回异常');await ensure();return {balanceAtomic:BigInt(balance).toString(),approvalNeeded:allowances.some(v=>BigInt(v)<BigInt(q.budgetAtomic))};
 }
 return {
  identity:json(client.account),
  bridgeProof(){if(closed||!proof)throw Error('平台连接已过期，请重新连接');return json(proof);},
  observe(fn){onPrepared=fn;onAcknowledged=fn;},
  async preview(args){await ensure();const market=await client.fetchMarket({id:args.marketId},{retries:0}),assetId=market.version==='v2'?market.outcomes?.[args.outcome]?.positionId:market.outcomes?.[args.outcome]?.tokenId;
   const [book,info]=await Promise.all([client.fetchOrderBook({assetId},{retries:0}),fetchMarketInfo(client,{conditionId:market.conditionId},{retries:0})]);
   if(!info.tokens?.some(t=>String(t.assetId)===String(assetId)))throw Error('平台费率与交易资产不匹配');
   const q=purchasePreview({market,book,feeInfo:info.feeInfo,budget:args.budget,outcome:args.outcome});return {...q,...await balances(q)};
  },
  balances,
  async approve(q){if(!proof||Date.now()-Number(proof.payload.message.timestamp)*1000>240000)throw Object.assign(Error('平台连接已过期，请重新连接交易账户'),{code:'AUTH_EXPIRED'});context={kind:'approval',quote:q,started:false,signed:false};const flow=await prepareGaslessTransaction(client,{calls:approvalCalls(q).map(c=>({to:c.target,data:c.data,value:0n})),metadata:'Oasis exact purchase approval'});let cursor=await flow.next();while(!cursor.done){const step=cursor.value;if(step.kind==='requestAddress')cursor=await flow.next(await signer.getAddress());else if(step.kind==='signGaslessTypedData')cursor=await flow.next(await signer.signTypedData(step.payload));else throw Error('不支持该平台授权类型');}return {transactionId:cursor.value.transactionId};},
  async submit(q){context={kind:'order',quote:q,started:false,signed:false};const order=await client.createMarketOrder({assetId:q.assetId,side:'BUY',amount:format(q.netAtomic),maxSpend:format(q.budgetAtomic),maxPrice:format(q.limitAtomic),orderType:'FOK'});if(!context.typed)throw Error('平台未请求本次订单签名');checkOrder(context.typed,q,client.account);context.order=order;return postOrder(client)(order);},
  wasSubmitted:()=>context?.started===true&&context?.notSubmitted!==true,
  async reconcile(record){
   await ensure();if(record.kind==='approval'){
    if(!record.transactionId)return record;const tx=await fetchTransaction(client,{transactionId:record.transactionId},{retries:0});
    const state=String(tx.state).toUpperCase();if(['STATE_FAILED','STATE_INVALID','FAILED','INVALID'].includes(state))return {...record,status:'failed',terminal:true,message:'平台授权失败，未提交购买订单'};
    const hash=tx.transactionHash;if(!/^0x[0-9a-f]{64}$/i.test(hash||''))return record;
    const receipt=await rpc('eth_getTransactionReceipt',[hash]);if(!receipt)return record;if(receipt.status==='0x0')return {...record,status:'failed',terminal:true,message:'平台授权链上失败'};
    if(receipt.status!=='0x1')return record;const topic=keccak256(toHex('Approval(address,address,uint256)')),word=a=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
    if(!approvalCalls(record.quote).every(c=>receipt.logs?.some(l=>address(l.address)===PUSD&&l.topics?.[0]?.toLowerCase()===topic&&l.topics?.[1]?.toLowerCase()===word(client.account.wallet)&&l.topics?.[2]?.toLowerCase()===word('0x'+c.data.slice(34,74))&&BigInt(l.data)===BigInt(record.quote.budgetAtomic)&&!l.removed)))throw Error('原授权日志与本次金额不匹配');
    return {...record,status:'approved',terminal:true,hashes:[hash],message:'本次 pUSD 授权已确认，尚未买入'};
   }
   if(!record.orderId)return record;const order=await client.fetchOrder({orderId:record.orderId},{retries:0});
   if(order.id.toLowerCase()!==record.orderId||address(order.makerAddress)!==address(record.identity.wallet)||String(order.assetId)!==record.quote.assetId||order.side!=='BUY')throw Error('原订单资产或账户不匹配');
   const status=String(order.status).toUpperCase(),matched=atomic(String(order.sizeMatched));if(record.signedAmounts&&(atomic(String(order.originalSize))!==BigInt(record.signedAmounts.takerAmount)||matched>BigInt(record.signedAmounts.takerAmount)))throw Error('原订单份额与钱包签名不匹配');
   if(['CANCELED','CANCELLED','EXPIRED'].includes(status)&&matched===0n)return {...record,status:'unfilled',terminal:true,message:'原订单未成交，平台已确认结束'};
   const ids=order.associateTrades?.length?order.associateTrades:(record.tradeIds||[]);
   if(matched>0n&&matched<BigInt(record.quote.minimumSharesAtomic))throw Error('平台报告的份额低于本次下限，请核对原订单');
   if(matched>0n&&ids.length){const hashes=await client.waitForOrderFillSettlement({ok:true,orderId:record.orderId,status:'matched',tradeIds:ids,transactionsHashes:[]},{timeoutMs:12000});if(!hashes.length)return record;
    const receipts=await Promise.all(hashes.map(h=>rpc('eth_getTransactionReceipt',[h])));if(receipts.some(r=>r?.status!=='0x1'))return record;
    return {...record,status:'settled',terminal:true,hashes,matchedShares:String(order.sizeMatched),message:'平台确认已成交，结算交易已上链'};}
   return {...record,status:matched>0n?'matched':'pending',message:matched>0n?'平台已匹配，正在等待结算':'原订单仍待核对，不会重复提交'};
  },
  close(){closed=true;context=null;proof=null;client.closeSubscriptions?.().catch(()=>{});}
 };
}
function format(value){const n=BigInt(value),tail=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return String(n/1000000n)+(tail?'.'+tail:'');}
