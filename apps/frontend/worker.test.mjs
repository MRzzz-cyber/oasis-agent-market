import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOpenRouterModels, validateChatInput, streamOpenRouterChat } from "./worker.js";

test("model catalog maps provider metadata and prices per million tokens", () => {
 const models=normalizeOpenRouterModels({data:[{id:"anthropic/claude-test",name:"Claude Test",created:2,context_length:200000,pricing:{prompt:"0.000003",completion:"0.000015"},architecture:{input_modalities:["text"],output_modalities:["text"]}},{id:"vendor/image-only",name:"Image Only",pricing:{prompt:"0",completion:"0"},architecture:{input_modalities:["image"],output_modalities:["image"]}}]});
 assert.equal(models.length,1);assert.equal(models[0].id,"anthropic/claude-test");assert.equal(models[0].inputPricePerMillion,3);assert.equal(models[0].outputPricePerMillion,15);assert.equal(models[0].contextLength,200000);
});
test("chat input accepts OpenRouter model ids and validates message bounds",()=>{
 const value=validateChatInput({model:"anthropic/claude-sonnet-4",messages:[{role:"user",content:"帮我制定 ETH 策略"}]});assert.equal(value.model,"anthropic/claude-sonnet-4");
 assert.throws(()=>validateChatInput({model:"Claude Sonnet",messages:[{role:"user",content:"hello"}]}));assert.throws(()=>validateChatInput({model:"openai/gpt-4.1",messages:[{role:"system",content:"bad"}]}));assert.throws(()=>validateChatInput({model:"openai/gpt-4.1",messages:[{role:"user",content:"x".repeat(2001)}]}));
});
test("chat request proxies selected model to OpenRouter as an SSE stream",async()=>{
 let sent;const upstream=new Response("data: [DONE]\n\n",{status:200,headers:{"content-type":"text/event-stream"}});
 const result=await streamOpenRouterChat({model:"deepseek/deepseek-chat",messages:[{role:"user",content:"hello"}],env:{OPENROUTER_API_KEY:"test-secret"},fetchImpl:async(url,init)=>{sent={url,body:JSON.parse(init.body),auth:init.headers.authorization};return upstream;}});
 assert.equal(result.status,200);assert.match(result.headers.get("content-type"),/text\/event-stream/);assert.equal(sent.url,"https://openrouter.ai/api/v1/chat/completions");assert.equal(sent.body.model,"deepseek/deepseek-chat");assert.equal(sent.body.stream,true);assert.equal(sent.auth,"Bearer test-secret");
});
test("missing OpenRouter key fails closed",async()=>{const result=await streamOpenRouterChat({model:"openai/gpt-4.1",messages:[{role:"user",content:"hello"}],env:{}});assert.equal(result.status,503);});
test("unknown catalog prices are not labeled free",()=>{const[model]=normalizeOpenRouterModels({data:[{id:"vendor/test",name:"Test",pricing:{prompt:null,completion:""}}]});assert.equal(model.isFree,false);assert.equal(model.inputPricePerMillion,null);assert.equal(model.outputPricePerMillion,null);});
test("long assistant replies can be sent back on the next user turn",()=>{const value=validateChatInput({model:"vendor/test",messages:[{role:"user",content:"制定策略"},{role:"assistant",content:"a".repeat(3000)},{role:"user",content:"单次改成 25"}]});assert.equal(value.messages.length,3);});
test('release endpoint identifies purchase flow and mutable assets cannot retain stale trade code',async()=>{
 const{default:worker}=await import('./worker.js');const release=await worker.fetch(new Request('https://oasis.test/api/release'),{});
 assert.equal(release.status,200);assert.equal(release.headers.get('cache-control'),'no-store');const info=await release.json();assert.equal(info.version,'native-mainnet-v15-20261116');assert.equal(info.defaultTestBudget,'20');assert.equal(info.purchaseFlow,'review-buy-wallet-v16');
 const asset=await worker.fetch(new Request('https://oasis.test/app.js?v=native-mainnet-v15-20261116'),{ASSETS:{fetch:async()=>new Response('app source',{headers:{'cache-control':'public,max-age=3600'}})}});
 assert.equal(asset.headers.get('cache-control'),'no-store');assert.equal(asset.headers.get('x-oasis-release'),info.version);assert.equal(await asset.text(),'app source');
});
test('all advisor models describe review then buy then wallet, preserve protocol and balance boundaries',async()=>{
 const systems=[];for(const model of ['vendor/model-a','vendor/model-b'])await streamOpenRouterChat({model,messages:[{role:'user',content:'我想买 ETH'}],env:{OPENROUTER_API_KEY:'fixture'},fetchImpl:async(_,init)=>{systems.push(JSON.parse(init.body).messages.find(m=>m.role==='system').content);return new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});}});
 assert.equal(systems[0],systems[1]);for(const expected of ['核对网络与价格，点击购买，在钱包确认','不自动展开或执行','不限本单预算','模型不能代点购买或签名','不能把旧测试资金','链上钱包余额不等于 Hyperliquid 可交易余额'])assert.ok(systems[0].includes(expected),expected);
});
