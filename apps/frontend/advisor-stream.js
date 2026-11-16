export function advisorRequest({model,messages,system}){return {model,messages:[{role:'system',content:system},...messages],max_tokens:4096,reasoning:{effort:'low',exclude:true},stream:true,stream_options:{include_usage:true}};}
function visible(content){if(typeof content==='string')return content;if(Array.isArray(content))return content.filter(p=>['text','output_text'].includes(p?.type)&&typeof p.text==='string').map(p=>p.text).join('');return '';}
export function normalizeAdvisorStream(upstream){
 const encoder=new TextEncoder();let reader;
 return new ReadableStream({async start(controller){let full='',complete=false,failed=false,finish=null;
  const emit=value=>controller.enqueue(encoder.encode('data: '+(typeof value==='string'?value:JSON.stringify(value))+'\n\n'));
  const fail=message=>{if(failed)return;failed=true;emit({error:{message}});};
  function consume(value){
   if(value==='[DONE]'){complete=true;return;}let chunk;try{chunk=typeof value==='string'?JSON.parse(value):value;}catch{return;}
   if(chunk?.error){fail(typeof chunk.error.message==='string'?chunk.error.message.slice(0,240):'模型服务暂不可用，请重试。钱包交易卡片可独立使用。');return;}
   const choice=chunk?.choices?.[0];if(choice?.finish_reason){finish=choice.finish_reason;complete=true;}
   let text=visible(choice?.delta?.content);if(!text&&choice?.message){const message=visible(choice.message.content)||visible(choice.message.refusal);text=message.startsWith(full)?message.slice(full.length):message;}
   if(text){if(full.length+text.length>12000){fail('模型回复过长，请缩短问题后重试。钱包交易卡片可独立使用。');return;}full+=text;emit({model:chunk.model,choices:[{delta:{content:text}}]});}
   if(chunk?.usage)emit({model:chunk.model,usage:chunk.usage,choices:[]});
  }
  try{
   if((upstream.headers.get('content-type')||'').includes('application/json')){consume(await upstream.json());complete=true;}
   else {reader=upstream.body.getReader();const decoder=new TextDecoder();let buffer='';
    const frame=text=>{const values=text.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart());if(values.length)consume(values.join('\n'));};
    while(!failed){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let match;while((match=/\r?\n\r?\n/.exec(buffer))){const text=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);frame(text);if(failed)break;}}
    buffer+=decoder.decode();if(buffer.trim()&&!failed)frame(buffer);if(failed)await reader.cancel().catch(()=>{});
   }
   if(!failed&&!full.trim())fail(finish==='length'?'模型在生成正式回答前用完了输出额度，请重试或更换模型；不影响钱包报价和交易。':'模型本次未返回可显示的回答，请重试或更换模型；不影响钱包报价和交易。');
   else if(!failed&&!complete)fail('模型连接提前中断，请重试；钱包交易卡片可独立使用。');
   else if(!failed&&finish==='length')fail('模型回答达到长度限制，可缩短问题后重试；钱包交易卡片可独立使用。');
  }catch{fail('模型响应读取失败，请重试；钱包交易卡片可独立使用。');}finally{try{emit('[DONE]');controller.close();}catch{}}
 },async cancel(){try{await reader?.cancel();}catch{}}});
}
