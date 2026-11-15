import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from './markdown.js';
test('Chinese model answers render bold, paragraphs and lists',()=>{
 const html=renderMarkdown('**结论：** 短线偏弱。\n\n### 行情数据\n- **价格**：1,798 USD\n- **涨跌**：-2.93%\n\n1. **趋势**：等待确认');
 assert.match(html,/<strong>结论：<\/strong>/);assert.match(html,/<h5>行情数据<\/h5>/);assert.match(html,/<ul><li><strong>价格/);assert.match(html,/<ol><li><strong>趋势/);assert.ok(!html.includes('**'));
});
test('untrusted HTML and unsafe links cannot execute',()=>{
 const html=renderMarkdown('<img src=x onerror=alert(1)>\n[危险](javascript:alert)\n[来源](https://hyperliquid.xyz)\n`**代码**`');
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/<code>\*\*代码\*\*<\/code>/);
});
test('streamed markup completes without losing text',()=>{
 assert.equal(renderMarkdown('**结论'),'<p>**结论</p>');assert.equal(renderMarkdown('**结论**'),'<p><strong>结论</strong></p>');
});
test('tables and code preserve content safely',()=>{
 assert.match(renderMarkdown('| 指标 | 数值 |\n| --- | --- |\n| 价格 | **100** |'),/<td><strong>100<\/strong><\/td>/);
 assert.equal(renderMarkdown('```html\n<script>x</script>\n```'),'<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>');
});
