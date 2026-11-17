// Browser fixtures only. No real wallet, signature, approval or order is used.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('apps/frontend'),out=join(process.env.RUNNER_TEMP||'work','prediction-ui');await mkdir(out,{recursive:true});
const market={provider:'polymarket',id:'123',question:'Will Bitcoin reach $100000 by December?',description:'Fixture rules: different platforms may settle differently.',eventTitle:'Bitcoin in December',endDate:'2026-12-31T00:00:00Z',network:'Polygon · pUSD',volume:'1234',outcomes:[{key:'yes',label:'Yes',price:'0.4'},{key:'no',label:'No',price:'0.6'}],execution:{enabled:false,reason:'Fixture'},url:'https://polymarket.com/event/fixture',match:{status:'source',label:'你选择的盘口',differences:[]}};
const other={...market,provider:'kalshi',id:'KXBTC-1',question:'Will Bitcoin exceed $100000 at a different deadline?',network:'Kalshi 平台账户',endDate:'2027-01-01T00:00:00Z',url:'https://kalshi.com/markets/fixture',match:{status:'related',label:'相关盘口 · 未核验等价',differences:['截止时间不同或待核实','结算规则需要分别核对']}};
const fixture=String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#0d1710;color:#edf3e5;font:14px Arial,sans-serif}h1{font-size:12px;text-align:center}</style></head><body><h1>TEST FIXTURE · simulated public markets, no wallet operations</h1><main></main><script type="module">
import {predictionCards} from '/prediction-cards.js';let walletWrites=0;window.requestCounts={quote:0,purchase:0};const realFetch=window.fetch;window.fetch=(url,init)=>{if(String(url).includes('/quote?'))window.requestCounts.quote++;if(String(url).includes('/trading-status'))window.requestCounts.purchase++;return realFetch(url,init);};const card=predictionCards({getWallet:()=>({address:'0x'+'1'.repeat(40),provider:{request:()=>{walletWrites++;throw Error('No wallet calls allowed');}}})});document.querySelector('main').append(card);const mode=new URL(location.href).searchParams.get('mode');const fail=(v,m)=>{if(!v)throw Error(m);};
async function wait(test){for(let i=0;i<300;i++){if(test())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI did not settle: '+mode);}
try{
 await wait(()=>!card.querySelector('form button').disabled);
 if(mode==='error'){fail(!card.querySelector('.prediction-market'),'fabricated feed');fail(card.textContent.includes('连接失败，不代表没有相关盘口'),'outage hidden');}
 else if(mode==='empty'){fail(!card.querySelector('.prediction-market'),'fabricated empty market');fail(card.textContent.includes('没有匹配盘口'),'empty state absent');}
 else if(mode==='search'){
  const input=card.querySelector('form input');input.value='Bitcoin';card.querySelector('form').requestSubmit();await wait(()=>!card.querySelector('form button').disabled);fail(card.textContent.includes('部分平台暂不可用'),'partial search hidden');fail(walletWrites===0,'research signed');
 }else{
  fail(card.querySelectorAll('.prediction-market').length===6,'feed does not show six cards');
  const first=card.querySelector('.prediction-market-title').textContent;card.querySelector('.prediction-shuffle').click();fail(card.querySelector('.prediction-market-title').textContent!==first,'shuffle repeats first six');
  if(mode!=='feed'){
   card.querySelector('.prediction-outcomes button').click();await wait(()=>card.querySelector('.prediction-amount button')&&!card.querySelector('.prediction-amount button').disabled);
   fail(window.requestCounts.quote>0,'comparison did not automatically load quotes');fail(!card.querySelector('.prediction-purchase'),'purchase opened before platform choice');fail(window.requestCounts.purchase===0,'comparison authenticated without choice');
   if(mode==='partial'){fail(card.textContent.includes('Kalshi')&&card.textContent.includes('平台响应超时'),'counterparty outage hidden');}
   else{
    fail(card.querySelectorAll('.prediction-quote').length===2,'missing venue quotes');fail(card.textContent.includes('未核验等价'),'similarity presented as equivalence');fail(card.textContent.includes('截止时间不同'),'rule difference hidden');
    fail(card.querySelector('[data-provider=kalshi] .prediction-quote a')?.hostname==='kalshi.com','Kalshi destination missing');fail(!card.textContent.includes('推荐最低'),'unverified winner');
    if(mode==='choose'){card.querySelector('.prediction-choose-venue').click();await wait(()=>card.querySelector('.prediction-purchase'));fail(walletWrites===0,'choosing venue signed');}
    if(mode==='change'){
     const shares=card.querySelector('.prediction-amount input');shares.value='20';shares.dispatchEvent(new Event('input'));fail(!card.querySelector('.prediction-quote strong'),'stale price retained');fail(!card.querySelector('.prediction-choose-venue'),'stale platform action retained');card.querySelector('.prediction-amount button').click();await wait(()=>!card.querySelector('.prediction-amount button').disabled);fail(card.textContent.includes('20 份卖盘小计'),'new amount not quoted');
     card.querySelector('[data-provider=polymarket] .prediction-venue-outcomes button:last-child').click();await wait(()=>!card.querySelector('.prediction-amount button').disabled);fail(card.querySelector('[data-provider=polymarket] .prediction-venue-outcomes button:last-child').getAttribute('aria-pressed')==='true','outcome switch failed');
    }
   }
   if(mode==='back'){card.querySelector('.prediction-back').click();fail(card.querySelector('.prediction-selected').children.length===0,'comparison not dismissed');fail(!card.querySelector('.prediction-results').parentElement.hidden,'feed not restored');}
  }
 }
 await new Promise(r=>setTimeout(r,80));fail(document.documentElement.scrollWidth<=innerWidth+1,'horizontal overflow');fail(card.getBoundingClientRect().width<=760.1,'card too wide');
 fail([...card.querySelectorAll('button')].filter(b=>b.getClientRects().length).every(b=>b.getBoundingClientRect().height>=44),'small button touch target');fail(walletWrites===0,'wallet invoked during discovery');
 const m=document.createElement('meta');m.name='prediction-ui-result';m.content='pass';document.head.append(m);
}catch(e){const m=document.createElement('meta');m.name='prediction-ui-result';m.content='fail:'+e.message;document.head.append(m);}
</script></body></html>`;
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local'),mode=new URL(req.headers.referer||'http://local').searchParams.get('mode'),json=p=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(p));};
 if(u.pathname==='/api/predictions/discover'){if(mode==='error'){res.statusCode=502;json({error:'平台响应超时'});}else json({at:new Date().toISOString(),markets:mode==='empty'?[]:Array.from({length:12},(_,i)=>({...market,id:String(123+i),question:market.question+' · fixture '+i}))});return;}
 if(u.pathname==='/api/predictions/search'){json({at:new Date().toISOString(),providers:[{provider:'polymarket',markets:[market],coverage:'Fixture'},{provider:'kalshi',markets:[],error:'平台响应超时',coverage:'Fixture'}]});return;}
 if(u.pathname==='/api/predictions/compare'){const selected={...market,id:u.searchParams.get('id')};json({source:selected,outcome:u.searchParams.get('outcome'),providers:[{provider:'polymarket',markets:[selected],coverage:'Fixture'},{provider:'kalshi',markets:mode==='partial'?[]:[other],coverage:'Fixture',...(mode==='partial'?{error:'平台响应超时'}:{})}]});return;}
 if(u.pathname==='/api/predictions/quote'){const provider=u.searchParams.get('provider'),shares=u.searchParams.get('shares');json({market:{...(provider==='polymarket'?market:other),id:u.searchParams.get('id')},outcome:u.searchParams.get('outcome'),subtotal:String(Number(shares)*.4),averagePrice:'0.4',requested:shares,filled:shares,depthEnough:true,minimumMet:true,sourceStale:false,receivedAt:Date.now(),expiresAt:Date.now()+30000});return;}
 if(u.pathname==='/api/predictions/trading-status'){json({enabled:false});return;}
 if(u.pathname==='/fixture'){res.setHeader('content-type','text/html; charset=utf-8');res.end(fixture);return;}
 const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(p)==='.js'?'application/javascript':'text/css');res.end(await readFile(p));
 }catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const width of [1280,390])for(const mode of ['feed','search','compare','partial','error','empty','choose','change','back']){
 const instrument=fixture.replace('window.requestCounts.quote>0','window.requestCounts.quote>0');
 const url='http://127.0.0.1:'+server.address().port+'/fixture?mode='+mode,shot=join(out,width+'-'+mode+'.png');
 const r=await new Promise((resolve,reject)=>{const child=spawn(process.env.CHROME_BIN||'/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars','--virtual-time-budget=15000','--window-size='+width+',1800','--screenshot='+shot,'--dump-dom',url],{stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',b=>text+=b);child.stderr.resume();child.on('error',reject);child.on('close',code=>resolve({code,text}));});
 assert.equal(r.code,0);assert.match(r.text,/name="prediction-ui-result" content="pass"/,'Browser '+width+' '+mode+': '+r.text.slice(-4000));console.log('PASS discovery UI',width,mode);
}}finally{server.close();}
