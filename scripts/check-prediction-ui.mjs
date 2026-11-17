// Synthetic public markets only. No wallet authentication, approvals or orders.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('apps/frontend'),out=join(process.env.RUNNER_TEMP||'work','prediction-ui');await mkdir(out,{recursive:true});
const market={provider:'polymarket',id:'123',question:'Will Bitcoin reach $100000 by December?',description:'Fixture settlement rules.',endDate:'2026-12-31T00:00:00Z',volume:'1234',outcomes:[{key:'yes',label:'Yes',price:'0.4'},{key:'no',label:'No',price:'0.6'}],url:'https://polymarket.com/event/fixture'};
const fixture=String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#101812;color:#edf3e5;font:14px Arial,sans-serif}h1{font-size:12px;text-align:center}</style></head><body><h1>TEST FIXTURE · simulated public markets; no wallet operations</h1><main></main><script type="module">
import {predictionCards} from '/prediction-cards.js';import {setLanguage} from '/i18n.js';
let discussions=0,selectedId=null,retiredRequests=0;const realFetch=window.fetch;window.fetch=(url,init)=>{if(/compare|kalshi|quote[?]/.test(String(url)))retiredRequests++;return realFetch(url,init);};
const card=predictionCards({getWallet:()=>null,onDiscuss:m=>{discussions++;selectedId=m.id;}});document.querySelector('main').append(card);
const mode=new URL(location.href).searchParams.get('mode'),fail=(v,m)=>{if(!v)throw Error(m);};
async function wait(test){for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI did not settle '+mode);}
try{
 await wait(()=>!card.querySelector('form button').disabled);
 if(mode==='error'){fail(!card.querySelector('.prediction-market'),'fabricated feed');fail(card.textContent.includes('连接失败，不代表没有相关盘口'),'outage hidden');}
 else if(mode==='empty'){fail(!card.querySelector('.prediction-market'),'fabricated market');fail(card.textContent.includes('没有匹配盘口'),'empty state absent');}
 else if(mode==='search'){
  card.querySelector('form input').value='Bitcoin';card.querySelector('form').requestSubmit();await wait(()=>!card.querySelector('form button').disabled);fail(card.querySelectorAll('.prediction-market').length===1,'search did not filter retired platform');fail(!card.textContent.includes('Kalshi'),'retired platform visible');
 }else{
  fail(card.querySelectorAll('.prediction-market').length===6,'six real cards missing');
  const previous=card.querySelector('.prediction-market-title').textContent;card.querySelector('.prediction-shuffle').click();fail(card.querySelector('.prediction-market-title').textContent!==previous,'shuffle repeated same batch');
  if(mode!=='feed'){
   const id=card.querySelector('.prediction-market-title').textContent;card.querySelector('.prediction-outcomes button').click();await wait(()=>card.querySelector('.prediction-purchase .purchase-actions button'));
   fail(!card.querySelector('.prediction-venues')&&!card.querySelector('.prediction-amount'),'comparison step remained');fail(card.querySelector('.prediction-purchase'),'direct purchase absent');fail(card.querySelector('.purchase-question').textContent===id,'selected event identity changed');
   if(mode==='outcome'){card.querySelector('.prediction-choice button:last-child').click();await wait(()=>card.querySelector('.prediction-purchase .purchase-actions button'));fail(card.querySelector('.prediction-choice button:last-child').getAttribute('aria-pressed')==='true','outcome not switched');fail(card.querySelector('.prediction-purchase h3').textContent.includes('否'),'purchase outcome did not change');}
   if(mode==='discuss'){card.querySelector('.prediction-discuss').click();fail(discussions===1&&selectedId,'discussion lost market identity');}
   if(mode==='back'){card.querySelector('.prediction-back').click();fail(!card.querySelector('.prediction-purchase'),'purchase not disposed');fail(!card.querySelector('.prediction-results').parentElement.hidden,'feed not restored');}
  }
 }
 if(mode==='english'){const amount=card.querySelector('input[type=number]');amount.value='12.34';setLanguage('en');await new Promise(r=>setTimeout(r,80));fail(amount.value==='12.34','language changed budget');fail(card.textContent.includes('Connect wallet to prepare purchase'),'new CTA untranslated');}
 await new Promise(r=>setTimeout(r,80));fail(retiredRequests===0,'retired platform or comparison requested');fail(document.documentElement.scrollWidth<=innerWidth+1,'horizontal overflow');fail([...card.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44),'touch target too small');
 const meta=document.createElement('meta');meta.name='prediction-ui-result';meta.content='pass';document.head.append(meta);
}catch(e){const meta=document.createElement('meta');meta.name='prediction-ui-result';meta.content='fail:'+e.message;document.head.append(meta);}
</script></body></html>`;
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local'),mode=new URL(req.headers.referer||'http://local').searchParams.get('mode'),json=p=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(p));};
 if(u.pathname==='/api/predictions/discover'){if(mode==='error'){res.statusCode=502;json({error:'平台响应超时'});}else json({at:new Date().toISOString(),markets:mode==='empty'?[]:Array.from({length:12},(_,i)=>({...market,id:String(123+i),question:market.question+' · fixture '+i}))});return;}
 if(u.pathname==='/api/predictions/search'){json({providers:[{provider:'polymarket',markets:[market]},{provider:'kalshi',markets:[{...market,provider:'kalshi'}]}]});return;}
 if(u.pathname==='/api/predictions/trading-status'){json({enabled:true});return;}
 if(u.pathname==='/fixture'){res.setHeader('content-type','text/html; charset=utf-8');res.end(fixture);return;}
 const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(p)==='.js'?'application/javascript':'text/css');res.end(await readFile(p));
}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const width of [1280,390])for(const mode of ['feed','search','buy','outcome','discuss','back','error','empty','english']){
 const shot=join(out,width+'-'+mode+'.png'),url='http://127.0.0.1:'+server.address().port+'/fixture?mode='+mode;
 const r=await new Promise((resolve,reject)=>{const c=spawn(process.env.CHROME_BIN||'/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars','--virtual-time-budget=8000','--window-size='+width+',1500','--screenshot='+shot,'--dump-dom',url],{stdio:['ignore','pipe','pipe']});let text='';c.stdout.on('data',b=>text+=b);c.stderr.resume();c.on('error',reject);c.on('close',code=>resolve({code,text}));});
 assert.equal(r.code,0);assert.ok(/name="prediction-ui-result" content="pass"/.test(r.text),'Browser '+width+' '+mode+': '+(r.text.match(/name="prediction-ui-result" content="([^"]+)/)?.[1]||r.text.slice(-1000)));console.log('PASS Polymarket discovery UI',width,mode);
}}finally{server.close();}
