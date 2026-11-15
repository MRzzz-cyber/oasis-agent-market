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
test('account provider allows own read-only native balance without expanding signing access',async()=>{
 const provider=guardWalletProvider({request:async()=> '0x1'},{address,subject:'oasis:google:u',isCurrent:()=>true,getSession:async()=>({id:'u',active:true}),signTypedData:async()=>assert.fail('must not sign')});
 assert.equal(await provider.request({method:'eth_getBalance',params:[address,'latest']}),'0x1');
 await assert.rejects(provider.request({method:'eth_getBalance',params:[agent,'latest']}));await assert.rejects(provider.request({method:'eth_sendTransaction',params:[]}));
});
test('account provider permits only official mainnet USDC balanceOf for its owner',async()=>{
 const provider=guardWalletProvider({request:async p=>p.method==='eth_chainId'?'0x1':'0x'+'0'.repeat(64)},{address,subject:'oasis:google:u',isCurrent:()=>true,getSession:async()=>({id:'u',active:true}),signTypedData:async()=>assert.fail()});
 const call={method:'eth_call',params:[{to:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',data:'0x70a08231'+address.slice(2).padStart(64,'0')},'latest']};assert.equal(await provider.request(call),'0x'+'0'.repeat(64));
 await assert.rejects(provider.request({...call,params:[{...call.params[0],data:'0x095ea7b3'},'latest']}));await assert.rejects(provider.request({...call,params:[{...call.params[0],to:agent},'latest']}));
});
