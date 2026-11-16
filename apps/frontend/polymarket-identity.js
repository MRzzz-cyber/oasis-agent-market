import {concatHex,encodeAbiParameters,getCreate2Address,keccak256,toHex} from 'viem';
import {address,FACTORY,BEACON} from './polymarket-purchase-core.js';
export function depositWallets(owner){
 owner=address(owner);const args=encodeAbiParameters([{type:'address'},{type:'bytes32'}],[FACTORY,('0x'+owner.slice(2).padStart(64,'0'))]),salt=keccak256(args),length=BigInt((args.length-2)/2);
 const make=(prefix,implementation,parts)=>address(getCreate2Address({from:FACTORY,salt,bytecodeHash:keccak256(concatHex([toHex(prefix+(length<<56n),{size:10}),implementation,...parts,args]))}));
 return [make(0x6100523d8160233d3973n,BEACON,['0x60195155f3363d3d373d3d363d602036600436635c60da','0x1b60e01b36527fa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6c','0xb3582b35133d50545afa5036515af43d6000803e604d573d6000fd5b3d6000f3']),make(0x61003d3d8160233d3973n,'0x58ca52ebe0dadfdf531cde7062e76746de4db1eb',['0x6009','0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076','0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3'])];
}
