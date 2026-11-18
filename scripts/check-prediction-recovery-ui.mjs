// Real headless Chrome, synthetic public data only. No authentication or wallet actions.
import {createServer} from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import {resolve,extname,join} from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const root=resolve('apps/frontend'),out=join(process.env.RUNNER_TEMP||'work','prediction-recovery-ui');await mkdir(out,{recursive:true});
const fixture=String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#101812;color:#edf3e5;font:14px Arial,sans-serif}h1{font-size:12px}</style></head><body><h1>TEST FIXTURE · simulated outages; no wallet actions</h1><main></main><script type="module">
import {predictionCards} from '/prediction-cards.js';import {setLanguage} from '/i18n.js';
const mode=new URL(location.href).searchParams.get('mode'),base=Date.now(),realFetch=window.fetch;
let offset=0,phase='good',feedCalls=0,searchCalls=[],badMethod=false;Date.now=()=>base+offset;
const market={provider:'polymarket',id:'123',question:'Will Bitcoin reach a new high?',description:'Fixture only.',endDate:'2030-01-01T00:00:00Z',volume:'1234',outcomes:[{key:'yes',label:'Yes',price:'0.4'},{key:'no',label:'No',price:'0.6'}],url:'https://polymarket.com/event/fixture'};
const feed=()=>({at:new Date(Date.now()).toISOString(),markets:Array.from({length:12},(_,i)=>({...market,id:String(123+i)}))});
const html=()=>new Response('<html>Gateway unavailable</html>',{status:503,headers:{'content-type':'text/html'}});
window.fetch=async(input,init)=>{
 const path=String(input);if(!path.startsWith('/api/'))return realFetch(input,init);
 if(/\/api\/predictions\/(?:discover|search)/.test(path)&&init?.method!=='GET')badMethod=true;
 if(path.startsWith('/api/predictions/discover')){feedCalls++;return mode==='recover'&&feedCalls===1?html():Response.json(feed());}
 if(path.startsWith('/api/predictions/search')){
  const term=new URL(path,location.origin).searchParams.get('q');searchCalls.push(term);
  if(phase==='bad'||mode==='abort'&&term==='Bitcoin')return html();
  const stale=mode==='server-stale';return Response.json({at:new Date(Date.now()-(stale?60000:0)).toISOString(),stale,providers:[{provider:'polymarket',markets:[{...market,id:term==='NBA'?'999':'123',question:term+' fixture question'}]}]});
 }
 return Response.json({error:'Fixture public reads only'},{status:401});
};
const card=predictionCards({getWallet:()=>null,pickWallet:()=>{throw Error('Wallet must not open');}});document.querySelector('main').append(card);
const fail=(v,m)=>{if(!v)throw Error(m);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){for(let i=0;i<250;i++){if(fn())return;await sleep(20);}throw Error('UI did not settle '+mode);}
async function search(term){card.querySelector('form input').value=term;card.querySelector('form').requestSubmit();await wait(()=>!card.querySelector('form button').disabled);}
try{
 await wait(()=>!card.querySelector('form button').disabled);fail(card.querySelectorAll('.prediction-market').length===6,'initial feed missing');
 if(mode==='recover'){fail(feedCalls===2,'HTML error was not retried once');fail(card.dataset.state==='ready','recovery state incorrect');}
 else if(mode==='abort'){
  card.querySelector('form input').value='Bitcoin';card.querySelector('form').requestSubmit();await wait(()=>searchCalls.includes('Bitcoin'));
  [...card.querySelectorAll('.prediction-presets button')].find(b=>b.textContent==='体育').click();await wait(()=>!card.querySelector('form button').disabled);await sleep(300);
  fail(searchCalls.filter(q=>q==='Bitcoin').length===1,'cancelled read retried');fail(card.querySelector('.prediction-market-title').oasisMarket.id==='999','obsolete response replaced new topic');
 }else if(mode==='manual'||mode==='english'){
  if(mode==='english')setLanguage('en');phase='bad';await search('Bitcoin');fail(card.dataset.state==='error','outage concealed');fail(!card.querySelector('.prediction-market'),'unrelated feed used as search results');
  const retry=card.querySelector('.prediction-retry');fail(!retry.hidden&&!retry.disabled,'retry unavailable');
  if(mode==='english'){await sleep(80);fail(retry.textContent==='Retry connection','retry not translated');}
  phase='good';retry.click();await wait(()=>!card.querySelector('form button').disabled);fail(card.querySelector('.prediction-market-title').oasisMarket.id==='123','manual retry did not restore');
 }else{
  await search('Bitcoin');fail(card.querySelector('.prediction-market-title').oasisMarket.id==='123','search identity changed');
  if(mode==='server-stale'){fail(card.dataset.state==='stale','server snapshot not marked');fail(!card.querySelector('.prediction-retry').hidden,'server snapshot lacks retry');}
  else{phase='bad';if(mode==='expired')offset=300001;await search(mode==='isolate'?'NBA':'Bitcoin');
   if(mode==='retained'){fail(card.dataset.state==='stale','cached results not marked stale');fail(card.querySelector('.prediction-market-title').oasisMarket.id==='123','same-query snapshot lost');fail(card.querySelector('.prediction-live').textContent.includes('快照'),'snapshot shown as live');}
   else{fail(card.dataset.state==='error','expired or wrong query became ready');fail(!card.querySelector('.prediction-market'),'expired or cross-query results leaked');fail(card.querySelector('.prediction-shuffle').disabled,'unrelated pool remained enabled');}
  }
 }
 fail(!badMethod,'public recovery sent a mutation');fail(document.documentElement.scrollWidth<=innerWidth+1,'horizontal overflow');fail([...card.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44),'small touch target');
 const meta=document.createElement('meta');meta.name='prediction-recovery-result';meta.content='pass';document.head.append(meta);card.dispose();
}catch(e){const meta=document.createElement('meta');meta.name='prediction-recovery-result';meta.content='fail:'+e.message;document.head.append(meta);}
</script></body></html>`;
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/fixture'){res.setHeader('content-type','text/html; charset=utf-8');res.end(fixture);return;}const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(p)==='.js'?'application/javascript':'text/css');res.end(await readFile(p));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const width of [1280,390])for(const mode of ['recover','manual','retained','isolate','server-stale','expired','abort','english']){
 const r=await new Promise((resolve,reject)=>{const c=spawn(process.env.CHROME_BIN||'/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars','--virtual-time-budget=8000','--window-size='+width+',1500','--screenshot='+join(out,width+'-'+mode+'.png'),'--dump-dom','http://127.0.0.1:'+server.address().port+'/fixture?mode='+mode],{stdio:['ignore','pipe','pipe']});let text='';c.stdout.on('data',b=>text+=b);c.stderr.resume();c.on('error',reject);c.on('close',code=>resolve({code,text}));});
 assert.equal(r.code,0);assert.ok(/name="prediction-recovery-result" content="pass"/.test(r.text),'Browser '+width+' '+mode+': '+(r.text.match(/name="prediction-recovery-result" content="([^"]+)/)?.[1]||r.text.slice(-1200)));console.log('PASS prediction outage UI',width,mode);
}}finally{server.close();}
