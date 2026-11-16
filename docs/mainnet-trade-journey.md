# Mainnet ETH purchase journey

The conversation opens a UETH/USDC spot quote automatically for the selected wallet. The card displays the Hyperliquid execution network, current wallet signing network, ask, maximum execution price, quantity, maximum cost, fee reserve and available trading cash. The user reviews these and clicks `购买 ETH` once. There is no separate consent checkbox or authorize-session button. The visible notice beside the purchase button discloses that the initial wallet signature authorizes an API agent whose protocol permissions cover account trading beyond this order's budget.

That click acquires the account's cross-tab lock, validates the reviewed order and checks fresh funds and prices before requesting wallet approval. After the user confirms, the browser verifies authorization and rechecks the same reviewed order. It submits one IOC order with unchanged quantity, cap and limit. It never refreshes and trades a replacement quote silently. A quote that expires while the wallet is open, a worse ask than the limit, a changed wallet/network/account mode or missing funds stops submission. Refreshing an expired quote requires another explicit purchase click. The one-use signer remains only in page memory; protocol authorization can be revoked at Hyperliquid's API management page.

Pending orders are journaled before submission, uncertain outcomes block further orders and are reconciled without resubmission. Tests never spend real funds. Amounts are exact decimal strings; a 10 USDC choice is not a guarantee of meeting venue minimums, and budgets are never increased automatically.

## Cash-funded unified accounts

Independent spot accounts use USDC total minus hold. `unifiedAccount` uses the smaller of unheld USDC and the API's token-0 `tokenToAvailableAfterMaintenance` allowance. Missing, duplicate, negative or malformed allowance data stops the quote. Portfolio-margin flags and borrowing or lending supply also stop unified cash quotes. Collateral value is not treated as cash and no borrowing is requested. A fresh quote must preserve the reviewed account mode. Oasis never automatically converts an account, moves perp funds or bridges funds as part of a purchase.

A displayed balance of 4.8 USDC does not meet a roughly 10+ USDC order's minimum and fee reserve. The purchase card shows a short insufficiency message and does not automatically mount a funding form. Hyperliquid trading cash and chain-wallet assets remain distinct.

## Optional funding in Oasis

`充值 / 提款（按需打开）` is collapsed by default. The funding form is created only after the user opens this optional entry and requests it. It is not part of the normal purchase path.

- Read the selected wallet's spot balance, perp withdrawable balance and account mode.
- Deposit native Circle USDC on Arbitrum One to pinned Bridge2 `0x2df1c51e09aecf9cacb7bc98cb1742757f163df7`. The Oasis product floor is 10 USDC. Validate wallet, network, balance, bridge code and estimated gas, then send an exact ERC20 transfer without token approval. A deposit does not automatically buy ETH.
- Transfer an exact USDC amount between the same wallet's independent perp and spot accounts with `usdClassTransfer`.
- Request `withdraw3` from perp withdrawable USDC to the selected wallet on Arbitrum. Spot-to-perp transfer, when needed, is reviewed separately. Protocol acceptance and ledger evidence do not prove destination-chain arrival.
- Explicit conversion to independent mode remains an optional whole-account operation, with its own preview and confirmation. Require no positions across perp DEXes, no open orders and no borrowing or lending supply; never switch automatically.

Each funding operation needs its own 60-second preview and principal-wallet confirmation. Temporary trading keys cannot fund or withdraw. Funding and trading share a cross-tab lock. Persist pending requests before submission, hold uncertain results, do not retry automatically and do not persist signatures or secrets. Check known deposits against exact Arbitrum receipts and USDC Transfer logs; separately refresh Hyperliquid credit. Match withdrawals by original nonce. Uncertain class transfers require reconciliation, never a balance-difference guess.

Existing Privy App ID, Client ID, JWT audience, identity keys and wallet addresses remain unchanged. The configured issuer stays `https://oasistrade.app`; the old origin remains available for local history.

## Validation boundaries

Run `npm test`, `npm run build:wallet` and the Worker bundle check in CI. Fixtures cover one-click purchase, wallet rejection, double clicks, cross-tab contention, storage failure, changes during signature, unified cash bounds and pending-order reconciliation. A passing CI run is not evidence of an actual wallet interaction or mainnet fill. Deployment and real wallet UX require separate browser verification.

References: Hyperliquid official Python SDK signing and exchange implementations; `@nktkas/hyperliquid` spot state schema for `tokenToAvailableAfterMaintenance`; pinned bridge address cross-check against MetaMask constants.
