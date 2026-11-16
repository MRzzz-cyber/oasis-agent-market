# Polymarket in-site purchases

The existing Oasis wallet remains the owner/signer. The SDK resolves its existing deterministic Deposit Wallet or provisions the current deterministic Deposit Wallet through Polymarket's Relayer. It does not regenerate the Oasis wallet, Google identity, Privy application, authentication keys or issuer.

## Production configuration

Create a Builder profile and credentials at https://polymarket.com/settings?tab=builder . Configure these Cloudflare Worker Secrets (never commit values):
- POLYMARKET_BUILDER_API_KEY
- POLYMARKET_BUILDER_SECRET
- POLYMARKET_BUILDER_PASSPHRASE

GET /api/predictions/trading-status exposes only readiness, the Polygon chain, pUSD symbol and integration version. Missing credentials disable authentication and purchase actions. Presence means configured, not that credentials or Relayer privileges have been validated.

## User flow

Choose a Polymarket outcome, connect the existing wallet on Polygon (137), connect the platform trading account, and review maximum pUSD spend, minimum shares, maximum unit price, fee reserve and account balance. The first purchase can require a platform authentication signature, exact-amount pUSD approval and order signature. Do not promise a single wallet popup.

Orders are FOK, with a bounded price and no resting remainder. Fees are conservatively reserved within the maximum spend. The integration uses SDK order creation and a single explicit post; it never invokes the SDK's automatic unlimited-allowance recovery.

Funding cards show the controlled platform Deposit Wallet address and an EIP-681 QR pinned to Polygon pUSD. Arbitrum USDC and the owner's EOA balance are not platform collateral. This release does not silently bridge, wrap tokens, deposit or withdraw funds. Automatic bridge execution and Kalshi buying remain separate work.

## Authorization and recovery

POST /api/predictions/relay requires same-origin, an activated Google session and a fresh wallet ownership signature. Only fixed-factory WALLET-CREATE requests or signed Deposit Wallet batches of exact-amount pUSD approvals to pinned exchange/negative-risk contracts are relayed. Builder credentials never leave the server. CLOB credential creation and order posting happen directly from the user's browser to the official host; no regional trading restriction is bypassed.

All monetary policy uses integer atomic units. No generic transfers, arbitrary contracts, ERC-1155 operator grants, session keys or model-generated transactions are exposed. The embedded-wallet provider validates every armed typed-data structure against the reviewed intent and checks the active identity and chain before and after signing.

The existing principal-wallet cross-tab lock covers prediction execution as well as ETH/funding routes. Journal records are written before signatures and persist order hashes before posting; credentials and signatures are never journaled. Unknown sends block new spending across reloads. A matched response remains pending until the authenticated order identity, platform fill settlement and successful Polygon settlement receipts are checked. This is platform-reported fill evidence plus onchain transaction status, not an independent reconstruction of all outcome-token transfer logs.

Approval recovery checks the original Relayer request and exact pUSD Approval logs. A submission lost before receiving its identifier cannot be declared absent from a balance change or a 404. Such an uncertain request remains held; it is not retried automatically.

## Acceptance

Tests use fixtures, ephemeral test-only signatures and fake transports. Browser screenshots explicitly identify fixture data. Live smoke reads only public markets, order books and fee metadata. None of these checks establishes that a production user has completed a real trade. Production credential validity, actual wallet consent and a small user-reviewed purchase remain user-session acceptance.
