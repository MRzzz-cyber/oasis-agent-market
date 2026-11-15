// Build with esbuild 0.25.12: --bundle --format=esm --platform=browser
// --outfile=apps/frontend/vendor/hl-agent.js (viem is a declared dependency).
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {createL1ActionHash} from '../apps/frontend/vendor/hl-hash.js';

export function createTestnetSigner() {
  const account=privateKeyToAccount(generatePrivateKey());
  let used=false;
  return {
    address:account.address,
    async signOrder(packet) {
      const order=packet.action?.orders?.[0];
      if(used || packet.action?.type!=='order' || packet.action.orders.length!==1 ||
        packet.action.grouping!=='na' || !order?.b || order.r || order.a<10000 ||
        order.t?.limit?.tif!=='Ioc' || packet.expiresAfter<=Date.now() ||
        packet.typed?.domain?.chainId!==1337 || packet.typed.message?.source!=='b' ||
        packet.typed.message.connectionId!==createL1ActionHash(packet))throw Error('测试签名请求无效或已使用');
      const atomic=value=>{
        if(!/^\d{1,14}(\.\d{1,8})?$/.test(value))throw Error('测试金额格式无效');
        const [whole,part='']=value.split('.');
        return BigInt(whole)*100000000n+BigInt(part.padEnd(8,'0'));
      };
      if(atomic(order.p)*atomic(order.s)!==100000000000000000n)throw Error('测试订单必须为 10 USDC');
      used=true;
      return account.signTypedData(packet.typed);
    }
  };
}
