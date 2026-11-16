// Wallet adapters can return already-decoded numeric quantities. Never coerce unsafe floats or objects.
export function rpcQuantity(value,method='RPC'){
 let result;
 if(typeof value==='bigint')result=value;
 else if(typeof value==='number'&&Number.isSafeInteger(value))result=BigInt(value);
 else if(typeof value==='string'&&(/^(?:0x[0-9a-f]+|\d+)$/i.test(value)))result=BigInt(value);
 else throw Object.assign(Error(method+' 返回了无法识别的费用数据，请刷新报价'),{code:'INVALID_RPC_QUANTITY',method});
 if(result<0n||result>=2n**256n)throw Object.assign(Error(method+' 返回的费用数值超出范围，请刷新报价'),{code:'INVALID_RPC_QUANTITY',method});
 return '0x'+result.toString(16);
}
