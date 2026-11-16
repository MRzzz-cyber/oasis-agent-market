import {account} from './auth.js';
import {validateEvent,metricFilters,summarizeEvents,prometheus,otlpLogs} from './harness-events.js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
async function user(request,env){if(!env.ACCOUNTS)return null;try{const r=await account(request,env);if(!r.ok)return null;const u=await r.json();return u.active?u:null;}catch{return null;}}
const store=env=>env.HARNESS_METRICS.get(env.HARNESS_METRICS.idFromName('harness-metrics-v1'));
async function append(env,owner,events,source){return store(env).fetch('https://internal/events',{method:'POST',body:JSON.stringify({op:'append',owner,events,source})});}
async function sameSecret(a,b){if(typeof b!=='string'||b.length<32||typeof a!=='string'||a.length>512)return false;const [x,y]=await Promise.all([hash(a),hash(b)]);let mismatch=0;for(let i=0;i<x.length;i++)mismatch|=x.charCodeAt(i)^y.charCodeAt(i);return mismatch===0;}
export async function adminAllowed(request,env,{allowReadToken=false}={}){
 if(allowReadToken){const authorization=request.headers.get('authorization')||'';if(authorization.startsWith('Bearer ')&&await sameSecret(authorization.slice(7),env.OASIS_METRICS_READ_TOKEN))return {ok:true};}
 const current=await user(request,env);if(!current)return {ok:false,status:401,error:'请先在首页使用 Google 登录已激活账号'};
 const admins=String(env.OASIS_ADMIN_EMAILS||'').split(/[\s,;]+/).map(v=>v.trim().toLowerCase()).filter(Boolean);
 if(!admins.length)return {ok:false,status:503,error:'后台管理员尚未配置：请设置 OASIS_ADMIN_EMAILS'};
 if(!admins.includes(String(current.email||'').toLowerCase()))return {ok:false,status:403,error:'此账号没有后台查看权限'};
 return {ok:true};
}
export class HarnessMetricsStore{
 constructor(ctx){this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS harness_events(owner TEXT NOT NULL, source TEXT NOT NULL, id TEXT NOT NULL, task_id TEXT NOT NULL, type TEXT NOT NULL, event TEXT NOT NULL, occurred_at INTEGER NOT NULL, received_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,source,id))');this.sql.exec('CREATE INDEX IF NOT EXISTS harness_event_time ON harness_events(occurred_at)');this.sql.exec('CREATE TABLE IF NOT EXISTS harness_limits(owner TEXT PRIMARY KEY, window INTEGER NOT NULL, used INTEGER NOT NULL)');}
 async fetch(request){let input;try{input=await request.json();}catch{return json({error:'内部请求无效'},400);}const now=Date.now();if(input.op==='append'){
  if(!/^[a-f0-9]{64}$/.test(input.owner||'')||!['server','client'].includes(input.source)||!Array.isArray(input.events)||!input.events.length||input.events.length>20)return json({error:'事件批次无效'},400);
  let events;try{events=input.events.map(e=>validateEvent(e,now));}catch(e){return json({error:e.message},400);}
  if(input.source==='client'){const minute=Math.floor(now/60000),[limit]=this.sql.exec('SELECT window, used FROM harness_limits WHERE owner=?',input.owner).toArray(),used=limit?.window===minute?limit.used:0;if(used+events.length>240)return json({error:'采集频率过高'},429);this.sql.exec('INSERT INTO harness_limits VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET window=excluded.window,used=excluded.used',input.owner,minute,used+events.length);}
  for(const event of events)this.sql.exec('INSERT OR IGNORE INTO harness_events VALUES(?,?,?,?,?,?,?,?,?)',input.owner,input.source,event.id,event.taskId,event.type,event.event,event.at,now,JSON.stringify(event));
  this.sql.exec('DELETE FROM harness_events WHERE occurred_at<?',now-90*86400000);this.sql.exec('DELETE FROM harness_limits WHERE window<?',Math.floor(now/60000)-2);return json({ok:true});
 }
 if(input.op==='snapshot'){let filter;try{filter=metricFilters(new URL(input.url),now);}catch{return json({error:'筛选条件无效'},400);}const values=this.sql.exec('SELECT owner,source,payload,received_at FROM harness_events WHERE occurred_at>=? AND occurred_at<=? AND source=? ORDER BY occurred_at DESC LIMIT 20001',filter.since,filter.until,filter.source).toArray(),truncated=values.length>20000,rows=values.slice(0,20000).map(r=>({...JSON.parse(r.payload),owner:r.owner,source:r.source,receivedAt:r.received_at}));const selected=rows.filter(r=>filter.type==='all'||r.type===filter.type);return json({snapshot:summarizeEvents(rows,filter,{truncated,now}),...(input.format==='otlp'?{otlp:otlpLogs(selected)}:{})});}
 return json({error:'内部接口不存在'},404);}
}
export async function harnessMetricsRoute(request,env){const url=new URL(request.url),ingest=url.pathname==='/api/harness/events';
 if(ingest){if(request.method!=='POST')return json({error:'仅支持 POST'},405);if(request.headers.get('origin')!==url.origin)return json({error:'请求来源无效'},403);const current=await user(request,env);if(!current)return json({error:'请先登录激活账号'},401);if(!env.HARNESS_METRICS)return json({error:'指标存储尚未启用'},503);if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'需要 JSON 事件'},415);
  let payload;try{const raw=await request.text();if(new TextEncoder().encode(raw).length>16384)return json({error:'事件批次过大'},413);payload=JSON.parse(raw);if(!payload||Object.keys(payload).some(k=>k!=='events')||!Array.isArray(payload.events)||payload.events.length<1||payload.events.length>20)throw Error();payload.events.forEach(e=>validateEvent(e));}catch{return json({error:'事件格式无效'},400);}
  return append(env,await hash('oasis-harness:'+current.id),payload.events,'client');
 }
 if(request.method!=='GET')return json({error:'后台指标为只读接口'},405);const format=url.pathname==='/api/admin/metrics/prometheus'?'prometheus':url.searchParams.get('format')==='otlp'?'otlp':'json',allowed=await adminAllowed(request,env,{allowReadToken:format==='prometheus'});if(!allowed.ok)return json({error:allowed.error},allowed.status);if(!env.HARNESS_METRICS)return json({error:'指标存储尚未启用，请部署 HARNESS_METRICS 绑定与迁移'},503);
 let result;try{metricFilters(url);const r=await store(env).fetch('https://internal/snapshot',{method:'POST',body:JSON.stringify({op:'snapshot',url:url.href,format})});if(!r.ok)return r;result=await r.json();}catch{return json({error:'指标暂不可用'},502);}
 if(format==='prometheus')return new Response(prometheus(result.snapshot),{headers:{...headers,'content-type':'text/plain; version=0.0.4; charset=utf-8'}});
 if(format==='otlp')return json(result.otlp);return json(result.snapshot);
}
function makeTask(type){const taskId=crypto.randomUUID(),traceId=taskId.replaceAll('-',''),spanId=crypto.randomUUID().replaceAll('-','').slice(0,16);return {taskId,traceId,spanId,type};}
export async function observeHarnessRequest(request,env,ctx,type,run){
 if(!env.HARNESS_METRICS)return run();const current=await user(request,env);if(!current)return run();const owner=await hash('oasis-harness:'+current.id),task=makeTask(type),start=Date.now();
 const send=async events=>{try{await append(env,owner,events,'server');}catch{}};
 const event=(name,code='none')=>({version:1,id:task.taskId+':'+name, ...task,event:name,at:Date.now(),stage:'request',code});
 const initial=event('task.started');initial.at=start;const scheduled=send([initial]);if(ctx?.waitUntil)ctx.waitUntil(scheduled);
 let result;try{result=await run();}catch(error){const pending=send([event('task.failed','http_error')]);if(ctx?.waitUntil)ctx.waitUntil(pending);else await pending;throw error;}
 const finish=async(name,code='none')=>send([event(name,code)]);
 if(type!=='advisor'||!result.ok||!result.body){const promise=finish(result.ok?'task.succeeded':'task.failed',result.ok?'none':'http_error');if(ctx?.waitUntil)ctx.waitUntil(promise);else await promise;return result;}
 // Observe the normalized visible SSE without retaining prompts, response text or credentials.
 const reader=result.body.getReader(),decoder=new TextDecoder();let buffer='',visible=false,complete=false,failed=false,done=false;
 function inspect(text){buffer+=text;if(buffer.length>65536){failed=true;buffer='';return;}const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';for(const line of lines){if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(raw==='[DONE]'){complete=true;continue;}try{const chunk=JSON.parse(raw);if(chunk.error)failed=true;const content=chunk.choices?.[0]?.delta?.content;if(typeof content==='string'&&content.trim())visible=true;}catch{}}}
 async function settle(name,code){if(done)return;done=true;const pending=finish(name,code);if(ctx?.waitUntil)ctx.waitUntil(pending);await pending;}
 const body=new ReadableStream({async pull(controller){try{const r=await reader.read();if(r.done){inspect(decoder.decode()+'\n');await settle(!failed&&complete&&visible?'task.succeeded':'task.failed',failed?'stream_error':!complete||!visible?'stream_incomplete':'none');controller.close();return;}inspect(decoder.decode(r.value,{stream:true}));controller.enqueue(r.value);}catch(error){await settle('task.failed','stream_error');controller.error(error);}},async cancel(reason){await settle('task.cancelled','user_cancelled');await reader.cancel(reason);}});
 return new Response(body,{status:result.status,statusText:result.statusText,headers:result.headers});
}
