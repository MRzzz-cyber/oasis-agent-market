// Run locally; writes sensitive material to ignored files, never stdout.
import {mkdir,writeFile,access} from 'node:fs/promises';
const dir=new URL('../.privy-setup/',import.meta.url);
await mkdir(dir,{recursive:true,mode:0o700});
const keyFile=new URL('private-key.pem',dir);
try{await access(keyFile);throw Error('已有身份密钥，已停止以免更换用户信任配置。请保管原密钥。');}catch(e){if(e.code!=='ENOENT')throw e;}
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const der=await crypto.subtle.exportKey('pkcs8',pair.privateKey),pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
const pem='-----BEGIN PRIVATE KEY-----\n'+Buffer.from(der).toString('base64').match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----\n';
await writeFile(keyFile,pem,{mode:0o600,flag:'wx'});
await writeFile(new URL('public-jwk.json',dir),JSON.stringify({kty:pub.kty,n:pub.n,e:pub.e,alg:'RS256',use:'sig',kid:'oasis-auth-v1'}),{mode:0o600,flag:'wx'});
console.log('已生成 .privy-setup/private-key.pem 和 public-jwk.json。私钥仅用于 Cloudflare Secret，不能提交 Git。已有密钥时不会覆盖。');
