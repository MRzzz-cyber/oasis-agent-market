# Polymarket crosschain funding

Uses the official Polymarket Bridge to convert native Circle USDC on Arbitrum/Base/Optimism into Polygon pUSD in the owned Deposit Wallet. LI.FI identifies pUSD, but token listing alone does not establish an executable account-funding route. This version uses one reviewed provider, 2–1000 USDC per transfer. Current supported-assets minimums are checked again before submission. Source ETH is required.

The user reviews amount, estimated pUSD, cost, time, source gas reserve and receiving account, then confirms an exact ERC20 transfer. Quotes are estimates; the direct deposit API does not enforce an onchain minimum output. Funding is separate from the purchase budget and never places an order. After arrival the user returns to the original market and refreshes its price before confirming the purchase.

Same-origin Google session, fresh wallet ownership and deterministic account checks precede address registration. A purpose-separated HMAC under the existing Builder secret attests the quote. Embedded wallets accept only the exact transfer. No ERC20 allowances or arbitrary calldata, no new Privy identity, no keys in logs/journals.

Persist before requesting a wallet send; save its hash immediately. All routes share the principal lock and pending guard. Unknown/pending/FAILED outcomes never trigger retries or clear from balance changes. Users can attach an original hash for read-only recovery. Completion checks the exact source transaction/log, a unique new matching provider record and actual pUSD destination receipt logs. The API status schema lacks a source hash, so bridge association depends on its account-specific chain/token/amount/time record; ambiguity remains held. At most 300 records per check. Source inclusion does not imply chain finality.

Official docs verified November 17, 2026:
- https://docs.polymarket.com/trading/bridge/deposit.md
- https://docs.polymarket.com/trading/bridge/quote.md
- https://docs.polymarket.com/trading/bridge/status.md
- https://docs.polymarket.com/api-reference/bridge/create-bridge-addresses.md

Fixtures use synthetic wallets and transports. Live checks only read supported assets and estimates; no real user transfer, approval, account deployment or trade is executed.
