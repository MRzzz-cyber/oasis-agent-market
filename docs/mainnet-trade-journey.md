# Wallet-native ETH purchase

The production conversation entry `mainnet-trade.js` re-exports `arbitrum-swap.js`. It no longer renders or requests a Hyperliquid order quote. The card reads native Circle USDC from the current Arbitrum wallet, obtains a Uniswap V3 quote and returns native ETH to that same wallet. No Hyperliquid deposit, balance, API agent or account-mode change is required.

## User flow

1. Connect the existing wallet. Switch to Arbitrum One only after an explicit wallet request.
2. Select USDC amount, including a 1 USDC option. The card displays wallet USDC, expected ETH, minimum ETH, 0.5% slippage, pool fee already reflected in the quote, recipient and native ETH for gas.
3. Click purchase. If allowance is insufficient, the wallet confirms an approval limited to exactly this purchase amount. Wait for the original approval receipt and verify allowance.
4. Recheck the same reviewed quote, simulate the swap, estimate its gas and request wallet confirmation. No replacement minimum output or amount is chosen. A stale quote requires another review.
5. Display the original transaction hash and reconcile the chain receipt. A pending or unknown result blocks repeated submission, with a read-only original-transaction check.

Approval and swap are two distinct on-chain transactions on first use. They can require two wallet confirmations. The initial gas estimate covers approval when approval is needed; the swap gas is estimated after allowance is confirmed and is shown by the wallet. Existing allowance permits going directly to swap. There is no unlimited approval or Hyperliquid session signature.

## Pinned route

- Arbitrum One, chain 42161.
- Native USDC `0xaf88d065e77c8cc2239327c5edb3a432268e5831`.
- WETH `0x82af49447d8a07e3bd95bd0d56f35241523fbab1`.
- Uniswap V3 SwapRouter `0xe592427a0aece92de3edee1f18e0157c05861564`.
- Quoter `0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6` and factory `0x1f98431c8ad98523631ae4a59f267346ea31f984`.

Read contract code and verify the router's factory and WETH identity. Query direct pools at fees 500 and 3000, selecting the better returned output. This compares these two direct pools only; it is not a claim of globally optimal routing. The swap atomically calls exactInputSingle with router recipient, then unwrapWETH9 with the current wallet recipient. There is no arbitrary calldata, recipient or route. Independent viem ABI fixtures verify the entire wire encoding and event selectors.

A wallet with 12.159122 USDC can fund a 10 USDC input, provided it has sufficient ETH for gas. Its separate Hyperliquid balance does not participate. USDC.e, other chains and tokens are not automatically substituted.

## Persistence and verification

Journal namespace: `oasis-arbitrum-swap-v1:<wallet>`. Persist before wallet send, preserve hashes and hold uncertain outcomes. Never resubmit an unknown request. Reconciliation checks original transaction input, pinned destination, account and zero native value; a successful swap also requires the exact USDC spend to the selected pool and sufficient WETH Withdrawal from the router. Receipt-backed execution is Arbitrum L2 inclusion, not a finality guarantee.

All spending uses the account's shared cross-tab lock. Legacy unresolved funding/order records continue to block conflicting work. Existing identity, wallet addresses and issuer configuration are preserved. The inline wallet swap journal is the authoritative new receipt store; old Hyperliquid history remains legacy.

`npm test` covers golden ABI, exact approval, already-approved flow, changed price/network/account, expiry, wallet cancellation, storage failure, pending/unknown sends, embedded-wallet intent restrictions and actual production entry routing. CI also builds wallet and Worker bundles. `Arbitrum read-only quote` independently reads real pinned contracts and quotes 1 USDC without any approval, signature or broadcast. Passing these checks does not prove a user-signed mainnet fill or browser UX; the user performs actual wallet confirmation.

Official contract references are Uniswap v3-periphery SwapRouter, Quoter, PeripheryPayments and Multicall, with Circle's native-USDC registry. `/api/release` reports `purchaseFlow: arbitrum-wallet-swap-v17` and `inputBalance: wallet`; assets use no-store.
