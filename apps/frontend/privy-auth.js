import {account} from './auth.js';
const encoder=new TextEncoder();
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function publicWalletConfig(env){
 let issuer='';try{const u=new URL(env.OASIS_AUTH_ISSUER);if(u.protocol==='https:'&&u.origin===env.OASIS_AUTH_ISSUER)issuer=u.origin;}catch{}
 let jwk;try{const key=JSON.parse(env.OASIS_AUTH_PUBLIC_JWK);if(key.kty==='RSA'&&typeof key.n==='string'&&typeof key.e==='string'&&!['d','p','q','dp','dq','qi'].some(k=>k in key))jwk={kty:'RSA',n:key.n,e:key.e,alg:'RS256',use:'sig',kid:env.OASIS_AUTH_KEY_ID||'oasis-auth-v1'};}catch{}
 const configured=Boolean(issuer&&jwk&&env.PRIVY_APP_ID&&env.OASIS_AUTH_PRIVATE_KEY);
 return {enabled:configured&&env.PRIVY_ENABLED==='true',configured,appId:configured?env.PRIVY_APP_ID:null,clientId:configured?(env.PRIVY_CLIENT_ID||null):null,issuer,jwk};
}
export function walletSubject(id){return 'oasis:google:'+id;}
export async function issueWalletToken(user,env,now=Math.floor(Date.now()/1000)){
 const config=publicWalletConfig(env);if(!config.enabled)throw Error('Privy 尚未启用');
 if(!user?.active||typeof user.id!=='string'||!user.id)throw Error('账号尚未激活');
 const pem=env.OASIS_AUTH_PRIVATE_KEY.replaceAll('\\n','\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const der=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const subject=walletSubject(user.id);
 const header=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT',kid:config.jwk.kid})));
 const payload=b64(encoder.encode(JSON.stringify({iss:config.issuer,aud:config.appId,sub:subject,iat:now,exp:now+300,jti:crypto.randomUUID()})));
 const input=encoder.encode(header+'.'+payload);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,input);
 // A mismatched public/private configuration must never mint unusable identity tokens.
 const verifyKey=await crypto.subtle.importKey('jwk',config.jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',verifyKey,signature,input))throw Error('身份签名配置不匹配');
 return {token:header+'.'+payload+'.'+b64(signature),subject,expiresAt:(now+300)*1000};
}
export async function privyRoute(request,env){
 const path=new URL(request.url).pathname,config=publicWalletConfig(env);
 if(path==='/api/wallet/config'&&request.method==='GET')return reply({enabled:config.enabled,appId:config.enabled?config.appId:null,clientId:config.enabled?config.clientId:null,mode:'user-controlled',network:'hyperliquid-mainnet',executionEnabled:false,signingNetwork:'hyperliquid-testnet'});
 if(path==='/.well-known/jwks.json'&&request.method==='GET')return config.jwk?reply({keys:[config.jwk]}):reply({error:'身份公钥尚未配置'},503);
 if(path!=='/api/wallet/token')return reply({error:'接口不存在'},404);
 if(request.method!=='POST')return reply({error:'仅支持 POST'},405);
 if(request.headers.get('origin')!==config.issuer||new URL(request.url).origin!==config.issuer)return reply({error:'请求来源无效'},403);
 if(!config.enabled)return reply({error:'账号钱包暂未启用，请连接已有钱包'},503);
 const session=await account(request,env);if(!session.ok)return session;
 const user=await session.json();if(!user.active)return reply({error:'请先激活 Oasis 账号'},403);
 try{return reply(await issueWalletToken(user,env));}catch{return reply({error:'账号钱包身份服务暂不可用，请稍后重试'},503);}
}
