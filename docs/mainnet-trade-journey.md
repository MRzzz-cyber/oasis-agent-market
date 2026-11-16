# Mainnet ETH purchase journey

The purchase card shows an explicit `购买 ETH` action in every state. Loading disables it temporarily. A failed quote leaves `购买 ETH · 获取报价`, which only retries the quote and never signs or submits. Insufficient funds, an unsupported network, a budget below the venue minimum or a pending original order leaves a visible disabled action and a specific reason. A valid reviewed quote enables `购买 ETH · 上限 … USDC`.

On November 16, 2026 the user asked to defer complex funding and permission-management content. The purchase card therefore contains no funding form or expandable rules section. A short notice beside an enabled purchase button still discloses that initial API-agent authorization covers account trading beyond the displayed order budget, and provides revocation guidance.

## Two balances, two ledgers

The card reads both chain-wallet native USDC and Hyperliquid trading cash, and labels the source explicitly. The chain-wallet read has a six-second total deadline and is informational: failure to read it does not block an independently funded Hyperliquid order. Wallet and network checks reject stale reads.

For example, the same wallet can hold 12.159122 USDC on Arbitrum while its Hyperliquid trading account holds 4.8 USDC. These values are not interchangeable and are never added or substituted to enable an order. This implementation trades Hyperliquid UETH/USDC; it does not execute an Arbitrum USDC-to-ETH DEX swap or debit chain-wallet USDC directly. Bridge funding or a separately implemented wallet-native swap route would be needed to spend chain-wallet assets. Changing display labels cannot remove this requirement.

Independent spot accounts use USDC total minus hold. Unified cash availability is the smaller of unheld USDC and token-0 `tokenToAvailableAfterMaintenance`. Missing or malformed maintenance data, portfolio-margin flags, borrowing or lending supply fail closed. A fresh order preflight must preserve the reviewed account mode. No automatic account conversion, bridging or class transfer occurs.

## Purchase execution

After review, one click obtains the account's cross-tab lock and validates the displayed order. It checks fresh funds and prices before requesting wallet authorization. After the user confirms, the browser verifies the authorization and rechecks the same reviewed order, then signs and submits one IOC buy with unchanged quantity, cap and limit. A changed wallet, network, account mode, insufficient balance, expired quote or ask above the reviewed limit stops submission. Refreshing a quote requires another purchase click; it never trades a replacement quote silently.

Temporary one-use signing keys remain only in page memory. Orders are journaled before submission and uncertain outcomes block further orders until reconciliation, without resubmission. Existing funding modules and their durable pending records are retained; their safety checks continue to block trading if an unresolved funding operation exists. Funding is not automatically chained into a purchase.

Amounts are exact decimal strings. A 10 USDC budget is not a guarantee of meeting market precision and minimum notional. Budgets never increase automatically. Existing Privy IDs, JWT audience, identity keys and wallet addresses are unchanged; issuer remains `https://oasistrade.app`.

## Verification

Run `npm test`, `npm run build:wallet` and the Worker bundle check. Fixtures cover visible loading/error/blocked/ready actions, separate 12.159122 wallet and 4.8 exchange balances, retry without signing, wallet rejection, double clicks, cross-tab contention, storage failure, changes during confirmation, unified cash bounds and pending-order reconciliation. A passing CI run is not evidence of live wallet interaction, deployment or a mainnet fill. Those require separate verification.
