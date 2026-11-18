// Actual application with fixture Google/model/market responses. No wallet operations.
import {createServer} from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import {resolve,join,extname} from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const root=resolve('apps/frontend'),out=join(process.env.RUNNER_TEMP||'work','prediction-conversation');await mkdir(out,{recursive:true});
const m={provider:'polymarket',id:'123',question:'Will the Fed cut interest rates this year?',description:'Fixture settlement rules',endDate:'2026-12-31',volume:'1000',outcomes:[{key:'yes',label:'Yes',price:'0.4'},{key:'no',label:'No',price:'0.6'}],url:'https://polymarket.com/event/fixture'};
let chats=0,queries=[],writes=0,discoveryReads=0;
const acceptance=String.raw`<script type="module">
const fail=(v,m)=>{if(!v)throw Error(m);};async function wait(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Conversation did not settle');}
try{
 await wait(()=>!document.querySelector('#model-primary').disabled&&!document.querySelector('#account-button').hidden);
 fail(document.querySelector('#page-overview h1').textContent.includes('AI'),'assistant landing missing');
 fail(!document.querySelector('.prediction-cards'),'prediction feed loaded on the assistant home');
 document.querySelector('[data-assistant-task="risk"]').click();
 fail(document.querySelector('#goal').value.includes('检查一笔交易的风险'),'risk template did not populate the composer');
 fail(document.querySelector('#page-create').classList.contains('hidden'),'starter sent without user submission');
 document.querySelector('#goal-form').requestSubmit();
 await wait(()=>document.querySelector('#chat-next-actions .guide-title')&&!document.querySelector('#chat-submit').disabled);
 fail(!document.querySelector('#chat-trade-plan').children.length,'research unexpectedly opened a trade preview');
 document.querySelector('#new-idea').click();
 document.querySelector('.assistant-tools [data-tab="predictions"]').click();
 await wait(()=>document.querySelector('#prediction-workspace .prediction-market'));
 document.querySelector('#page-predictions [data-tab="overview"]').click();
 fail(!document.querySelector('#prediction-workspace').children.length,'leaving predictions did not release the feed');
 document.querySelector('#goal').value='我想看看美联储降息的 Polymarket 预测盘口';document.querySelector('#goal-form').requestSubmit();
 await wait(()=>document.querySelector('#chat-trade-plan .prediction-market')&&!document.querySelector('#chat-submit').disabled);
 let card=document.querySelector('#chat-trade-plan .prediction-cards');fail(card.querySelector('form input').value==='Fed','conversation topic not searched');
 card.querySelector('.prediction-outcomes button:last-child').click();await wait(()=>card.querySelector('.purchase-actions button'));const purchase=card.querySelector('.prediction-purchase'),amount=purchase.querySelector('input');amount.value='12.34';amount.dispatchEvent(new Event('input'));
 document.querySelector('#chat-input').value='这个事件还要核对哪些信息？';document.querySelector('#chat-form').requestSubmit();await wait(()=>!document.querySelector('#chat-submit').disabled);
 fail(document.querySelector('#chat-trade-plan .prediction-purchase')===purchase,'follow-up replaced purchase');fail(amount.value==='12.34','follow-up reset budget');fail(card.querySelector('.prediction-choice button:last-child').getAttribute('aria-pressed')==='true','follow-up reset NO outcome');
 document.querySelector('#chat-input').value='换一批 NBA 预测盘口';document.querySelector('#chat-form').requestSubmit();await wait(()=>!document.querySelector('#chat-submit').disabled&&document.querySelector('#chat-trade-plan .prediction-market'));
 card=document.querySelector('#chat-trade-plan .prediction-cards');fail(card.querySelector('form input').value==='NBA','new topic did not search');fail(!card.querySelector('.prediction-purchase'),'old market selected for new topic');
 const meta=document.createElement('meta');meta.name='conversation-ui-result';meta.content='pass';document.head.append(meta);
}catch(e){const meta=document.createElement('meta');meta.name='conversation-ui-result';meta.content='fail:'+e.message;document.head.append(meta);}
</script>`;
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local'),json=p=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(p));};
 if(u.pathname==='/api/ai/chat'){chats++;res.setHeader('content-type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:'Fixture advisor: review event rules before buying.'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');return;}
 if(u.pathname.startsWith('/api/')){if(u.pathname==='/api/predictions/discover')discoveryReads++;if(req.method==='POST')writes++;if(u.pathname==='/api/predictions/search')queries.push(u.searchParams.get('q'));json(u.pathname==='/api/ai/status'?{googleLogin:true,enabled:true,openRouterConfigured:true}:u.pathname==='/api/auth/me'?{id:'fixture',email:'fixture@example.invalid',active:true}:u.pathname==='/api/ai/models'?{models:[{id:'fixture/model',name:'Fixture model',isFree:true}]}:u.pathname==='/api/wallet/config'?{enabled:false}:u.pathname==='/api/predictions/discover'?{at:new Date().toISOString(),markets:[m]}:u.pathname==='/api/predictions/search'?{providers:[{provider:'polymarket',markets:[{...m,id:u.searchParams.get('q')==='NBA'?'456':'123'}]}]}:u.pathname==='/api/predictions/trading-status'?{enabled:true}:u.pathname==='/api/release'?{version:'native-mainnet-v15-20261116'}:{markets:[],candles:[],bars:[]});return;}
 if(u.pathname==='/fixture'){let html=await readFile(join(root,'index.html'),'utf8');html=html.replace('<head>','<head><script>window.WebSocket=class{close(){};send(){}};<\/script>').replace('</body>',acceptance+'</body>');res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
 const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(p)==='.js'?'application/javascript':extname(p)==='.css'?'text/css':extname(p)==='.svg'?'image/svg+xml':'text/html');res.end(await readFile(p));
}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const width of [1280,390]){const before=chats,beforeDiscovery=discoveryReads,r=await new Promise((resolve,reject)=>{const c=spawn(process.env.CHROME_BIN||'/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars','--virtual-time-budget=12000','--window-size='+width+',1500','--screenshot='+join(out,width+'.png'),'--dump-dom','http://127.0.0.1:'+server.address().port+'/fixture'],{stdio:['ignore','pipe','pipe']});let text='';c.stdout.on('data',b=>text+=b);c.stderr.resume();c.on('error',reject);c.on('close',code=>resolve({code,text}));});assert.equal(r.code,0);assert.ok(/name="conversation-ui-result" content="pass"/.test(r.text),r.text.match(/name="conversation-ui-result" content="([^"]+)/)?.[1]||r.text.slice(-1000));assert.equal(chats-before,4);assert.equal(discoveryReads-beforeDiscovery,1);console.log('PASS conversational topic search, retained event/outcome/budget and explicit topic change',width);}assert.equal(writes,0,'Unexpected write endpoint');assert.ok(queries.includes('Fed')&&queries.includes('NBA'));}finally{server.close();}
