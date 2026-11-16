export const TASK_TYPES=['wallet_swap','prediction_search','prediction_quote','advisor'];
export const EVENTS=['task.started','quote.ready','funds.insufficient','wallet.confirmation_requested','submission.started','order.pending','task.succeeded','task.failed','task.cancelled','recovery.required','recovery.completed','guard.blocked'];
export const CODES=['none','rpc_timeout','fee_unavailable','insufficient_usdc','insufficient_eth','receipt_mismatch','unknown_submission','user_cancelled','validation_failed','duplicate_submission','wallet_changed','network_changed','http_error','stream_error','stream_incomplete'];
const FIELDS=['version','id','taskId','traceId','spanId','type','event','at','stage','code'];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateEvent(value,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!FIELDS.includes(k)))throw Error('事件包含不支持的字段');
 if(value.version!==1||typeof value.id!=='string'||!(/^[a-zA-Z0-9_.:-]{1,160}$/).test(value.id)||!UUID.test(value.taskId||'')||!(/^[a-f0-9]{32}$/).test(value.traceId||'')||/^0+$/.test(value.traceId)||!(/^[a-f0-9]{16}$/).test(value.spanId||'')||/^0+$/.test(value.spanId))throw Error('事件标识无效');
 if(!TASK_TYPES.includes(value.type)||!EVENTS.includes(value.event)||!CODES.includes(value.code||'none')||!['request','quote','approval','swap','receipt','network'].includes(value.stage))throw Error('事件类别无效');
 if(!Number.isSafeInteger(value.at)||value.at<now-7*86400000||value.at>now+60000)throw Error('事件时间超出可采集范围');
 return {...value,code:value.code||'none'};
}
export function metricFilters(url,now=Date.now()){
 const days=Number(url.searchParams.get('days')||7),type=url.searchParams.get('type')||'all',source=url.searchParams.get('source')||'server';
 if(![1,7,30,90].includes(days)||!['all',...TASK_TYPES].includes(type)||!['server','client'].includes(source))throw Error('筛选条件无效');
 return {days,type,source,since:now-days*86400000,until:now};
}
const day=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
const percentile=(values,q)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)]:null;
export function summarizeEvents(rows,filter,{truncated=false,now=Date.now()}={}){
 const selected=rows.filter(r=>r.source===filter.source&&(filter.type==='all'||r.type===filter.type)&&r.at>=filter.since&&r.at<=filter.until),groups=new Map();
 for(const r of selected){const key=[r.owner,r.source,r.type,r.taskId].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 let started=0,succeeded=0,failed=0,cancelled=0,pending=0,requiresRecovery=0,recovered=0,confirmations=0,orphanTasks=0;const durations=[],firstOwners=new Map(),daily=new Map(),errors=new Map(),guards=new Map(),funnel=new Map(),recent=[],byType=new Map();
 for(const events of groups.values()){
  events.sort((a,b)=>a.at-b.at||a.receivedAt-b.receivedAt);const begin=events.find(e=>e.event==='task.started');if(!begin){orphanTasks++;continue;}
  started++;const days=daily.get(day(begin.at))||{day:day(begin.at),started:0,succeeded:0,failed:0};days.started++;daily.set(days.day,days);const typeRow=byType.get(begin.type)||{type:begin.type,started:0,succeeded:0,failed:0};typeRow.started++;byType.set(begin.type,typeRow);
  const types=new Set(events.map(e=>e.event));for(const name of ['task.started','quote.ready','wallet.confirmation_requested','submission.started','task.succeeded'])if(types.has(name))funnel.set(name,(funnel.get(name)||0)+1);
  const terminal=events.filter(e=>['task.succeeded','task.failed','task.cancelled'].includes(e.event)).at(-1);let state='pending',duration=null;
  if(terminal?.event==='task.succeeded'){succeeded++;days.succeeded++;typeRow.succeeded++;state='succeeded';duration=Math.max(0,terminal.at-begin.at);durations.push(duration);}else if(terminal?.event==='task.failed'){failed++;days.failed++;typeRow.failed++;state='failed';}else if(terminal?.event==='task.cancelled'){cancelled++;state='cancelled';}else pending++;
  // A normal failed request has no linked retry yet. Only explicit unresolved tasks enter recovery denominators.
  const recovery=events.find(e=>e.event==='recovery.required');if(recovery){requiresRecovery++;if(events.some(e=>e.at>=recovery.at&&['recovery.completed','task.succeeded'].includes(e.event)))recovered++;if(!terminal)state='reconciliation_required';}
  const requests=events.filter(e=>e.event==='wallet.confirmation_requested').length;confirmations+=requests;
  for(const e of events){if(e.event==='task.failed'||e.event==='recovery.required')errors.set(e.code,(errors.get(e.code)||0)+1);if(e.event==='guard.blocked')guards.set(e.code,(guards.get(e.code)||0)+1);}
  if(begin.type==='wallet_swap'){const owner=firstOwners.get(begin.owner)||{start:begin.at,success:null};owner.start=Math.min(owner.start,begin.at);if(terminal?.event==='task.succeeded')owner.success=owner.success==null?terminal.at:Math.min(owner.success,terminal.at);firstOwners.set(begin.owner,owner);}
  recent.push({taskId:begin.taskId,traceId:begin.traceId,type:begin.type,source:begin.source,start:begin.at,updatedAt:events.at(-1).at,state,durationMs:duration,confirmationRequests:requests,events:events.map(e=>({event:e.event,at:e.at,stage:e.stage,code:e.code}))});
 }
 const firstDurations=[...firstOwners.values()].filter(o=>o.success!=null).map(o=>Math.max(0,o.success-o.start));
 return {version:1,generatedAt:now,filter,coverage:{truncated,orphanTasks,events: selected.length,historyBackfilled:false,source:filter.source,trust:filter.source==='server'?'服务端接口与流式结果观测':'浏览器上报，未经服务端独立链上核验',note:'仅覆盖采集启用后的事件；客户端可能因断网或拦截漏报。时间分桶为北京时间。'},metrics:{started,succeeded,failed,cancelled,pending,completionRate:started?succeeded/started:null,recoveryRate:requiresRecovery?recovered/requiresRecovery:null,requiresRecovery,recovered,confirmationRequests:confirmations,averageConfirmationRequests:started?confirmations/started:null,durationP50Ms:percentile(durations,.5),durationP95Ms:percentile(durations,.95),durationSamples:durations.length,firstTradeP50Ms:percentile(firstDurations,.5),firstTradeSamples:firstDurations.length,duplicateGuards:guards.get('duplicate_submission')||0,identityGuards:(guards.get('wallet_changed')||0)+(guards.get('network_changed')||0),wrongExecutionCount:null},daily:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)),byType:[...byType.values()],errors:[...errors].map(([code,count])=>({code,count})).sort((a,b)=>b.count-a.count),guards:[...guards].map(([code,count])=>({code,count})),funnel:[...funnel].map(([event,count])=>({event,count})),recent:recent.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,40)};
}
export function prometheus(snapshot){const {metrics:m,filter:f}=snapshot,labels='{source="'+f.source+'",task_type="'+f.type+'",window_days="'+f.days+'"}',lines=['# Oasis windowed metrics. Counts are gauges, not lifetime counters.'];for(const [name,value]of Object.entries({tasks_started:m.started,tasks_succeeded:m.succeeded,tasks_failed:m.failed,tasks_pending:m.pending,completion_ratio:m.completionRate,recovery_ratio:m.recoveryRate,confirmation_requests:m.confirmationRequests,duplicate_guards:m.duplicateGuards,duration_p50_seconds:m.durationP50Ms==null?null:m.durationP50Ms/1000,duration_p95_seconds:m.durationP95Ms==null?null:m.durationP95Ms/1000})){if(value==null)continue;lines.push('# TYPE oasis_'+name+' gauge','oasis_'+name+labels+' '+value);}return lines.join('\n')+'\n';}
export function otlpLogs(rows){return {resourceLogs:[{resource:{attributes:[{key:'service.name',value:{stringValue:'oasis-harness'}}]},scopeLogs:[{scope:{name:'oasis.harness',version:'1'},logRecords:rows.slice(-1000).map(e=>({timeUnixNano:(BigInt(e.at)*1000000n).toString(),observedTimeUnixNano:(BigInt(e.receivedAt)*1000000n).toString(),traceId:e.traceId,spanId:e.spanId,severityNumber:e.event==='task.failed'?17:9,severityText:e.event==='task.failed'?'ERROR':'INFO',body:{stringValue:e.event},attributes:[{key:'oasis.task.type',value:{stringValue:e.type}},{key:'oasis.evidence.source',value:{stringValue:e.source}},{key:'oasis.error.code',value:{stringValue:e.code}}]}))}]}]};}
