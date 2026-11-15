// Browser-local conversation records, scoped by the existing account storage key.
export function cleanMessages(messages){return Array.isArray(messages)?messages.filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string'&&m.content.trim()).map(({role,content})=>({role,content})):[];}
export function historyTitle(text){return String(text||'未命名对话').replace(/行情上下文[\s\S]*/,'').replace(/[*#`>]/g,'').replace(/\s+/g,' ').trim().slice(0,56)||'未命名对话';}
export function createConversationStore(storage,key){
 let memory=[],unsaved=false;
 function list(){try{if(unsaved)throw Error();const raw=storage.getItem(key);if(raw!==null){const data=JSON.parse(raw);if(Array.isArray(data))memory=data.filter(x=>typeof x?.id==='string'&&cleanMessages(x.messages).length).map(x=>({...x,messages:cleanMessages(x.messages)}));}}catch{}return memory.map(x=>({...x,messages:cleanMessages(x.messages)})).sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));}
 function save(record){const messages=cleanMessages(record.messages);if(typeof record.id!=='string'||!messages.length)return false;const records=list(),previous=records.find(x=>x.id===record.id),now=new Date().toISOString();const next={id:record.id,title:historyTitle(messages.find(m=>m.role==='user')?.content),goal:String(record.goal||messages[0].content),messages,model:String(record.model||''),modelId:String(record.modelId||''),createdAt:previous?.createdAt||record.createdAt||now,updatedAt:now};if(previous&&['goal','model','modelId','messages'].every(k=>JSON.stringify(previous[k])===JSON.stringify(next[k])))return !unsaved;memory=[next,...records.filter(x=>x.id!==record.id)];try{storage.setItem(key,JSON.stringify(memory));unsaved=false;return true;}catch{unsaved=true;return false;}}
 return {list,save};
}
