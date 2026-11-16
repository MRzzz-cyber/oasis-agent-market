// Best-effort first-party operational telemetry. Never stores prompts, signatures or wallet addresses remotely.
let queued=[],timer=null;
function enqueue(event){queued.push(event);if(queued.length>80)queued.shift();if(timer==null)timer=setTimeout(flush,300);}
function flush(){timer=null;const events=queued.splice(0,20);if(!events.length)return;try{Promise.resolve(fetch('/api/harness/events',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({events}),keepalive:true})).catch(()=>{});}catch{}if(queued.length)timer=setTimeout(flush,300);}
const key=id=>'oasis-harness-metric:'+id;
const read=id=>{try{const v=JSON.parse(localStorage.getItem(key(id)));return v&&v.version===1&&typeof v.taskId==='string'&&Array.isArray(v.emitted)?v:null;}catch{return null;}};
function create(){const taskId=crypto.randomUUID();return {version:1,taskId,traceId:taskId.replaceAll('-',''),spanId:crypto.randomUUID().replaceAll('-','').slice(0,16),emitted:[],records:[],lastAt:0,terminal:false};}
function persist(task){for(const id of task.records)try{localStorage.setItem(key(id),JSON.stringify(task));}catch{}}
function emit(task,event,{stage='swap',code='none',dedupe=event}={}){if(task.emitted.includes(dedupe))return;task.emitted.push(dedupe);task.lastAt=Math.max(Date.now(),task.lastAt+1);persist(task);enqueue({version:1,id:task.taskId+':'+dedupe,taskId:task.taskId,traceId:task.traceId,spanId:task.spanId,type:'wallet_swap',event,at:task.lastAt,stage,code});}
function codeFor(error){if(error?.code===4001)return 'user_cancelled';if(error?.code==='RPC_TIMEOUT')return 'rpc_timeout';const message=String(error?.message||'');if(/日志|回执.*不匹配/.test(message))return 'receipt_mismatch';if(/账户|钱包已变化/.test(message))return 'wallet_changed';if(/切换|网络已变化/.test(message))return 'network_changed';if(/不能重复|再次提交|另一个页面|有原交易待核对/.test(message))return 'duplicate_submission';return 'validation_failed';}
export function swapMetrics(){let active=null;
 const safe=fn=>(...args)=>{try{return fn(...args);}catch{return undefined;}};
 function observe(record){if(!record?.id)return;const known=read(record.id);if(known&&(!active||known.taskId!==active.taskId))active=known;if(!active)return;if(!active.records.includes(record.id)){if(record.status!=='pending'||record.hash)return;active.records.push(record.id);persist(active);}if(active.terminal)return;const stage=record.kind==='approval'?'approval':'swap';
  if(record.status==='pending'&&!record.hash)emit(active,'wallet.confirmation_requested',{stage,dedupe:'confirmation:'+record.id});
  if(record.hash){emit(active,'submission.started',{stage,dedupe:'submitted:'+record.id});emit(active,'order.pending',{stage,dedupe:'pending:'+record.id});}
  if(record.status==='unknown')emit(active,'recovery.required',{stage:'receipt',code:'unknown_submission',dedupe:'recovery:'+record.id});
  if(record.kind==='swap'&&record.status==='filled'){if(active.emitted.some(e=>e.startsWith('recovery:')))emit(active,'recovery.completed',{stage:'receipt'});emit(active,'task.succeeded',{stage:'receipt'});active.terminal=true;persist(active);}
  else if(record.status==='cancelled'){emit(active,'task.cancelled',{stage,code:'user_cancelled'});active.terminal=true;persist(active);}
  else if(record.status==='reverted'){emit(active,'task.failed',{stage:'receipt',code:'validation_failed'});active.terminal=true;persist(active);}
 }
 return {start:safe(()=>{active=create();emit(active,'task.started',{stage:'quote'});emit(active,'quote.ready',{stage:'quote'});}),observe:safe(observe),failure:safe((error,held)=>{if(!active&&held?.id)active=read(held.id);if(!active||active.terminal)return;const code=codeFor(error);if(['duplicate_submission','wallet_changed','network_changed'].includes(code))emit(active,'guard.blocked',{code,dedupe:'guard:'+code});if(held?.terminal===false)emit(active,'recovery.required',{stage:'receipt',code,dedupe:'recovery:'+held.id});else{emit(active,code==='user_cancelled'?'task.cancelled':'task.failed',{code,stage:'swap'});active.terminal=true;persist(active);}})};
}
