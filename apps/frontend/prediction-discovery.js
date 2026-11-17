// Discovery uses public metadata only; similarity never authorizes or routes an order.
const stop=new Set('will would the a an is are be been to of in on at by for from with and or before after above below than this that happen'.split(' '));
export function searchTerms(value){
 const raw=String(value||'').normalize('NFKC').toLowerCase().replace(/bitcoin|比特币/g,' bitcoin btc ').replace(/ethereum|以太坊/g,' ethereum eth ').replace(/美联储|federal reserve|fomc/g,' fed ').replace(/人工智能/g,' ai ');
 return [...new Set((raw.match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>!stop.has(t)&&t.length>1))].slice(0,32);
}
export function relatedScore(query,value){const a=searchTerms(query),b=new Set(searchTerms(value));return a.filter(t=>b.has(t)).length/Math.max(1,a.length);}
export function discoveryQuery(market){return searchTerms(market.eventTitle||market.question).filter(t=>!/^\d+$/.test(t)).slice(0,5).join(' ').slice(0,120)||String(market.question).slice(0,120);}
export function matchAssessment(source,candidate){
 if(source.provider===candidate.provider&&source.id===candidate.id)return {status:'source',label:'你选择的盘口',differences:[]};
 const differences=[];
 if(!source.endDate||!candidate.endDate||Date.parse(source.endDate)!==Date.parse(candidate.endDate))differences.push('截止时间不同或待核实');
 if(!source.description||!candidate.description||source.description.trim()!==candidate.description.trim())differences.push('结算规则需要分别核对');
 if(source.outcomes?.map(o=>o.label.toLowerCase()).join('|')!==candidate.outcomes?.map(o=>o.label.toLowerCase()).join('|'))differences.push('结果定义可能不同');
 return {status:'related',label:'相关盘口 · 未核验等价',differences: differences.length?differences:['请核对事件范围和结算来源']};
}
export function shuffledMarkets(markets,random=Math.random){const rows=[...new Map(markets.map(m=>[m.provider+':'+m.id,m])).values()];for(let i=rows.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[rows[i],rows[j]]=[rows[j],rows[i]];}return rows;}
export function marketTopic(question){if(/bitcoin|btc|ethereum|crypto|比特币|以太坊/i.test(question))return '加密';if(/nba|nfl|nhl|mlb|soccer|football|league|champion|cup|rebounds|assists|points|win.*game/i.test(question))return '体育';if(/ai\b|openai|gpt|tech|apple|google|spacex/i.test(question))return '科技';if(/fed|inflation|gdp|cpi|rate|recession/i.test(question))return '宏观';return '世界';}
