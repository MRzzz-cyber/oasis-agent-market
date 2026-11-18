// All advisor models share the same user-controlled mainnet journey.
// Only user messages advance intent; model prose never authorizes a trade.
export function tradeBudget(value){const text=String(value);if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)||Number(text)<10)throw Error('请输入至少 10 USDC，最多两位小数；费用另计');return Number(text);}
export function conversationGuide(conversation){
 const users=conversation.filter(m=>m.role==='user').map(m=>String(m.content));let asset=null,budget=null,wantsPlan=false;
 for(const text of users){const intent=text.split(/行情上下文/)[0];const coin=intent.match(/\b(BTC|ETH|SOL|HYPE|XRP|BNB)\b/i)?.[1];const nextAsset=coin?.toUpperCase()||(intent.includes('以太坊')?'ETH':intent.includes('比特币')?'BTC':null);if(nextAsset&&nextAsset!==asset){asset=nextAsset;budget=null;}
  if(/调整|重新选择|change (?:the )?(?:amount|budget)|reset budget/i.test(intent))budget=null;
  if(/测试网|测试(?:预算|金额|资金)|测试\s*USDC|\btestnet\b|test funds|模拟(?:买入|交易|订单|策略)|simulated (?:purchase|trade|order|strategy)/i.test(intent)){budget=null;wantsPlan=false;continue;}
  if(/买入|想买|购入|交易计划|买入计划|\bbuy\b|\bpurchase\b|buying plan|trading plan/i.test(intent))wantsPlan=true;
  if(/不买了|取消(?:交易|买入|计划)|只(?:想)?研究|暂不(?:交易|买入)|cancel (?:the )?(?:trade|purchase|plan)|(?:do not|don't) (?:buy|trade)|research only|only research/i.test(intent)){wantsPlan=false;budget=null;continue;}
  const amount=intent.match(/(?:本次|这次)(?:买入|交易)?(?:金额|预算)(?:上限)?[：:\s]*(\d{1,9}(?:\.\d{1,2})?)(?![\d.])\s*(?:USDC|U)(?![A-Za-z])/i);const direct= !/不买|取消|模拟|假设|比如|例如|测试|do not|don't|cancel|simulat|hypothetical|for example|test/i.test(intent)&&intent.match(/(?:买入?|购入|预算|金额)[：:\s]*(\d{1,9}(?:\.\d{1,2})?)(?![\d.])\s*(?:USDC|U)(?![A-Za-z])/i);const english=!/do not|don't|cancel|simulat|hypothetical|for example|test/i.test(intent)&&intent.match(/(?:buy|purchase|budget|spend)\s+(\d{1,9}(?:\.\d{1,2})?)(?![\d.])\s*USDC\b/i);if(amount||direct||english){try{budget=tradeBudget((amount||direct||english)[1]);}catch{budget=null;}}
 }
 const stage=budget&&asset==='ETH'&&wantsPlan?'funds':wantsPlan?'plan':'research',ticker=asset||'当前标的',choices=[];
 const prompt=(title,description,text)=>choices.push({kind:'prompt',title,description,text});
 if(stage==='funds'){
  choices.push({kind:'preview',title:'站内预览 ETH 订单',description:`${budget} USDC · 主网现货 · 费用另计`});
  choices.push({kind:'funds',title:'准备钱包与交易资金',description:'核对真实余额，按需充值'});
  prompt('调整金额或计划','重新选择预算',`我想调整 ${ticker} 的主网现货买入计划，请先让我重新选择金额，不执行交易。`);
 }else if(stage==='plan'&&asset==='ETH'){
  choices.push({kind:'budget',amount:10,title:'10 USDC 小额体验',description:'真实资金 · 费用另计'});
  choices.push({kind:'budget',amount:50,title:'50 USDC',description:'站内预览，单独确认买入'});
  choices.push({kind:'custom',title:'自定义金额',description:'填写本次买入预算'});
  prompt('先看风险','继续研究，暂不准备资金',`先解释 ${ticker} 计划可能失败的情形和暂停条件，暂不交易，只研究风险。`);
 }else{
  prompt('继续分析走势','补充证据与不同情景',`继续分析 ${ticker}：列出上涨、下跌、横盘三种情景与确认信号，说明缺少的数据，不执行交易。`);
  prompt('检查风险','了解反例与暂停条件',`检查 ${ticker} 当前判断的风险、反例和暂停条件，不执行交易。`);
  prompt('整理可复盘的策略草案','明确触发、风险与退出规则',`把 ${ticker} 的分析整理为模拟策略草案，列出需要确认的指标、触发条件、风险上限和退出规则。只研究，不执行交易。`);
 }
 return {stage,asset,budget,wantsPlan,choices,title:stage==='funds'?'金额已选择，进入站内交易':stage==='plan'&&asset==='ETH'?'这次准备买入多少 ETH？':'接下来，你想了解什么？'};
}
export function fundingState(wallet,budget=10){
 if(!wallet?.connected)return {kind:'connect',title:'选择交易钱包',body:'创建 Oasis 账号钱包，或连接 Rabby、MetaMask、OKX 等已有钱包。',action:'选择钱包'};
 if(wallet.network!=='hyperliquid-mainnet'||wallet.status!=='ready'||!Number.isFinite(wallet.available))return {kind:'check',title:'检查主网现货资金',body:wallet.status==='error'?'余额读取失败，请刷新；这不代表余额为零。':'先读取 Hyperliquid 主网现货可用 USDC。',action:'预览订单与资金'};
 if(wallet.available<budget)return {kind:'fund',title:'准备现货交易资金',body:`Hyperliquid 现货可用 ${wallet.available} USDC，本次预算 ${budget} USDC，费用另计。钱包收款不会自动入金现货账户。`,action:'查看资金准备方式'};
 return {kind:'ready',title:'可以预览主网订单',body:`Hyperliquid 现货可用 ${wallet.available} USDC，本次预算 ${budget} USDC。站内重新核对盘口、精度与费用预留，用户单独确认下单。`,action:'站内预览 ETH 订单'};
}
