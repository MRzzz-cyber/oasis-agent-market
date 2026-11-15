import test from 'node:test';import assert from 'node:assert/strict';
import {matchesWalletIdentity,guardWalletProvider} from './account-wallet.js';
import {approvalEnvelope} from './testnet.js';
const address='0x'+'1'.repeat(40),agent='0x'+'2'.repeat(40);
test('only a wallet linked to the current custom identity is accepted',()=>{
 assert.equal(matchesWalletIdentity({linkedAccounts:[{type:'custom_auth',customUserId:'oasis:google:u'}]},'oasis:google:u'),true);
 assert.equal(matchesWalletIdentity({linkedAccounts:[{type:'custom_auth',customUserId:'oasis:google:other'}]},'oasis:google:u'),false);
});
test('account provider blocks transfers/mainnet and requires current server session for signing',async()=>{
 let active=true,session={id:'u',active:true},signed=0;
 const provider=guardWalletProvider({request:async()=> '0x1'},{address,subject:'oasis:google:u',isCurrent:()=>active,getSession:async()=>session,signTypedData:async()=>{signed++;return 'signature';}});
 assert.deepEqual(await provider.request({method:'eth_requestAccounts'}),[address]);
 await assert.rejects(provider.request({method:'eth_sendTransaction',params:[]}));
 const typed=approvalEnvelope(agent,'0x1',Date.now()).typed;
 const packet={method:'eth_signTypedData_v4',params:[address,JSON.stringify(typed)]};
 assert.equal(await provider.request(packet),'signature');assert.equal(signed,1);
 const mainnet=structuredClone(typed);mainnet.message.hyperliquidChain='Mainnet';await assert.rejects(provider.request({...packet,params:[address,JSON.stringify(mainnet)]}));
 session={id:'other',active:true};await assert.rejects(provider.request(packet));assert.equal(signed,1);
 active=false;await assert.rejects(provider.request({method:'eth_accounts'}));await assert.rejects(provider.request(packet));
});
