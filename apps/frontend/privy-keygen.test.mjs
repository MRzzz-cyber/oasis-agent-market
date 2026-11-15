import test from 'node:test';import assert from 'node:assert/strict';
import {generateIdentityKeys,samePublicKey} from './privy-keygen.js';
test('local setup produces matching PEM/private and public-only JWKS material',async()=>{
 const {privateKey,publicJwk}=await generateIdentityKeys();assert.ok(!('d'in publicJwk));assert.equal(publicJwk.kid,'oasis-auth-v1');
 const der=Buffer.from(privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,''),'base64');
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const pub=await crypto.subtle.importKey('jwk',publicJwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);const data=new TextEncoder().encode('test identity');
 assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',pub,await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,data),data));assert.ok(samePublicKey(publicJwk,publicJwk));assert.ok(!samePublicKey(publicJwk,{...publicJwk,n:'different'}));
});
