// Static and dynamic UI fixtures; no external services or wallet operations.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('apps/frontend'),out=join(process.env.RUNNER_TEMP||'work','bilingual-ui');await mkdir(out,{recursive:true});
const acceptance=String.raw`<script type="module">
import {getLanguage,setLanguage,localizeDOM} from '/i18n.js';
const fail=(v,m)=>{if(!v)throw Error(m);};const wait=()=>new Promise(r=>setTimeout(r,80));const mode=new URL(location.href).searchParams.get('mode');
try{
 await wait();fail(getLanguage()==='zh','default language must be Chinese');const switcher=document.querySelector('[data-language-switch]');fail(switcher,'switcher absent');fail(switcher.getBoundingClientRect().right<=innerWidth,'switcher overflow');
 const input=document.querySelector('#goal');if(input)input.value='用户原文 12 USDC wallet 0x1234';const group=document.querySelector('#market-group');const initialValue=group?.value;
 const user=document.createElement('p');user.dataset.i18nSkip='';user.textContent='钱包与资金 用户原文 12 USDC';document.body.append(user);const storeKey='fixture-existing-history';localStorage.setItem(storeKey,'DO NOT MODIFY');
 if(mode==='storage-failure'){Storage.prototype.setItem=()=>{throw Error('fixture unavailable');};}
 switcher.click();await wait();fail(getLanguage()==='en'&&document.documentElement.lang==='en','English switch failed');fail(!input||input.value==='用户原文 12 USDC wallet 0x1234','user input changed');fail(!group||group.value===initialValue,'translated option changed enum');fail(user.textContent==='钱包与资金 用户原文 12 USDC','protected text translated');
 if(mode!=='storage-failure')fail(localStorage.getItem('oasis-language')==='en','preference not saved');
 const status=document.createElement('p');status.textContent='报价已过期，请刷新后选择平台。';document.body.append(status);await wait();fail(status.textContent==='Quote expired. Refresh before choosing a venue.','new status not translated');
 const attr=document.createElement('textarea');attr.placeholder='搜索币种或市场';attr.value='原文 99';document.body.append(attr);await wait();fail(attr.placeholder==='Search assets or markets'&&attr.value==='原文 99','placeholder/value mismatch');
 const excluded='script,style,svg,code,pre,textarea,[data-i18n-skip],[data-language-switch]';const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,missing=[];while(n=walker.nextNode())if(!n.parentElement.closest(excluded)&&/[\u3400-\u9fff]/.test(n.data))missing.push(n.data.trim());
 fail(!missing.length,'untranslated static copy: '+JSON.stringify([...new Set(missing)].slice(0,25)));
 switcher.click();await wait();fail(getLanguage()==='zh'&&document.documentElement.lang==='zh-CN','Chinese restore failed');fail(status.textContent==='报价已过期，请刷新后选择平台。','dynamic original lost');fail(localStorage.getItem(storeKey)==='DO NOT MODIFY','existing history modified');
 const page=document.querySelector('#page-overview');if(page)fail(page.getBoundingClientRect().right<=innerWidth+1,'page overflow');
 const meta=document.createElement('meta');meta.name='bilingual-ui-result';meta.content='pass';document.head.append(meta);
}catch(e){const m=document.createElement('meta');m.name='bilingual-ui-result';m.content='fail:'+e.message;document.head.append(m);}
</script>`;
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,'http://local');if(u.pathname==='/fixture'){let html=await readFile(join(root,u.searchParams.get('page')||'index.html'),'utf8');html=html.replace(/<script[^>]*src="\/app\.js[^"]*"[^>]*><\/script>/g,'').replace('</body>',acceptance+'</body>');res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}const p=resolve(root,'.'+u.pathname);if(!p.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('content-type',extname(p)==='.js'?'application/javascript':extname(p)==='.css'?'text/css':extname(p)==='.svg'?'image/svg+xml':'text/html');res.end(await readFile(p));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const width of [1280,390])for(const page of ['index.html','admin.html','privy-setup.html'])for(const mode of ['normal','storage-failure']){
 const url='http://127.0.0.1:'+server.address().port+'/fixture?'+new URLSearchParams({page,mode}),shot=join(out,width+'-'+page+'-'+mode+'.png');const r=await new Promise((resolve,reject)=>{const p=spawn(process.env.CHROME_BIN||'/usr/bin/google-chrome',['--headless','--no-sandbox','--disable-gpu','--hide-scrollbars','--virtual-time-budget=6000','--window-size='+width+',1500','--screenshot='+shot,'--dump-dom',url],{stdio:['ignore','pipe','pipe']});let text='';p.stdout.on('data',b=>text+=b);p.stderr.resume();p.on('error',reject);p.on('close',code=>resolve({code,text}));});assert.equal(r.code,0);assert.ok(/name="bilingual-ui-result" content="pass"/.test(r.text),'Browser '+page+' '+width+' '+mode+': '+(r.text.match(/name="bilingual-ui-result" content="([^"]+)/)?.[1]||r.text.slice(-500)));console.log('PASS bilingual',page,width,mode);
}}finally{server.close();}
