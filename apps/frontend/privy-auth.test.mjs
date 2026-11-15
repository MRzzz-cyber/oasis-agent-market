import test from 'node:test';import assert from 'node:assert/strict';
import {issueWalletToken,privyRoute,publicWalletConfig,walletSubject} from './privy-auth.js';
const enc=new TextEncoder();
async function fixture(){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const der=await crypto.subtle.exportKey('pkcs8',pair.privateKey),jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {PRIVY_ENABLED:'true',PRIVY_APP_ID:'test-app',OASIS_AUTH_ISSUER:'https://oasis.test',OASIS_AUTH_PUBLIC_JWK:JSON.stringify(jwk),OASIS_AUTH_PRIVATE_KEY:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(der).toString('base64')+'\n-----END PRIVATE KEY-----'};
}
const sessionEnv=(env,user)=>({...env,ACCOUNTS:{idFromName:x=>x,get:()=>({fetch:async()=>user?Response.json(user):Response.json({error:'请登录'},{status:401})})}});
const req=(origin='https://oasis.test')=>new Request('https://oasis.test/api/wallet/token',{method:'POST',headers:{origin,cookie:'__Host-oasis-session='+'a'.repeat(43)}});
test('wallet identity JWT is short-lived, signed, scoped and stable without exposing email',async()=>{
 const env=await fixture(),user={id:'google-123',active:true,email:'private@example.com'};
 const result=await issueWalletToken(user,env,1000),[header,payload,sig]=result.token.split('.'),body=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(body.sub,walletSubject(user.id));assert.equal(body.aud,env.PRIVY_APP_ID);assert.equal(body.iss,env.OASIS_AUTH_ISSUER);assert.equal(body.exp-body.iat,300);assert.ok(!('email'in body));
 const key=await crypto.subtle.importKey('jwk',JSON.parse(env.OASIS_AUTH_PUBLIC_JWK),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 assert.ok(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Buffer.from(sig,'base64url'),enc.encode(header+'.'+payload)));
 const second=await issueWalletToken(user,env,1001);assert.equal(second.subject,result.subject);assert.notEqual(second.token,result.token);
});
test('config/JWKS never disclose secrets and private JWK input fails closed',async()=>{
 const env=await fixture();const cfg=await(await privyRoute(new Request('https://oasis.test/api/wallet/config'),env)).json();assert.equal(cfg.enabled,true);assert.ok(!JSON.stringify(cfg).includes('PRIVATE'));
 const keys=await(await privyRoute(new Request('https://oasis.test/.well-known/jwks.json'),env)).json();assert.equal(keys.keys[0].kty,'RSA');assert.ok(!('d'in keys.keys[0]));
 assert.equal(publicWalletConfig({...env,OASIS_AUTH_PUBLIC_JWK:JSON.stringify({...JSON.parse(env.OASIS_AUTH_PUBLIC_JWK),d:'secret'})}).enabled,false);
 assert.equal(publicWalletConfig({...env,PRIVY_ENABLED:'false'}).enabled,false);
});
test('token endpoint rejects cross-origin, unauthenticated, inactive and disabled users',async()=>{
 const env=await fixture();assert.equal((await privyRoute(req('https://other.test'),env)).status,403);
 assert.equal((await privyRoute(req(),sessionEnv(env,null))).status,401);assert.equal((await privyRoute(req(),sessionEnv(env,{id:'u',active:false}))).status,403);
 assert.equal((await privyRoute(req(),sessionEnv({...env,PRIVY_ENABLED:'false'},{id:'u',active:true}))).status,503);
 const response=await privyRoute(req(),sessionEnv(env,{id:'u',active:true}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('mismatched signing keys cannot issue wallet identity tokens',async()=>{
 const env=await fixture(),other=await fixture();await assert.rejects(issueWalletToken({id:'u',active:true},{...env,OASIS_AUTH_PRIVATE_KEY:other.OASIS_AUTH_PRIVATE_KEY}));
});
