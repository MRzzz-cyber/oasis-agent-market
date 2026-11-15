// All advisor models share the same user-controlled mainnet journey.
// Only user messages advance intent; model prose never authorizes a trade.
export const OFFICIAL_TRADE_URL='https://app.hyperliquid.xyz/trade';
export function tradeBudget(value){const text=String(value);if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)||Number(text)<10)throw Error('请输入至少 10 USDC，最多两位小数；费用另计');return Number(text);}
export function conversationGuide(conversation){
 const users=conversation.filter(m=>m.role==='user').map(m=>String(m.content));let asset=null,budget=null,wantsPlan=false;
 for(const text of users){const intent=text.split(/行情上下文/)[0];const coin=intent.match(/\b(BTC|ETH|SOL|HYPE|XRP|BNB)\b/i)?.[1];const nextAsset=coin?.toUpperCase()||(intent.includes('以太坊')?'ETH':intent.includes('比特币')?'BTC':null);if(nextAsset&&nextAsset!==asset){asset=nextAsset;budget=null;}
  if(/调整|重新选择/.test(intent))budget=null;
  if(/测试网|测试(?:预算|金额|资金)|测试\s*USDC/.test(intent)){budget=null;wantsPlan=false;continue;}
  if(/买入|想买|购入|交易计划|买入计划/.test(intent))wantsPlan=true;
  if(/不买了|取消(?:交易|买入|计划)|只(?:想)?研究|暂不(?:交易|买入)/.test(intent)){wantsPlan=false;budget=null;continue;}
  const amount=intent.match(/(?:本次|这次)(?:买入|交易)?(?:金额|预算)(?:上限)?[：:\s]*(\d{1,9}(?:\.\d{1,2})?)(?![\d.])\s*(?:USDC|U)(?![A-Za-z])/i);if(amount){try{budget=tradeBudget(amount[1]);}catch{budget=null;}}
 }
 const stage=budget&&asset==='ETH'&&wantsPlan?'funds':wantsPlan?'plan':'research',ticker=asset||'当前标的',choices=[];
 const prompt=(title,description,text)=>choices.push({kind:'prompt',title,description,text});
 if(stage==='funds'){
  choices.push({kind:'preview',title:'确认 ETH 买入计划',description:`${budget} USDC · 主网现货 · 费用另计`});
  choices.push({kind:'funds',title:'准备钱包与交易资金',description:'核对真实余额，按需充值'});
  prompt('调整金额或计划','重新选择预算',`我想调整 ${ticker} 的主网现货买入计划，请先让我重新选择金额，不执行交易。`);
 }else if(stage==='plan'&&asset==='ETH'){
  choices.push({kind:'budget',amount:10,title:'10 USDC 小额体验',description:'真实资金 · 费用另计'});
  choices.push({kind:'budget',amount:50,title:'50 USDC',description:'确认计划后准备资金'});
  choices.push({kind:'custom',title:'自定义金额',description:'填写本次买入预算'});
  prompt('先看风险','继续研究，暂不准备资金',`先解释 ${ticker} 计划可能失败的情形和暂停条件，暂不交易，只研究风险。`);
 }else{
  prompt('继续分析走势','补充证据与不同情景',`继续分析 ${ticker}：列出上涨、下跌、横盘三种情景与确认信号，说明缺少的数据，不执行交易。`);
  prompt('检查风险','了解反例与暂停条件',`检查 ${ticker} 当前判断的风险、反例和暂停条件，不执行交易。`);
  if(!asset||asset==='ETH')prompt('制定 ETH 买入计划','10 USDC 起，准备真实现货交易','我想制定 ETH 主网现货买入计划。请简述主要风险，让我选择 10 USDC 小额体验、50 USDC 或自定义金额，不代表我已授权下单。');
  else prompt(`整理 ${ticker} 观察计划`,'保留当前标的，不替换成 ETH',`把 ${ticker} 的分析整理为观察计划，列出需要确认的指标；只研究，不转成 ETH 交易。`);
 }
 return {stage,asset,budget,wantsPlan,choices,title:stage==='funds'?'计划已整理，下一步准备真实资金':stage==='plan'&&asset==='ETH'?'这次准备买入多少 ETH？':'接下来，你想了解什么？'};
}
export function fundingState(wallet,budget=10){
 if(!wallet?.connected)return {kind:'connect',title:'连接交易钱包',body:'连接 Rabby、MetaMask 或 OKX Wallet，读取同一地址的主网现货账户。',action:'选择交易钱包'};
 if(wallet.kind==='embedded')return {kind:'external',title:'选择可在官网使用的交易钱包',body:'当前 Oasis 账号钱包可接收资产，尚不能直接连接 Hyperliquid 官网。此交易流程请使用 Rabby、MetaMask 或 OKX Wallet，并在官网连接同一地址。',action:'连接外部交易钱包'};
 if(wallet.network!=='hyperliquid-mainnet'||wallet.status!=='ready'||!Number.isFinite(wallet.available))return {kind:'check',title:'检查主网交易资金',body:wallet.status==='error'?'余额读取失败，请刷新；这不代表余额为零。':'先读取 Hyperliquid 主网现货可用 USDC，再判断是否需要入金。',action:'检查钱包与余额'};
 if(wallet.available<budget)return {kind:'fund',title:'准备主网交易资金',body:`Hyperliquid 现货可用 ${wallet.available} USDC，本次预算 ${budget} USDC，费用另计。钱包余额与交易账户不同，请到官网核对入金网络及金额。`,action:'到官网充值交易账户'};
 return {kind:'ready',title:'已读取主网现货资金',body:`Hyperliquid 现货可用 ${wallet.available} USDC，本次预算 ${budget} USDC。最终数量、最低金额、手续费及成交结果由官网复核。`,action:'确认 ETH 买入计划'};
}
