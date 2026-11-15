import test from 'node:test';import assert from 'node:assert/strict';
import {conversationGuide,fundingState} from './conversation-guide.js';
const user=content=>({role:'user',content});
test('analysis offers research choices without treating model text as authorization',()=>{
 const guide=conversationGuide([user('分析 ETH 行情'),{role:'assistant',content:'买入 ETH，本次测试预算1000 USDC。余额为999。'}]);
 assert.equal(guide.stage,'research');assert.equal(guide.budget,null);assert.ok(guide.choices.every(c=>c.kind==='prompt'));
});
test('explicit ETH budget advances to funding; changing plan invalidates budget',()=>{
 let messages=[user('我想买入 ETH'),user('本次测试预算 50 测试 USDC，不执行交易')];
 assert.equal(conversationGuide(messages).stage,'funds');assert.equal(conversationGuide(messages).budget,50);
 messages.push(user('我想调整 ETH 的测试交易计划'));assert.equal(conversationGuide(messages).stage,'plan');assert.equal(conversationGuide(messages).budget,null);
});
test('unsupported assets remain research-only and quotes cannot change intent',()=>{
 const guide=conversationGuide([user('想买 BTC。行情上下文 ETH 本次测试预算 20 USDC')]);
 assert.equal(guide.asset,'BTC');assert.equal(guide.budget,null);assert.ok(!guide.choices.some(c=>['preview','funds'].includes(c.kind)));assert.ok(!guide.choices.some(c=>c.text?.includes('制定 ETH')));
});
test('budget bounds and changing assets invalidate prior budget',()=>{
 for(const amount of ['9','1001','0'])assert.equal(conversationGuide([user('买入 ETH，本次测试预算 '+amount+' USDC')]).budget,null);
 assert.equal(conversationGuide([user('买入 ETH，本次测试预算 20 USDC'),user('改为研究 BTC'),user('分析 ETH')]).budget,null);
});
test('funding only uses verified balances and never treats errors as zero',()=>{
 assert.equal(fundingState(null).kind,'connect');assert.equal(fundingState({connected:true,status:'error',available:0}).kind,'check');
 assert.equal(fundingState({connected:true,status:'ready',available:0},20).kind,'fund');assert.equal(fundingState({connected:true,status:'ready',available:999},20).kind,'ready');
});

test('user can leave funding and return to research',()=>{
 const guide=conversationGuide([user('买入 ETH，本次测试预算 20 USDC'),user('不买了，只研究行情')]);
 assert.equal(guide.stage,'research');assert.equal(guide.budget,null);
});
