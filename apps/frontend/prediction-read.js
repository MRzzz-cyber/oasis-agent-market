// Public market GETs only. Never use snapshots or retries for signing or execution.
export const SNAPSHOT_MAX_AGE=300000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function readPredictionJSON(url,{fetchImpl=fetch,signal,timeoutMs=12000,headers={},retryInvalidJSON=true,wait=pause}={}){
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  try{
   const signals=[AbortSignal.timeout(timeoutMs)];if(signal)signals.push(signal);
   const r=await fetchImpl(url,{method:'GET',cache:'no-store',redirect:'manual',headers:{accept:'application/json',...headers},signal:AbortSignal.any(signals)});
   if(r.status>=300&&r.status<400)throw Object.assign(Error('平台接口地址异常，请稍后重试'),{code:'redirect',retryable:false});
   let data;try{data=await r.json();}catch(error){if(['TimeoutError','AbortError'].includes(error?.name))throw error;throw Object.assign(Error('盘口服务返回异常，请重试连接'),{code:'format',status:r.status,retryable:r.status>=500||r.ok&&retryInvalidJSON});}
   if(!r.ok){const detail=data?.error||data?.providers?.find(p=>p.error)?.error;throw Object.assign(Error(typeof detail==='string'?detail.slice(0,180):'盘口服务暂不可用，请重试连接'),{status:r.status,retryable:r.status>=500});}
   return data;
  }catch(error){if(signal?.aborted)throw signal.reason||error;if(attempt||error.retryable===false||error.status&&error.status<500&&!error.retryable)throw error;await wait(200);}
 }
}
export function predictionSnapshotCache({freshMs=20000,maxAge=SNAPSHOT_MAX_AGE,limit=32}={}){
 const snapshots=new Map(),pending=new Map();
 return {async read(key,load,{now=Date.now,usable=()=>true}={}){
  const tick=now();for(const [k,s]of snapshots)if(tick<s.savedAt||tick-s.savedAt>maxAge)snapshots.delete(k);
  const previous=snapshots.get(key);if(previous&&tick-previous.savedAt<freshMs)return previous.value;
  if(pending.has(key))return pending.get(key);
  if(pending.size>=limit)throw Error('盘口查询繁忙，请稍后重试');
  const work=(async()=>{
   let value,failure;try{value=await load();if(usable(value)){snapshots.delete(key);snapshots.set(key,{value,savedAt:tick});while(snapshots.size>limit)snapshots.delete(snapshots.keys().next().value);return value;}}catch(error){failure=error;}
   const fallback=snapshots.get(key),age=fallback?now()-fallback.savedAt:Infinity;
   if(fallback&&age>=0&&age<=maxAge)return {...fallback.value,stale:true,warning:'平台暂时不可用，展示上次快照；买入前重新核对实时价格'};
   if(failure)throw failure;return value;
  })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
 }};
}
