// Deterministic UI choices use user intent, never model-generated actions or balances.
export function conversationGuide(conversation) {
 const users=conversation.filter(m=>m.role==='user').map(m=>String(m.content));
 let asset=null,budget=null,wantsPlan=false;
 for(const text of users){
  const intent=text.split(/行情上下文/)[0];
  const coin=intent.match(/\b(BTC|ETH|SOL|HYPE|XRP|BNB)\b/i)?.[1];
  const nextAsset=coin?.toUpperCase() || (intent.includes('以太坊')?'ETH':intent.includes('比特币')?'BTC':null);
  if(nextAsset&&nextAsset!==asset){asset=nextAsset;budget=null;}
  if(/调整|重新选择/.test(intent))budget=null;
  if(/买入|想买|购入|交易计划|买入计划|测试交易|测试预算|测试金额/.test(intent))wantsPlan=true;
  if(/不买了|取消(?:交易|买入|计划)|只(?:想)?研究|暂不(?:交易|买入)/.test(intent)){wantsPlan=false;budget=null;}
  const amount=intent.match(/(?:本次|这次)测试(?:金额|预算)(?:上限)?[：:\s]*(\d+(?:\.\d{1,2})?)\s*(?:测试\s*)?USDC/i);
  if(amount){const n=Number(amount[1]);budget=n>=10&&n<=1000?n:null;}
 }
 const stage=budget&&asset==='ETH'&&wantsPlan?'funds':wantsPlan?'plan':'research';
 const ticker=asset||'当前标的';
 const choices=[];
 const prompt=(title,description,text)=>choices.push({kind:'prompt',title,description,text});
 if(stage==='funds'){
  choices.push({kind:'funds',title:'检查钱包与测试资金',description:'先核对账户余额，再决定是否补充'});
  choices.push({kind:'preview',title:'预览 ETH 测试订单',description:`上限 ${budget} 测试 USDC · 提交前单独确认`});
  prompt('调整金额或计划','重新选择本次测试预算',`我想调整 ${ticker} 的测试交易计划，请先列出我需要确认的金额和风险，不执行交易。`);
 }else if(stage==='plan'&&asset==='ETH'){
  for(const amount of [20,50,100])prompt(`${amount} 测试 USDC`,'选择预算，先讨论再预览',`本次测试预算 ${amount} 测试 USDC，只用于 Hyperliquid 测试网 ETH 现货买入。请简要总结计划与风险，不代表我已授权下单。`);
  prompt('先看风险','暂不选择测试金额',`先解释 ${ticker} 计划可能失败的情形，以及什么情况下应该暂停；暂不执行交易。`);
 }else{
  prompt('继续分析走势','补充证据与不同情景',`继续分析 ${ticker}：列出上涨、下跌、横盘三种情景与确认信号，说明缺少的数据，不执行交易。`);
  prompt('检查风险','了解反例与暂停条件',`检查 ${ticker} 当前判断的风险、反例和暂停条件，不执行交易。`);
  if(!asset||asset==='ETH')prompt('制定 ETH 测试计划','先选预算，再准备测试资金','我想制定 ETH 测试网买入计划。请先简述流程，让我选择本次测试预算，不执行交易。');
  else prompt(`整理 ${ticker} 观察计划`,'当前交易执行仅支持 ETH 测试网',`把 ${ticker} 的分析整理为观察计划，列出需要确认的指标；只研究，不转成 ETH 交易。`);
 }
 return {stage,asset,budget,wantsPlan,choices,title:stage==='funds'?'计划明确了，下一步准备资金':stage==='plan'&&asset==='ETH'?'这次想用多少测试资金？':'接下来，你想了解什么？'};
}
export function fundingState(wallet,budget=20){
 if(wallet?.network==='hyperliquid-mainnet')return {kind:'mainnet',title:'正式网资产与测试计划分开',body:'当前钱包面板读取正式网资产。本对话仍为测试订单流程，不会把正式余额用于测试网订单。',action:'查看正式网资产'};
 if(!wallet?.connected)return {kind:'connect',title:'准备交易钱包',body:'连接钱包后核对测试网现货余额。当前尚未读取你的余额。',action:'连接钱包，检查资金'};
 if(wallet.status!=='ready')return {kind:'check',title:'检查可用测试资金',body:wallet.status==='error'?'余额读取失败，请重试；这不代表余额为零。':'先读取 Hyperliquid 测试网 Spot 余额，再判断是否需要补充资金。',action:'检查钱包余额'};
 if(wallet.available<budget)return {kind:'fund',title:'补充测试资金',body:`现货可用 ${wallet.available} 测试 USDC，当前预算 ${budget}；还需至少 ${Math.max(0,budget-wallet.available).toFixed(2)} 测试 USDC，费用另计。`,action:'领取或划转测试资金'};
 return {kind:'ready',title:'测试资金已就绪',body:`现货可用 ${wallet.available} 测试 USDC，可继续预览 ${budget} 测试 USDC 的订单；费用和最终数量以预览为准。`,action:'预览测试订单'};
}
