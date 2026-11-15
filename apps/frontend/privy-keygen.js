// Local setup only: callers choose whether to copy/download. No network or storage.
export async function generateIdentityKeys(cryptoImpl=crypto){
 const pair=await cryptoImpl.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pkcs8=await cryptoImpl.subtle.exportKey('pkcs8',pair.privateKey),key=await cryptoImpl.subtle.exportKey('jwk',pair.publicKey);
 const encoded=btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
 return {privateKey:'-----BEGIN PRIVATE KEY-----\n'+encoded.match(/.{1,64}/g).join('\n')+'\n-----END PRIVATE KEY-----\n',publicJwk:{kty:key.kty,n:key.n,e:key.e,alg:'RS256',use:'sig',kid:'oasis-auth-v1'}};
}
export function samePublicKey(a,b){return Boolean(a&&b&&a.kty==='RSA'&&b.kty==='RSA'&&a.n===b.n&&a.e===b.e&&a.kid===b.kid);}
