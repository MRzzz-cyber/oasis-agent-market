// Public GETs only: never authenticates, deploys wallets, signs or posts orders.
import {createPublicClient} from '@polymarket/client';
import {fetchMarketInfo} from '@polymarket/client/actions';
import {publicMarketFetch} from '../apps/frontend/prediction-markets.js';
import {purchasePreview} from '../apps/frontend/polymarket-purchase-core.js';
const client=createPublicClient({fetch:publicMarketFetch(async(input,init)=>{
 const request=new Request(input,init);if(request.method!=='GET')throw Error('Unexpected non-public write');
 return fetch(request);
})});
const page=await client.search({q:'Bitcoin',pageSize:3,eventsStatus:'active',keepClosedMarkets:0},{retries:0,timeout:10000}).firstPage();
let good=0;for(const row of page.items.events.flatMap(e=>e.markets||[])){
 if(!row.state.acceptingOrders)continue;
 try{
 const market=await client.fetchMarket({id:row.id},{retries:0});
 const assetId=market.version==='v2'?market.outcomes.yes.positionId:market.outcomes.yes.tokenId;
 const [book,info]=await Promise.all([client.fetchOrderBook({assetId},{retries:0}),fetchMarketInfo(client,{conditionId:market.conditionId},{retries:0})]);
 const q=purchasePreview({market,book,feeInfo:info.feeInfo,budget:'10',outcome:'yes'});
 console.log('PASS public purchase metadata',JSON.stringify({market:q.marketId,protocol:q.protocol,collateral:q.collateral,chainId:q.chainId,cap:q.budgetAtomic,minimumShares:q.minimumSharesAtomic,feeRate:q.feeRate,readOnly:true}));good++;break;
 }catch(error){console.log('PUBLIC PREVIEW skipped',row.id,error.name,error.message);}
}
if(!good)throw Error('No live market passed the purchase preflight');
