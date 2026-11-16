import test from 'node:test';import assert from 'node:assert/strict';import {predictionIntent} from './prediction-core.js';
const user=content=>({role:'user',content});
test('prediction amounts and funding followups retain their original market context',()=>{const context=[user('我想买预测市场盘口'),{role:'assistant',content:'请核对规则'}];for(const next of ['比较一下价格','买入 10 份 YES','余额不够怎么办','确认','充值到账了'])assert.equal(predictionIntent([...context,user(next)]),true,next);});
test('explicit ETH purchase and cancelling prediction research end prediction context',()=>{const context=[user('研究 Polymarket')];assert.equal(predictionIntent([...context,user('改成买入 10 USDC 的 ETH')]),false);assert.equal(predictionIntent([...context,user('先不买预测市场了')]),false);});
test('assistant text alone never selects a prediction purchase path',()=>{assert.equal(predictionIntent([user('我想买 ETH'),{role:'assistant',content:'也可以看看 Polymarket'}]),false);});
