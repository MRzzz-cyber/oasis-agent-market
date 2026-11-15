// Model HTML is never trusted. Only these Markdown constructs produce markup.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){
 let out='';const token=/(`[^`\n]+`|\*\*[^\n]+?\*\*|__[^\n]+?__|\*[^*\n]+?\*|\[[^\]\n]+\]\([^\s)]+\))/;
 while(s){const m=token.exec(s);if(!m)return out+esc(s);out+=esc(s.slice(0,m.index));const t=m[0];
 if(t[0]==='`')out+='<code>'+esc(t.slice(1,-1))+'</code>';
 else if(t.startsWith('**')||t.startsWith('__'))out+='<strong>'+inline(t.slice(2,-2))+'</strong>';
 else if(t[0]==='*')out+='<em>'+esc(t.slice(1,-1))+'</em>';
 else{const l=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);let safe=false;try{safe=['https:','http:'].includes(new URL(l[2]).protocol);}catch{}out+=safe?'<a href="'+esc(l[2])+'" target="_blank" rel="noopener noreferrer">'+esc(l[1])+'</a>':esc(l[1]);}
 s=s.slice(m.index+t.length);}return out;
}
export function renderMarkdown(source){
 const lines=String(source??'').replace(/\r\n?/g,'\n').split('\n'),blocks=[];let para=[],list=null;
 const fp=()=>{if(para.length)blocks.push('<p>'+para.map(inline).join('<br>')+'</p>');para=[];};
 const fl=()=>{if(list)blocks.push('<'+list.type+'>'+list.items.join('')+'</'+list.type+'>');list=null;};
 const flush=()=>{fp();fl();};
 for(let i=0;i<lines.length;i++){const line=lines[i];
 if(/^\s*```/.test(line)){flush();const code=[];while(++i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i]);blocks.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>');continue;}
 if(!line.trim()){flush();continue;}
 const h=/^\s{0,3}(#{1,6})\s+(.+)$/.exec(line);if(h){flush();const n=Math.min(6,h[1].length+2);blocks.push('<h'+n+'>'+inline(h[2])+'</h'+n+'>');continue;}
 const item=/^\s*(?:([-+*])\s+|(\d+)[.)]\s+)(.+)$/.exec(line);if(item){fp();const type=item[2]?'ol':'ul';if(list?.type!==type){fl();list={type,items:[]};}list.items.push('<li>'+inline(item[3])+'</li>');continue;}
 if(/^\s*>\s?/.test(line)){flush();blocks.push('<blockquote>'+inline(line.replace(/^\s*>\s?/,''))+'</blockquote>');continue;}
 if(/^\s*(?:---+|\*\*\*+)\s*$/.test(line)){flush();blocks.push('<hr>');continue;}
 if(line.includes('|')&&i+1<lines.length&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){flush();const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());const heads=cells(line),rows=[];i++;while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim())rows.push(cells(lines[++i]));blocks.push('<div class="markdown-table"><table><thead><tr>'+heads.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');continue;}
 fl();para.push(line);
 }flush();return blocks.join('');
}
export function setMarkdown(element,content){element.classList.add('markdown-body');element.dataset.markdownSource=String(content??'');element.innerHTML=renderMarkdown(content);}
