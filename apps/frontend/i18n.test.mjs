import test from 'node:test';
import assert from 'node:assert/strict';
import {translateUI,setLanguage,getLanguage} from './i18n.js';
import {messages} from './i18n-messages.js';
test('language defaults to Chinese and accepts only supported values',()=>{assert.equal(getLanguage(),'zh');assert.throws(()=>setLanguage('fr'));setLanguage('en');assert.equal(translateUI('钱包与资金'),'Wallet & funds');setLanguage('zh');assert.equal(translateUI('钱包与资金'),'钱包与资金');});
test('UI translations preserve amounts, token symbols and addresses',()=>{assert.equal(translateUI('确认买入 · 最多 12.34 pUSD','en'),'Confirm purchase · up to 12.34 pUSD');assert.equal(translateUI('0x1234 USDC 0.50','en'),'0x1234 USDC 0.50');assert.equal(translateUI('每周','en'),'Weekly');});
test('message catalogue covers static page copy without runtime translation services',()=>{for(const key of ['登录 Oasis','钱包余额','刷新报价','使用 Google 登录','运行观察台','最多支付 · pUSD','单次金额上限 *'])assert.ok(messages[key]&&!/[\u3400-\u9fff]/.test(messages[key]),key);});
